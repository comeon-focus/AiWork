import { Op, fn, col } from 'sequelize';
import {
  TaskQueue,
  TaskQueueItem,
  AITask,
  AiSubTask,
  AiCompileLog,
  type TaskQueueStatus,
  type TaskQueueItemStatus,
} from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { aicodingAITask, listQueueOccupiedTaskIds, type AicodingActor } from '../aiTask/aiTask.service.js';
import { aicodingAiSubTask } from '../aiSubTask/aiSubTask.service.js';

/** 进程内正在跑 worker 的队列 id —— 仅作「同时只允许一个队列执行」的快速互斥锁 */
const runningQueues = new Set<number>();
/** 轮询间隔：编译通常以分钟计，3s 足够灵敏且不压 DB */
const POLL_MS = 3000;
/** 单个任务最长等待编译结果 */
const ITEM_TIMEOUT_MS = 2 * 60 * 60 * 1000;
/** 等待外部 AI 任务让出的最长时间 */
const IDLE_WAIT_MS = 30 * 60 * 1000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface TaskQueueItemInput {
  taskId: number;
  subTaskId?: number | null;
}

export interface TaskQueueInput {
  name: string;
  remark?: string | null;
  /** 数组顺序即执行顺序 */
  items: TaskQueueItemInput[];
}

export interface CodingBusyInfo {
  title: string;
  taskType: '父任务' | '子任务';
  taskId: number;
  subTaskId: number | null;
}

interface QueueStats {
  totalItems: number;
  doneItems: number;
  failedItems: number;
  finishedItems: number;
}

interface AggRow {
  queueId: number;
  status: string;
  n: number;
}

function aggregateStats(rows: AggRow[]): Record<number, QueueStats> {
  const map: Record<number, QueueStats> = {};
  for (const r of rows) {
    const s = (map[r.queueId] ??= { totalItems: 0, doneItems: 0, failedItems: 0, finishedItems: 0 });
    s.totalItems += r.n;
    if (r.status === '已完成') s.doneItems += r.n;
    if (r.status === '失败') s.failedItems += r.n;
    if (r.status === '已完成' || r.status === '失败') s.finishedItems += r.n;
  }
  return map;
}

const EMPTY_STATS = { totalItems: 0, doneItems: 0, failedItems: 0, finishedItems: 0 };

/* ── 列表 / 详情 ─────────────────────────────────── */

export async function listTaskQueues(filter: {
  name?: string;
  status?: TaskQueueStatus;
  offset?: number;
  limit?: number;
}): Promise<{ rows: Record<string, unknown>[]; count: number }> {
  const where: Record<string, unknown> = {};
  if (filter.name) where.name = { [Op.like]: `%${filter.name}%` };
  if (filter.status) where.status = filter.status;

  const { rows, count } = await TaskQueue.findAndCountAll({
    where,
    order: [['id', 'DESC']],
    offset: filter.offset ?? 0,
    limit: filter.limit ?? 10,
    distinct: true,
  });

  const ids = rows.map((r) => r.id);
  const statsRows: AggRow[] = ids.length
    ? ((await TaskQueueItem.findAll({
        where: { queueId: { [Op.in]: ids } },
        attributes: ['queueId', 'status', [fn('COUNT', col('id')), 'n']],
        group: ['queueId', 'status'],
        raw: true,
      })) as unknown as AggRow[])
    : [];
  const statsMap = aggregateStats(statsRows);

  const list = rows.map((r) => ({
    ...(r.get({ plain: true }) as Record<string, unknown>),
    ...(statsMap[r.id] ?? EMPTY_STATS),
  }));
  return { rows: list, count };
}

export async function getTaskQueueDetail(id: number): Promise<Record<string, unknown>> {
  const queue = await TaskQueue.findByPk(id, {
    include: [{ model: TaskQueueItem, as: 'items', order: [['orderNum', 'ASC'], ['id', 'ASC']] }],
  });
  if (!queue) throw ApiError.notFound('任务队列不存在');
  const plain = queue.get({ plain: true }) as Record<string, unknown>;
  const statsRows: AggRow[] = (await TaskQueueItem.findAll({
    where: { queueId: id },
    attributes: ['queueId', 'status', [fn('COUNT', col('id')), 'n']],
    group: ['queueId', 'status'],
    raw: true,
  })) as unknown as AggRow[];
  const stats = aggregateStats(statsRows)[id] ?? EMPTY_STATS;
  return { ...plain, ...stats };
}

/* ── 关联任务解析（去重 + 校验 + 快照） ────────────── */

async function resolveItems(items: TaskQueueItemInput[]): Promise<
  Omit<import('../../models/index.js').TaskQueueItem, 'id' | 'queueId' | 'orderNum' | 'createdAt' | 'updatedAt'>[]
> {
  const seen = new Set<string>();
  const uniq = items.filter((it) => {
    const key = `${it.taskId}:${it.subTaskId ?? 0}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!uniq.length) return [];

  const parentIds = [...new Set(uniq.map((i) => i.taskId))];
  const parents = await AITask.findAll({
    where: { id: { [Op.in]: parentIds } },
    attributes: ['id', 'title', 'sessionId', 'status'],
    raw: true,
  });
  const parentMap = new Map(parents.map((p) => [p.id, p]));

  const subIds = uniq.filter((i) => i.subTaskId).map((i) => i.subTaskId!);
  const subs = subIds.length
    ? await AiSubTask.findAll({
        where: { id: { [Op.in]: subIds } },
        attributes: ['id', 'parentId', 'title'],
        raw: true,
      })
    : [];
  const subMap = new Map(subs.map((s) => [s.id, s]));

  const resolved: Record<string, unknown>[] = [];
  for (const it of uniq) {
    const parent = parentMap.get(it.taskId);
    if (!parent) throw ApiError.badRequest(`AI 任务 #${it.taskId} 不存在或已删除`);
    if (it.subTaskId) {
      const sub = subMap.get(it.subTaskId);
      if (!sub) throw ApiError.badRequest(`AI 子任务 #${it.subTaskId} 不存在或已删除`);
      if (sub.parentId !== it.taskId) throw ApiError.badRequest(`子任务 #${it.subTaskId} 不属于该 AI 任务`);
      resolved.push({
        taskId: it.taskId,
        subTaskId: it.subTaskId,
        taskType: '子任务',
        title: sub.title,
        sessionId: parent.sessionId,
      });
    } else {
      resolved.push({
        taskId: it.taskId,
        subTaskId: null,
        taskType: '父任务',
        title: parent.title,
        sessionId: parent.sessionId,
      });
    }
  }
  return resolved as never;
}

/* ── CRUD ───────────────────────────────────────── */

export async function createTaskQueue(
  input: TaskQueueInput,
  creator?: AicodingActor | null,
): Promise<TaskQueue> {
  const name = input.name.trim();
  if (await TaskQueue.findOne({ where: { name } })) {
    throw ApiError.conflict(`任务队列「${name}」已存在`);
  }
  const resolved = await resolveItems(input.items);
  if (!resolved.length) throw ApiError.badRequest('请至少关联一个 AI 任务');

  const queue = await TaskQueue.create({
    name,
    remark: input.remark?.trim() || null,
    creatorId: creator?.id ?? null,
    creatorName: creator?.nickname ?? null,
  });
  await TaskQueueItem.bulkCreate(
    resolved.map((r, i) => ({ ...r, queueId: queue.id, orderNum: i })) as never,
  );
  return queue;
}

export async function updateTaskQueue(id: number, input: TaskQueueInput): Promise<TaskQueue> {
  const q = await TaskQueue.findByPk(id);
  if (!q) throw ApiError.notFound('任务队列不存在');
  if (q.status === '执行中') throw ApiError.badRequest('队列执行中，无法修改');

  const name = input.name.trim();
  const resolved = await resolveItems(input.items);

  if (q.status === '已执行') {
    // 已完成队列仅允许改名/备注
    if (name !== q.name) {
      if (await TaskQueue.findOne({ where: { name, id: { [Op.ne]: id } } })) {
        throw ApiError.conflict(`任务队列「${name}」已存在`);
      }
      await q.update({ name, remark: input.remark?.trim() || null });
    } else if ((input.remark?.trim() ?? '') !== (q.remark ?? '')) {
      await q.update({ remark: input.remark?.trim() || null });
    }
    return q;
  }

  // 待执行：可自由改名称与关联任务
  if (await TaskQueue.findOne({ where: { name, id: { [Op.ne]: id } } })) {
    throw ApiError.conflict(`任务队列「${name}」已存在`);
  }
  if (!resolved.length) throw ApiError.badRequest('请至少关联一个 AI 任务');

  await q.update({ name, remark: input.remark?.trim() || null });
  await TaskQueueItem.destroy({ where: { queueId: id } });
  await TaskQueueItem.bulkCreate(
    resolved.map((r, i) => ({ ...r, queueId: id, orderNum: i })) as never,
  );
  return q;
}

export async function reorderTaskQueueItems(id: number, itemIds: number[]): Promise<void> {
  const q = await TaskQueue.findByPk(id);
  if (!q) throw ApiError.notFound('任务队列不存在');
  if (q.status === '执行中') throw ApiError.badRequest('队列执行中，无法调整顺序');
  if (q.status === '已执行') throw ApiError.badRequest('已执行完成的队列不可调整顺序');

  const items = await TaskQueueItem.findAll({ where: { queueId: id } });
  const pending = items.filter((i) => i.status === '待执行');
  const pendingIds = new Set(pending.map((i) => i.id));
  const reqIds = new Set(itemIds);
  if (reqIds.size !== pendingIds.size || [...reqIds].some((x) => !pendingIds.has(x))) {
    throw ApiError.badRequest('仅可调整未执行任务的执行顺序');
  }
  const maxSettled = items
    .filter((i) => i.status !== '待执行')
    .reduce((m, i) => Math.max(m, i.orderNum), -1);
  for (let idx = 0; idx < itemIds.length; idx++) {
    const it = pending.find((p) => p.id === itemIds[idx]);
    if (it) await it.update({ orderNum: maxSettled + 1 + idx });
  }
}

export async function removeTaskQueue(id: number): Promise<void> {
  const q = await TaskQueue.findByPk(id);
  if (!q) throw ApiError.notFound('任务队列不存在');
  if (q.status === '执行中') throw ApiError.badRequest('队列执行中，无法删除');
  await TaskQueueItem.destroy({ where: { queueId: id } });
  await q.destroy();
}

/* ── 关联任务候选（前端选择器） ───────────────────── */

export async function listAiTaskOptions(excludeQueueId?: number): Promise<
  Array<{
    id: number;
    title: string;
    sessionId: string | null;
    status: string;
    codingStatus: string;
    children?: Array<{ id: number; parentId: number; title: string; status: string; codingStatus: string }>;
  }>
> {
  // 已被其它未完成队列占用的任务不可再选；编辑时需排除本队列，否则自己的条目会消失
  const occupied = await listQueueOccupiedTaskIds(excludeQueueId);
  const parents = await AITask.findAll({
    where: {
      status: { [Op.ne]: '已结束' },
      ...(occupied.length ? { id: { [Op.notIn]: occupied } } : {}),
    },
    attributes: ['id', 'title', 'sessionId', 'status', 'codingStatus'],
    order: [['id', 'DESC']],
    raw: true,
  });
  const ids = parents.map((p) => (p as { id: number }).id);
  const subs = ids.length
    ? await AiSubTask.findAll({
        where: { parentId: { [Op.in]: ids } },
        attributes: ['id', 'parentId', 'title', 'status', 'codingStatus'],
        order: [['id', 'ASC']],
        raw: true,
      })
    : [];
  const subByParent = new Map<number, any[]>();
  for (const s of subs) {
    const arr = subByParent.get(s.parentId) ?? [];
    arr.push(s);
    subByParent.set(s.parentId, arr);
  }
  return parents.map((p) => ({
    ...p,
    children: subByParent.get((p as { id: number }).id) ?? [],
  }));
}

/* ── 执行引擎 ───────────────────────────────────── */

/** 全系统是否有任一 AI 任务/子任务正在编译；返回首个占用者用于报错文案 */
export async function findAnyCodingTask(): Promise<CodingBusyInfo | null> {
  const task = await AITask.findOne({
    where: { codingStatus: '编译中' },
    attributes: ['id', 'title'],
    raw: true,
  });
  if (task) {
    return { title: task.title, taskType: '父任务', taskId: task.id, subTaskId: null };
  }
  const sub = await AiSubTask.findOne({
    where: { codingStatus: '编译中' },
    attributes: ['id', 'title', 'parentId'],
    raw: true,
  });
  if (sub) {
    return { title: sub.title, taskType: '子任务', taskId: sub.parentId, subTaskId: sub.id };
  }
  return null;
}

async function assertCanStart(queue: TaskQueue, items: TaskQueueItem[]): Promise<void> {
  if (queue.status === '执行中') throw ApiError.badRequest('队列正在执行中');
  if (queue.status === '已执行') throw ApiError.badRequest('队列已执行完成');
  if (!items.length) throw ApiError.badRequest('队列未关联任何 AI 任务');
  if (!items.some((i) => i.status === '待执行')) throw ApiError.badRequest('队列内没有待执行的任务');

  const other = await TaskQueue.findOne({ where: { status: '执行中', id: { [Op.ne]: queue.id } } });
  if (other) {
    throw ApiError.badRequest(`当前已有队列『${other.name}』正在执行，请等待其完成或暂停后再试`);
  }
  const busy = await findAnyCodingTask();
  if (busy) {
    throw ApiError.badRequest(
      `当前有${busy.taskType}『${busy.title}』正在 AICoding（编译中），请等待其编译结束后再执行队列`,
    );
  }
}

export async function startTaskQueue(id: number, actor?: AicodingActor | null): Promise<{ status: TaskQueueStatus }> {
  const queue = await TaskQueue.findByPk(id);
  if (!queue) throw ApiError.notFound('任务队列不存在');
  const items = await TaskQueueItem.findAll({ where: { queueId: id } });
  await assertCanStart(queue, items);

  // 临界区：from check to add 之间不允许 await，防止两个并发请求双双通过
  if (runningQueues.size > 0) throw ApiError.badRequest('已有队列正在执行');
  runningQueues.add(id);

  try {
    await queue.update({
      status: '执行中',
      pauseRequested: false,
      startedAt: queue.startedAt ?? new Date(),
      finishedAt: null,
      currentItemId: null,
    });
  } catch (e) {
    runningQueues.delete(id);
    throw e;
  }

  // 后台串行执行，HTTP 请求立即返回
  void runQueue(id, actor).finally(() => runningQueues.delete(id));
  return { status: '执行中' };
}

export async function pauseTaskQueue(id: number): Promise<{ status: TaskQueueStatus; pauseRequested: boolean }> {
  const queue = await TaskQueue.findByPk(id);
  if (!queue) throw ApiError.notFound('任务队列不存在');
  if (queue.status !== '执行中') throw ApiError.badRequest('仅执行中的队列可以暂停');
  if (queue.pauseRequested) throw ApiError.badRequest('已提交暂停请求，等待当前任务执行结束');

  // 僵尸保护：标记为执行中但无 worker（理论上恢复逻辑已处理）
  if (!runningQueues.has(id)) {
    await queue.update({ status: '暂停中', pauseRequested: false, currentItemId: null });
    await TaskQueueItem.update(
      { status: '待执行', startedAt: null, finishedAt: null, compileLogId: null, errorMsg: null },
      { where: { queueId: id, status: '执行中' } },
    );
    return { status: '暂停中', pauseRequested: false };
  }

  await queue.update({ pauseRequested: true });
  return { status: '执行中', pauseRequested: true };
}

async function failItem(item: TaskQueueItem, error: string | null): Promise<void> {
  await item.update({
    status: '失败',
    errorMsg: String(error ?? '执行失败').slice(0, 500),
    finishedAt: new Date(),
  });
}

async function finishPaused(queue: TaskQueue): Promise<void> {
  await queue.update({ status: '暂停中', pauseRequested: false, currentItemId: null });
}

/** 在两项之间等待全系统无 AI 任务编译中；返回 ok / paused / timeout */
async function waitForGlobalIdle(queueId: number): Promise<'ok' | 'paused' | 'timeout'> {
  const deadline = Date.now() + IDLE_WAIT_MS;
  for (;;) {
    const q = await TaskQueue.findByPk(queueId);
    if (!q || q.pauseRequested) return 'paused';
    const busy = await findAnyCodingTask();
    if (!busy) return 'ok';
    if (Date.now() > deadline) return 'timeout';
    await sleep(POLL_MS);
  }
}

async function waitForItemFinish(item: TaskQueueItem): Promise<{ ok: boolean; error: string | null }> {
  const deadline = Date.now() + ITEM_TIMEOUT_MS;
  for (;;) {
    const status = item.subTaskId
      ? await AiSubTask.findByPk(item.subTaskId, { attributes: ['codingStatus', 'codingError'], raw: true })
      : await AITask.findByPk(item.taskId, { attributes: ['codingStatus', 'codingError'], raw: true });
    if (!status) return { ok: false, error: '关联任务已被删除' };
    if (status.codingStatus !== '编译中') {
      return { ok: status.codingStatus === '编译成功', error: status.codingError ?? null };
    }
    if (Date.now() > deadline) return { ok: false, error: '等待编译结果超时' };
    await sleep(POLL_MS);
  }
}

async function runQueue(queueId: number, actor?: AicodingActor | null): Promise<void> {
  for (;;) {
    const queue = await TaskQueue.findByPk(queueId);
    if (!queue) return;
    if (queue.pauseRequested) {
      await finishPaused(queue);
      return;
    }

    // 只取「待执行」：失败项已记录在详情里，本轮不再重试，否则会在同一项上死循环
    const item = await TaskQueueItem.findOne({
      where: { queueId, status: '待执行' satisfies TaskQueueItemStatus },
      order: [['orderNum', 'ASC'], ['id', 'ASC']],
    });
    if (!item) {
      await queue.update({ status: '已执行', finishedAt: new Date(), currentItemId: null });
      return;
    }

    // 让路：等待全系统无其它 AI 任务编译中
    const idle = await waitForGlobalIdle(queueId);
    if (idle === 'paused') {
      await finishPaused(queue);
      return;
    }
    if (idle === 'timeout') {
      await failItem(item, '等待其它 AI 任务编译结束超时');
      continue;
    }

    // 标记开始
    await item.update({ status: '执行中', startedAt: new Date(), errorMsg: null, compileLogId: null });
    await queue.update({ currentItemId: item.id });

    // 取水位线，触发后取首条晚于该水位线的编译记录回填
    const sinceLogId = (await AiCompileLog.max('id')) as number ?? 0;
    try {
      // fromQueue：跳过「队列占用」校验，否则队列会被自己设的锁拦住
      if (item.subTaskId) await aicodingAiSubTask(item.subTaskId, actor, { fromQueue: true });
      else await aicodingAITask(item.taskId, actor, { fromQueue: true });
    } catch (e) {
      await failItem(item, (e as Error).message);
      continue;
    }

    const log = await AiCompileLog.findOne({
      where: { taskId: item.taskId, subTaskId: item.subTaskId, id: { [Op.gt]: sinceLogId } },
      order: [['id', 'ASC']],
      attributes: ['id'],
      raw: true,
    });
    if (log) await item.update({ compileLogId: (log as { id: number }).id });

    // 轮询等待终态
    const r = await waitForItemFinish(item);
    await item.update({
      status: r.ok ? '已完成' : '失败',
      errorMsg: r.ok ? null : String(r.error ?? '执行失败').slice(0, 500),
      finishedAt: new Date(),
    });
  }
}

/** 后端重启恢复：把执行中队列复位为暂停中、执行中条目复位为待执行 */
export async function recoverStaleTaskQueues(): Promise<void> {
  const items = await TaskQueueItem.update(
    { status: '待执行', startedAt: null, finishedAt: null, compileLogId: null, errorMsg: null },
    { where: { status: '执行中' } },
  );
  const queues = await TaskQueue.update(
    { status: '暂停中', pauseRequested: false, currentItemId: null },
    { where: { status: '执行中' } },
  );
  if ((items[0] ?? 0) > 0 || (queues[0] ?? 0) > 0) {
    console.log(`[taskQueue] 已回收因重启中断的队列（项 ${items[0] ?? 0} 个，队列 ${queues[0] ?? 0} 个）`);
  }
}
