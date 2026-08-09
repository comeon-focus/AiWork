import { spawn, type ChildProcess } from 'child_process';
import { config } from '../config/index.js';
import { createEventRenderer, createLineSplitter, stripAnsi } from './codebuddyStream.js';

/** Node 20 路径前置：codebuddy 要求 Node ≥ 18，而系统默认 shell 可能是 Node 16 */
const NODE20_BIN = '/Users/howbuy/.nvm/versions/node/v20.20.2/bin';

/** 允许通过配置指定的模型白名单；非法或留空则使用 codebuddy 默认模型 */
const MODEL_WHITELIST = [
  'hy3',
  'glm-5.2',
  'glm-5.1',
  'glm-5v-turbo',
  'minimax-m3',
  'minimax-m2.7',
  'kimi-k3-1',
  'kimi-k2.7',
  'kimi-k2.6',
  'deepseek-v4-pro',
  'deepseek-v4-flash',
];

/** 单次 AICoding 最长执行时间，超时强杀 */
const RUN_TIMEOUT_MS = Number(process.env.CODEBUDDY_RUN_TIMEOUT_MS ?? 1_800_000);

/**
 * 组装 codebuddy 参数（数组形式，避免 shell 注入）：
 * -p                        非交互输出
 * --add-dir                 将工具访问限制在当前代码目录
 * --output-format stream-json --verbose   实时输出 NDJSON 事件（编译详情与成败判定的唯一依据）
 * --session-id              以任务 sessionId 作为会话 ID，父/子任务共用 → 共享对话上下文
 * --permission-mode bypassPermissions / -y   允许自动修改文件
 * [--model]                 仅当配置合法时追加
 *
 * ⚠️ 两处刻意的顺序约束，缺一不可：
 * 1. `--add-dir <directories...>` 是 commander 变长参数，若其后紧跟位置参数会被一并吞成"目录"。
 *    历史 bug：prompt 被吞掉 → codebuddy 空跑 → 打印 "<dir>/<prompt> not found" 且退出码 0
 *    → 后端误判「编译成功」而代码零改动。因此 --add-dir 后必须紧跟另一个选项。
 * 2. prompt 前加 `--` 终止选项解析，保证它一定被当作位置参数。
 * 两道防线互相独立，任一失效都不会重现该 bug。
 */
export function buildCodebuddyArgs(sessionId: string, prompt: string, repoDir: string): string[] {
  const args = [
    '-p',
    '--add-dir',
    repoDir,
    '--output-format',
    'stream-json',
    '--verbose',
    '--session-id',
    sessionId,
    '--permission-mode',
    'bypassPermissions',
    '-y',
  ];
  const model = resolveModel();
  if (model) args.push('--model', model);
  args.push('--', prompt);
  return args;
}

/** 实际生效的模型；返回 null 表示走 codebuddy 默认模型 */
export function resolveModel(): string | null {
  const model = config.ai.model?.trim();
  return model && MODEL_WHITELIST.includes(model) ? model : null;
}

/** 一次 AICoding 运行的最终结果 */
export interface AICodingResult {
  /** 唯一的成败出口 */
  ok: boolean;
  /** ok=false 时的失败原因（已压成单行，≤500 字符） */
  reason: string | null;
  exitCode: number | null;
  spawnError: string | null;
  timedOut: boolean;
  gotResult: boolean;
  resultSubtype: string | null;
  durationMs: number | null;
  numTurns: number | null;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  /** 模型声称改动的文件（与 git 实测互为印证） */
  touchedFiles: string[];
}

function normalizeReason(s: string): string {
  return s.replace(/\s*\n\s*/g, ' / ').trim().slice(0, 500);
}

/** 在跑的子进程，供进程退出时统一收割，避免留下孤儿 codebuddy */
const running = new Set<ChildProcess>();

/** 进程退出前杀掉所有在跑的 codebuddy 子进程 */
export function killAllRuns(): void {
  for (const c of running) c.kill('SIGTERM');
  running.clear();
}

export interface RunAICodingHooks {
  /** 每渲染出一行人类可读日志回调一次（不含换行）；必须同步且不抛异常 */
  onLine?: (line: string) => void;
  onDone: (result: AICodingResult) => void;
}

/**
 * 以子进程方式启动 codebuddy 执行代码修改（不阻塞当前请求）。
 * stdout 按 NDJSON 逐行解析：既产出编译详情日志，也是判定成败的唯一依据
 * —— 退出码不可信（空跑场景就是 exit 0），只用于装饰失败原因。
 */
export function runAICoding(
  sessionId: string,
  prompt: string,
  repoDir: string,
  hooks: RunAICodingHooks,
): ChildProcess {
  const bin = config.ai.codebuddyBin;
  const args = buildCodebuddyArgs(sessionId, prompt, repoDir);
  const env = {
    ...process.env,
    PATH: `${NODE20_BIN}:${process.env.PATH ?? ''}`,
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    TERM: 'dumb',
  };
  // stdin 置 ignore：杜绝子进程等待交互式输入而永久挂起
  const child = spawn(bin, args, { cwd: repoDir, env, stdio: ['ignore', 'pipe', 'pipe'] });
  running.add(child);

  const renderer = createEventRenderer(repoDir);
  const emit = (line: string) => {
    try {
      hooks.onLine?.(line);
    } catch (e) {
      console.error('[codebuddy] 日志写入失败:', (e as Error).message);
    }
  };

  let stderrTail = '';
  let timedOut = false;
  let settled = false;

  const outSplitter = createLineSplitter((l) => {
    for (const rendered of renderer.render(l)) emit(rendered);
  });
  const errSplitter = createLineSplitter((l) => emit(renderer.line('ERR', l)));

  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (c: string) => outSplitter.push(c));
  child.stderr?.on('data', (c: string) => {
    stderrTail = (stderrTail + stripAnsi(c)).slice(-8192);
    errSplitter.push(c);
  });

  const killTimer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 10_000).unref();
  }, RUN_TIMEOUT_MS);

  const finish = (patch: { exitCode?: number | null; spawnError?: string | null }) => {
    // ENOENT 时 error 与 close 都会触发，必须去重
    if (settled) return;
    settled = true;
    clearTimeout(killTimer);
    running.delete(child);
    const agg = renderer.finalize();
    const exitCode = patch.exitCode ?? null;
    const spawnError = patch.spawnError ?? null;

    let ok = false;
    let reason: string | null = null;
    if (spawnError) {
      reason = `codebuddy 启动失败：${spawnError}`;
    } else if (timedOut) {
      reason = `执行超时（${Math.round(RUN_TIMEOUT_MS / 60000)} 分钟），已强制终止`;
    } else if (agg.gotResult && !agg.isError && agg.resultSubtype === 'success') {
      ok = true;
      if (exitCode !== 0) {
        console.warn(`[codebuddy] result 成功但退出码为 ${exitCode}，以 result 事件为准`);
      }
    } else if (agg.gotResult) {
      const tail = agg.resultText ? `：${agg.resultText.slice(0, 300)}` : '';
      reason = `codebuddy 返回 ${agg.resultSubtype ?? 'error'}${tail}`;
    } else {
      // 关键兜底：空跑就属于「exit 0 但没有 result 事件」，必须判失败
      const tail = stderrTail ? `，stderr：${stderrTail.slice(-300)}` : '';
      reason = `未收到 result 事件（退出码 ${exitCode}）${tail}`;
    }

    hooks.onDone({
      ok,
      reason: reason == null ? null : normalizeReason(reason),
      exitCode,
      spawnError,
      timedOut,
      gotResult: agg.gotResult,
      resultSubtype: agg.resultSubtype,
      durationMs: agg.durationMs,
      numTurns: agg.numTurns,
      inputTokens: agg.inputTokens,
      outputTokens: agg.outputTokens,
      toolCalls: agg.toolCalls,
      touchedFiles: agg.touchedFiles,
    });
  };

  child.on('error', (err) => {
    console.error('[codebuddy] 启动失败:', err.message);
    finish({ spawnError: err.message, exitCode: null });
  });
  // 用 close 而非 exit：close 在 stdio 完全排干后才触发
  child.on('close', (code) => {
    outSplitter.flush();
    errSplitter.flush();
    finish({ exitCode: code });
  });

  return child;
}
