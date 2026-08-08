import { Op } from 'sequelize';
import { AiSubTask, SmartDoc, type AITaskStatus } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';

export interface AiSubTaskInput {
  parentId: number;
  title: string;
  summary?: string | null;
  /** 会话 ID：继承父任务 sessionId（只读） */
  sessionId?: string | null;
  /** 关联智能文档 id（单关联，可空） */
  smartDocId?: number | null;
  /** 代码分支 */
  branch?: string | null;
  /** 任务状态：待开始 / 进行中 / 已结束 */
  status?: AITaskStatus;
  creatorId?: number | null;
  creatorName?: string | null;
}

export async function listAiSubTasks(filter: { parentId: number; title?: string }) {
  const where: Record<string, unknown> = { parentId: filter.parentId };
  if (filter.title) where.title = { [Op.like]: `%${filter.title}%` };

  return AiSubTask.findAll({
    where,
    order: [['id', 'DESC']],
    include: [{ model: SmartDoc, as: 'smartDoc', attributes: ['id', 'title'], required: false }],
  });
}

export async function createAiSubTask(input: AiSubTaskInput) {
  return AiSubTask.create({
    parentId: input.parentId,
    title: input.title.trim(),
    summary: input.summary?.trim() || null,
    sessionId: input.sessionId ?? null,
    smartDocId: input.smartDocId ?? null,
    branch: input.branch?.trim() || null,
    status: input.status ?? '待开始',
    creatorId: input.creatorId ?? null,
    creatorName: input.creatorName ?? null,
  });
}

export async function updateAiSubTask(id: number, input: AiSubTaskInput) {
  const task = await AiSubTask.findByPk(id);
  if (!task) throw ApiError.notFound('AI子任务不存在');

  const patch: Record<string, unknown> = {
    parentId: input.parentId,
    title: input.title.trim(),
    summary: input.summary?.trim() || null,
    sessionId: input.sessionId ?? null,
    smartDocId: input.smartDocId ?? null,
    branch: input.branch?.trim() || null,
  };
  if (input.status !== undefined) patch.status = input.status;
  await task.update(patch);
  return task;
}

/** 列表页直接修改状态 */
export async function updateAiSubTaskStatus(id: number, status: AITaskStatus) {
  const task = await AiSubTask.findByPk(id);
  if (!task) throw ApiError.notFound('AI子任务不存在');
  await task.update({ status });
  return task;
}

export async function removeAiSubTask(id: number) {
  const task = await AiSubTask.findByPk(id);
  if (!task) throw ApiError.notFound('AI子任务不存在');
  await task.destroy();
}
