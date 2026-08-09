import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../../db/index.js';
import { AiCompileLog, type AiCompileStatus, type AiCompileTaskType } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import type { AICodingResult } from '../../utils/codebuddy.js';
import type { RepoChange } from '../../utils/git.js';

/** 定时刷盘间隔：小于前端 1.5s 轮询周期，保证最坏可见延迟 ~2.5s */
const FLUSH_MS = 1000;
/** 累计到该字符数立刻刷盘 */
const FLUSH_CHARS = 8 * 1024;
/** 单条记录日志上限（码点），约 3MB UTF-8 */
const MAX_CHARS = 1_000_000;
/** tail 单次最多返回的字符数 */
const MAX_TAIL = 200_000;

/** 列表/详情一律排除大字段：10 行 × 最大 3MB 会直接把响应打爆 */
const LIST_EXCLUDE = ['content', 'changedDetail', 'prompt'];

/**
 * 进行中的日志缓冲区。注意这是进程内状态：
 * 单进程部署下成立（与 runAICoding 的子进程管理同一约束），多实例部署需要改为共享存储。
 */
const sinks = new Map<number, LogSink>();

class LogSink {
  private pending: string[] = [];
  private pendingChars = 0;
  private totalChars: number;
  private timer: NodeJS.Timeout | null = null;
  /** 串行化刷盘，避免定时器与阈值触发交叉写入 */
  private chain: Promise<void> = Promise.resolve();
  private capped = false;

  constructor(
    private readonly id: number,
    startChars: number,
  ) {
    this.totalChars = startChars;
  }

  append(line: string) {
    if (this.capped) return;
    const chars = [...line].length + 1;
    if (this.totalChars + this.pendingChars + chars > MAX_CHARS) {
      this.capped = true;
      this.pending.push('[--:--:--] SYS    日志已达上限，后续输出不再记录（编译仍在继续）');
      this.pendingChars += 60;
      void this.flush({ truncated: true });
      return;
    }
    this.pending.push(line);
    this.pendingChars += chars;
    if (this.pendingChars >= FLUSH_CHARS) {
      void this.flush();
      return;
    }
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.flush();
      }, FLUSH_MS);
      this.timer.unref();
    }
  }

  /** 取出待写内容；返回 null 表示无事可做 */
  private drain() {
    if (!this.pending.length) return null;
    const lines = this.pending;
    this.pending = [];
    this.pendingChars = 0;
    const chunk = `${lines.join('\n')}\n`;
    const n = [...chunk].length;
    this.totalChars += n;
    return { chunk, n, lines: lines.length };
  }

  private flush(extra?: { truncated?: boolean }): Promise<void> {
    this.chain = this.chain.then(async () => {
      const d = this.drain();
      if (!d && !extra?.truncated) return;
      // 服务端原子 CONCAT：LONGTEXT 不回传 Node，也不存在读改写的丢失更新
      const sets = ['content = CONCAT(content, :chunk)', 'content_chars = content_chars + :n', 'line_count = line_count + :lines'];
      if (extra?.truncated) sets.push('truncated = 1');
      await sequelize.query(`UPDATE sys_ai_compile_log SET ${sets.join(', ')} WHERE id = :id`, {
        replacements: { id: this.id, chunk: d?.chunk ?? '', n: d?.n ?? 0, lines: d?.lines ?? 0 },
        type: QueryTypes.UPDATE,
      });
    });
    // 刷盘失败只告警，绝不中断正在进行的编译
    this.chain = this.chain.catch((e: Error) => {
      console.error(`[compileLog] 日志刷盘失败 id=${this.id}:`, e.message);
    });
    return this.chain;
  }

  /** 收尾：最后一次刷盘与终态字段合并为一条 UPDATE，避免前端看到 running=false 却缺尾巴 */
  async finish(fields: Record<string, unknown>): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.chain.catch(() => undefined);
    const d = this.drain();
    const sets = [
      'content = CONCAT(content, :chunk)',
      'content_chars = content_chars + :n',
      'line_count = line_count + :lines',
      'finished_at = NOW()',
    ];
    const replacements: Record<string, unknown> = {
      id: this.id,
      chunk: d?.chunk ?? '',
      n: d?.n ?? 0,
      lines: d?.lines ?? 0,
    };
    for (const [k, v] of Object.entries(fields)) {
      sets.push(`${k} = :${k}`);
      replacements[k] = v;
    }
    await sequelize
      .query(`UPDATE sys_ai_compile_log SET ${sets.join(', ')} WHERE id = :id`, {
        replacements,
        type: QueryTypes.UPDATE,
      })
      .catch((e: Error) => console.error(`[compileLog] 收尾写入失败 id=${this.id}:`, e.message));
  }
}

export interface StartCompileLogInput {
  sessionId: string;
  taskId: number;
  subTaskId: number | null;
  taskType: AiCompileTaskType;
  title: string;
  smartDocId: number | null;
  branch: string | null;
  model: string | null;
  prompt: string;
  headBefore: string | null;
  creatorId: number | null;
  creatorName: string | null;
}

/** 创建一条编译记录并注册日志缓冲区 */
export async function startCompileLog(input: StartCompileLogInput): Promise<AiCompileLog> {
  const log = await AiCompileLog.create({
    ...input,
    status: '编译中',
    content: '', // LONGTEXT 无默认值，必须显式给空串
    startedAt: new Date(),
  });
  sinks.set(log.id, new LogSink(log.id, 0));
  return log;
}

/** 追加一行日志（内部缓冲，非立即落库） */
export function appendCompileLine(logId: number, line: string): void {
  sinks.get(logId)?.append(line);
}

/** 结束编译记录：写入终态、指标与 git 取证结果 */
export async function finishCompileLog(
  logId: number,
  result: AICodingResult,
  change: RepoChange,
): Promise<void> {
  const sink = sinks.get(logId);
  const status: AiCompileStatus = result.ok ? '编译成功' : '编译失败';
  const fields: Record<string, unknown> = {
    status,
    error_msg: result.reason,
    exit_code: result.exitCode,
    result_subtype: result.resultSubtype,
    duration_ms: result.durationMs,
    num_turns: result.numTurns,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
    tool_calls: result.toolCalls,
    changed_files: change.changedFiles,
    changed_detail: change.detail,
    head_before: change.headBefore,
    head_after: change.headAfter,
    commits_ahead: change.commitsAhead,
  };
  if (sink) {
    await sink.finish(fields);
    sinks.delete(logId);
  } else {
    await AiCompileLog.update(
      { status, errorMsg: result.reason, finishedAt: new Date() },
      { where: { id: logId } },
    );
  }
}

export async function listCompileLogs(filter: {
  title?: string;
  sessionId?: string;
  status?: AiCompileStatus;
  taskId?: number;
  offset?: number;
  limit?: number;
}) {
  const where: Record<string, unknown> = {};
  if (filter.title) where.title = { [Op.like]: `%${filter.title}%` };
  if (filter.sessionId) where.sessionId = filter.sessionId;
  if (filter.status) where.status = filter.status;
  if (filter.taskId) where.taskId = filter.taskId;
  return AiCompileLog.findAndCountAll({
    where,
    offset: filter.offset,
    limit: filter.limit,
    order: [['id', 'DESC']],
    attributes: { exclude: LIST_EXCLUDE },
  });
}

export async function getCompileLog(id: number) {
  const log = await AiCompileLog.findByPk(id, { attributes: { exclude: LIST_EXCLUDE } });
  if (!log) throw ApiError.notFound('编译记录不存在');
  return log;
}

interface TailRow {
  status: AiCompileStatus;
  truncated: number;
  line_count: number;
  total: number;
  chunk: string | null;
  error_msg: string | null;
  finished_at: string | null;
  changed_files: number | null;
  changed_detail: string | null;
  exit_code: number | null;
  result_subtype: string | null;
  duration_ms: number | null;
  num_turns: number | null;
  input_tokens: number;
  output_tokens: number;
  tool_calls: number;
  commits_ahead: number | null;
}

/**
 * 增量拉取日志尾部。
 * offset 单位是 Unicode 码点，服务端为唯一权威：utf8mb4 列上 CHAR_LENGTH/SUBSTRING
 * 都按码点计算，二者自洽且永远不会把一个字符切成两半。
 */
export async function tailCompileLog(id: number, offset: number) {
  const run = async (from: number) =>
    (
      await sequelize.query<TailRow>(
        `SELECT status, truncated, line_count,
                CHAR_LENGTH(content) AS total,
                SUBSTRING(content, :from + 1, :max) AS chunk,
                error_msg, finished_at, changed_files, changed_detail,
                exit_code, result_subtype, duration_ms, num_turns,
                input_tokens, output_tokens, tool_calls, commits_ahead
           FROM sys_ai_compile_log WHERE id = :id`,
        { replacements: { id, from, max: MAX_TAIL }, type: QueryTypes.SELECT },
      )
    )[0];

  let row = await run(offset);
  if (!row) throw ApiError.notFound('编译记录不存在');

  // offset 超过总长说明记录被替换/回滚，退回从头全量
  let reset = false;
  let from = offset;
  if (offset > Number(row.total)) {
    reset = true;
    from = 0;
    row = await run(0);
  }

  const chunk = row.chunk ?? '';
  // 必须用 Array.from 按码点计数：chunk.length 是 UTF-16 码元，遇到 emoji 会永久错位
  const nextOffset = from + Array.from(chunk).length;
  const total = Number(row.total);

  return {
    id,
    status: row.status,
    running: row.status === '编译中',
    offset: from,
    nextOffset,
    total,
    chunk,
    hasMore: nextOffset < total,
    reset,
    truncated: row.truncated === 1,
    lineCount: row.line_count,
    errorMsg: row.error_msg,
    finishedAt: row.finished_at,
    changedFiles: row.changed_files,
    changedDetail: row.changed_detail,
    exitCode: row.exit_code,
    resultSubtype: row.result_subtype,
    durationMs: row.duration_ms,
    numTurns: row.num_turns,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    toolCalls: row.tool_calls,
    commitsAhead: row.commits_ahead,
  };
}

export async function removeCompileLog(id: number) {
  const log = await AiCompileLog.findByPk(id, { attributes: ['id', 'status'] });
  if (!log) throw ApiError.notFound('编译记录不存在');
  if (log.status === '编译中') throw ApiError.badRequest('编译进行中，无法删除该记录');
  await log.destroy();
}

/**
 * 启动时回收残留的「编译中」。
 * 进程重启（tsx watch 改动源码即会触发）会让 runAICoding 的回调永远不再执行，
 * 若不重置，任务会被 isTaskLocked 永久锁死：不能编辑、结束、删除、重跑。
 */
export async function recoverStaleCompileLogs(): Promise<void> {
  const reason = '服务重启导致编译中断';
  const [logs] = await sequelize.query(
    `UPDATE sys_ai_compile_log SET status = '编译失败', error_msg = :reason, finished_at = NOW()
      WHERE status = '编译中'`,
    { replacements: { reason }, type: QueryTypes.UPDATE },
  );
  for (const table of ['sys_ai_task', 'sys_ai_sub_task']) {
    await sequelize.query(
      `UPDATE ${table} SET coding_status = '编译失败', coding_error = :reason WHERE coding_status = '编译中'`,
      { replacements: { reason }, type: QueryTypes.UPDATE },
    );
  }
  const n = typeof logs === 'number' ? logs : 0;
  if (n > 0) console.warn(`[compileLog] 已回收 ${n} 条因重启中断的编译记录`);
}
