import { spawn } from 'child_process';
import { config } from '../config/index.js';

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

/**
 * 组装 codebuddy 参数（数组形式，避免 shell 注入）：
 * -p                 非交互输出
 * --session-id       以任务 sessionId 作为会话 ID，父/子任务共用 → 共享对话上下文
 * --permission-mode bypassPermissions / -y   允许自动修改文件
 * --add-dir          将工具访问限制在当前代码目录
 * [--model]          仅当配置合法时追加
 */
export function buildCodebuddyArgs(sessionId: string, prompt: string, repoDir: string): string[] {
  const args = [
    '-p',
    '--session-id',
    sessionId,
    '--permission-mode',
    'bypassPermissions',
    '-y',
    '--add-dir',
    repoDir,
  ];
  const model = config.ai.model?.trim();
  if (model && MODEL_WHITELIST.includes(model)) {
    args.push('--model', model);
  }
  args.push(prompt);
  return args;
}

/**
 * 以子进程方式启动 codebuddy 执行代码修改（不阻塞当前请求）。
 * 进程退出后通过 onDone 回调通知（用于把 codingStatus 置回『暂无』/『编译成功』/『编译失败』）。
 */
export function runAICoding(
  sessionId: string,
  prompt: string,
  repoDir: string,
  onDone: (code: number | null) => void,
): void {
  const bin = config.ai.codebuddyBin;
  const args = buildCodebuddyArgs(sessionId, prompt, repoDir);
  const env = { ...process.env, PATH: `${NODE20_BIN}:${process.env.PATH ?? ''}` };
  const child = spawn(bin, args, { cwd: repoDir, env });
  child.on('error', (err) => {
    console.error('[codebuddy] 启动失败:', err.message);
    onDone(null);
  });
  child.on('close', (code) => {
    onDone(code ?? 0);
  });
}
