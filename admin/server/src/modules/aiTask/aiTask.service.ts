import { Op } from 'sequelize';
import { AITask, SmartDoc, AI_TASK_STATUS, type AITaskStatus } from '../../models/index.js';
import { generateProjectId } from '../dataSim/dataSim.service.js';
import { ApiError } from '../../utils/ApiError.js';

export interface AITaskInput {
  title: string;
  summary?: string | null;
  /** 关联智能文档 id（单关联，可空） */
  smartDocId?: number | null;
  /** 代码分支 */
  branch?: string | null;
  /** 任务状态：待开始 / 进行中 / 已结束 */
  status?: AITaskStatus;
  creatorId?: number | null;
  creatorName?: string | null;
}

export async function listAiTasks(filter: { title?: string }) {
  const where: Record<string, unknown> = {};
  if (filter.title) where.title = { [Op.like]: `%${filter.title}%` };

  return AITask.findAll({
    where,
    order: [['id', 'DESC']],
    include: [{ model: SmartDoc, as: 'smartDoc', attributes: ['id', 'title'], required: false }],
  });
}

export async function createAiTask(input: AITaskInput) {
  // 生成唯一 sessionId（16 位 base62，与数据模拟 projectId 同一算法）
  let sessionId = generateProjectId();
  while (await AITask.findOne({ where: { sessionId } })) {
    sessionId = generateProjectId();
  }
  return AITask.create({
    title: input.title.trim(),
    summary: input.summary?.trim() || null,
    sessionId,
    smartDocId: input.smartDocId ?? null,
    branch: input.branch?.trim() || null,
    status: input.status ?? '待开始',
    creatorId: input.creatorId ?? null,
    creatorName: input.creatorName ?? null,
  });
}

export async function updateAiTask(id: number, input: AITaskInput) {
  const task = await AITask.findByPk(id);
  if (!task) throw ApiError.notFound('AI任务不存在');

  const patch: Record<string, unknown> = {
    title: input.title.trim(),
    summary: input.summary?.trim() || null,
    smartDocId: input.smartDocId ?? null,
    branch: input.branch?.trim() || null,
  };
  if (input.status !== undefined) patch.status = input.status;
  await task.update(patch);
  return task;
}

/** 列表页直接修改状态 */
export async function updateAiTaskStatus(id: number, status: AITaskStatus) {
  const task = await AITask.findByPk(id);
  if (!task) throw ApiError.notFound('AI任务不存在');
  await task.update({ status });
  return task;
}

export async function removeAiTask(id: number) {
  const task = await AITask.findByPk(id);
  if (!task) throw ApiError.notFound('AI任务不存在');
  await task.destroy();
}
