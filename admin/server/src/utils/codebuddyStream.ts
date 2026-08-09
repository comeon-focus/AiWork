import path from 'path';

/** 单行日志最大长度，超出截断（与 operLog 中间件保持一致的量级） */
const LINE_MAX = 4000;
/** thinking 内容只保留开头一小段：它是最大的文本来源，但完全丢掉又会让长时间静默看不出进展 */
const THINK_MAX = 200;

const ANSI_RE = /\x1B\[[0-9;]*[A-Za-z]/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * 按 \n 切行，内部保留跨 chunk 的残句。
 * 必须配合 stream.setEncoding('utf8')：让 Node 的 StringDecoder 处理跨 chunk 的多字节字符。
 */
export function createLineSplitter(onLine: (line: string) => void) {
  let buf = '';
  return {
    push(chunk: string) {
      buf += chunk;
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        if (line.trim()) onLine(line);
      }
      // 防御：异常情况下没有换行的巨量输出不能让 buf 无限增长
      if (buf.length > 1_000_000) {
        onLine(buf);
        buf = '';
      }
    },
    /** 流结束时调用：result 事件常常没有结尾换行 */
    flush() {
      const rest = buf;
      buf = '';
      if (rest.trim()) onLine(rest);
    },
  };
}

/** 渲染器聚合出的运行指标 */
export interface RenderAgg {
  gotResult: boolean;
  isError: boolean;
  resultSubtype: string | null;
  resultText: string | null;
  durationMs: number | null;
  numTurns: number | null;
  totalCostUsd: number | null;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  toolCounts: Record<string, number>;
  /** 模型「声称」改动的文件（与 git 实测互为印证） */
  touchedFiles: string[];
}

interface ToolUseEvent {
  type: string;
  name?: string;
  input?: Record<string, unknown>;
  id?: string;
  text?: string;
  thinking?: string;
  tool_use_id?: string;
  is_error?: boolean;
  content?: unknown;
}

const EDIT_TOOLS = new Set(['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

function firstStringField(input: Record<string, unknown> | undefined, max: number): string {
  if (!input) return '';
  for (const v of Object.values(input)) {
    if (typeof v === 'string' && v.trim()) return truncate(oneLine(v), max);
  }
  return '';
}

function ts(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** TAG 固定 6 字符左对齐，保证日志列对齐、可 grep */
function line(tag: string, text: string): string {
  return `[${ts()}] ${tag.padEnd(6)} ${truncate(stripAnsi(text), LINE_MAX)}`;
}

/**
 * 把 codebuddy 的 stream-json（NDJSON）事件渲染成人类可读日志行。
 * 返回的渲染器带跨事件状态（tool_use_id → 工具名、token 累计），一次运行一个实例。
 */
export function createEventRenderer(repoDir: string) {
  const agg: RenderAgg = {
    gotResult: false,
    isError: false,
    resultSubtype: null,
    resultText: null,
    durationMs: null,
    numTurns: null,
    totalCostUsd: null,
    inputTokens: 0,
    outputTokens: 0,
    toolCalls: 0,
    toolCounts: {},
    touchedFiles: [],
  };
  /** tool_use_id → 展示名，用于把 tool_result 归位到对应工具 */
  const toolById = new Map<string, string>();
  const touched = new Set<string>();

  const rel = (p: unknown): string => {
    if (typeof p !== 'string' || !p) return '';
    const r = path.relative(repoDir, p);
    return !r || r.startsWith('..') ? p : r;
  };

  function formatTool(name: string, input: Record<string, unknown> | undefined): string {
    if (EDIT_TOOLS.has(name)) return `${name}(${rel(input?.file_path) || '?'})`;
    if (name === 'Bash') return `Bash: ${truncate(oneLine(String(input?.command ?? '')), 120)}`;
    if (name === 'Grep') {
      const at = input?.path ? ` @ ${rel(input.path)}` : '';
      return `Grep(${String(input?.pattern ?? '')}${at})`;
    }
    if (name === 'Glob') return `Glob(${String(input?.pattern ?? '')})`;
    if (name === 'Agent' || name === 'Task') {
      return `${name}(${String(input?.description ?? input?.subagent_type ?? '')})`;
    }
    if (name === 'WebFetch' || name === 'WebSearch') {
      return `${name}(${truncate(String(input?.url ?? input?.query ?? ''), 120)})`;
    }
    return `${name}(${firstStringField(input, 80)})`;
  }

  function renderContent(blocks: unknown, role: 'assistant' | 'user'): string[] {
    if (!Array.isArray(blocks)) return [];
    const out: string[] = [];
    for (const raw of blocks) {
      const b = raw as ToolUseEvent;
      if (role === 'assistant') {
        if (b.type === 'thinking' && THINK_MAX > 0) {
          const t = oneLine(String(b.thinking ?? ''));
          if (t) out.push(line('THINK', truncate(t, THINK_MAX)));
        } else if (b.type === 'text') {
          const t = String(b.text ?? '').trim();
          if (t) out.push(line('TEXT', t));
        } else if (b.type === 'tool_use') {
          const name = String(b.name ?? '?');
          const label = formatTool(name, b.input);
          if (b.id) toolById.set(b.id, label);
          agg.toolCalls += 1;
          agg.toolCounts[name] = (agg.toolCounts[name] ?? 0) + 1;
          if (WRITE_TOOLS.has(name)) {
            const f = rel(b.input?.file_path);
            if (f) touched.add(f);
          }
          out.push(line('TOOL', label));
        }
      } else if (b.type === 'tool_result') {
        const label = (b.tool_use_id && toolById.get(b.tool_use_id)) || '工具';
        if (b.is_error) {
          // 只取首行，绝不打印 tool_result 正文（Read 的结果就是整个文件）
          const body = Array.isArray(b.content)
            ? String((b.content[0] as { text?: string } | undefined)?.text ?? '')
            : String(b.content ?? '');
          out.push(line('FAIL', `${label} -> ${truncate(oneLine(body), 200)}`));
        } else {
          out.push(line('OK', label));
        }
      }
    }
    return out;
  }

  return {
    agg,
    /** 收尾时取模型声称改动的文件列表 */
    finalize(): RenderAgg {
      agg.touchedFiles = [...touched];
      return agg;
    },
    /** 输出一条自定义日志行（供 service 追加 SYS / GIT 等信息） */
    line,
    /** 解析一行 NDJSON，返回 0~N 条待写入的日志行 */
    render(raw: string): string[] {
      const text = raw.trim();
      if (!text) return [];
      let evt: Record<string, unknown>;
      try {
        evt = JSON.parse(text) as Record<string, unknown>;
      } catch {
        // 非 JSON 输出一律保留 —— 当初 --add-dir 吞掉 prompt 时的
        // "<dir>/<prompt> not found" 就是从这里暴露的
        return [line('RAW', truncate(text, 500))];
      }
      const type = String(evt.type ?? '');

      if (type === 'system') {
        if (evt.subtype !== 'init') return []; // status 是心跳噪音
        const tools = Array.isArray(evt.tools) ? evt.tools.length : 0;
        const model = typeof evt.model === 'string' ? ` model=${evt.model}` : '';
        return [line('INIT', `codebuddy 启动 session=${String(evt.session_id ?? '')}${model} tools=${tools}`)];
      }

      // 内部撤销快照，可达数百 KB，直接丢弃
      if (type === 'file-history-snapshot') return [];

      if (type === 'assistant' || type === 'user') {
        const msg = evt.message as { content?: unknown; usage?: Record<string, number> } | undefined;
        if (type === 'assistant' && msg?.usage) {
          agg.inputTokens = Math.max(agg.inputTokens, Number(msg.usage.input_tokens ?? 0));
          agg.outputTokens += Number(msg.usage.output_tokens ?? 0);
        }
        return renderContent(msg?.content, type);
      }

      if (type === 'result') {
        agg.gotResult = true;
        agg.isError = evt.is_error === true;
        agg.resultSubtype = evt.subtype == null ? null : String(evt.subtype);
        agg.resultText = typeof evt.result === 'string' ? evt.result : null;
        agg.durationMs = evt.duration_ms == null ? null : Number(evt.duration_ms);
        agg.numTurns = evt.num_turns == null ? null : Number(evt.num_turns);
        agg.totalCostUsd = evt.total_cost_usd == null ? null : Number(evt.total_cost_usd);
        const secs = agg.durationMs == null ? '?' : (agg.durationMs / 1000).toFixed(1);
        return [
          line(
            'DONE',
            `${agg.resultSubtype ?? '?'} 用时 ${secs}s 轮次 ${agg.numTurns ?? '?'} ` +
              `工具 ${agg.toolCalls} 次 tokens ${agg.inputTokens}/${agg.outputTokens}`,
          ),
        ];
      }

      return [line('RAW', truncate(text, 500))];
    },
  };
}

export type EventRenderer = ReturnType<typeof createEventRenderer>;
