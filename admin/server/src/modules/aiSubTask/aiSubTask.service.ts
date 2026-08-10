import { Op } from 'sequelize';
import fs from 'fs';
import {
  AiSubTask,
  AITask,
  SmartDoc,
  type AITaskStatus,
  type AicodingStatus,
} from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { taskWorkspaceDir, hasUncommittedChanges } from '../../utils/git.js';
import {
  isTaskLocked,
  activeCodingParentCount,
  assertParentNotInRunningQueue,
  startAicodingRun,
  buildAicodingPrompt,
  type AicodingActor,
} from '../aiTask/aiTask.service.js';

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

export async function listAiSubTasks(filter: {
  parentId: number;
  title?: string;
  offset?: number;
  limit?: number;
}) {
  const where: Record<string, unknown> = { parentId: filter.parentId };
  if (filter.title) where.title = { [Op.like]: `%${filter.title}%` };

  const { rows, count } = await AiSubTask.findAndCountAll({
    where,
    offset: filter.offset,
    limit: filter.limit,
    order: [['id', 'DESC']],
    distinct: true,
    include: [{ model: SmartDoc, as: 'smartDoc', attributes: ['id', 'title'], required: false }],
  });
  return { rows, count };
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
    codingStatus: '暂无',
    creatorId: input.creatorId ?? null,
    creatorName: input.creatorName ?? null,
  });
}

export async function updateAiSubTask(id: number, input: AiSubTaskInput) {
  const task = await AiSubTask.findByPk(id);
  if (!task) throw ApiError.notFound('AI子任务不存在');
  // 仅当该子任务自身正在 AICoding 时锁定；父任务或兄弟任务在 AICoding 不影响它
  if (task.codingStatus === '编译中') throw ApiError.badRequest('该子任务正在 AICoding 中，无法修改');

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
  const task = await AiSubTask.findByPk(id, { include: [{ model: AITask, as: 'parent' }] });
  if (!task) throw ApiError.notFound('AI子任务不存在');
  // 仅该子任务自身正在 AICoding 时锁定（兄弟任务、父任务在 AICoding 均不影响它）
  if (task.codingStatus === '编译中') {
    throw ApiError.badRequest('该子任务正在 AICoding 中，无法修改状态');
  }
  const parent = (task as unknown as { parent?: AITask }).parent!;
  // 结束子任务前校验：共享代码库有未提交改动（会阻断后续父任务结束）
  if (status === '已结束') {
    const sid = parent.sessionId;
    if (sid && fs.existsSync(taskWorkspaceDir(sid)) && (await hasUncommittedChanges(sid))) {
      throw ApiError.badRequest('该任务代码库存在未提交的修改，无法结束任务（请先提交或处理改动）');
    }
    await task.update({ status });
  } else {
    await task.update({ status });
  }
  return task;
}

export async function removeAiSubTask(id: number) {
  const task = await AiSubTask.findByPk(id);
  if (!task) throw ApiError.notFound('AI子任务不存在');
  // 仅当该子任务自身正在 AICoding 时锁定
  if (task.codingStatus === '编译中') throw ApiError.badRequest('该子任务正在 AICoding 中，无法删除');
  await task.destroy();
}

/** 启动子任务 AICoding：复用父任务 sessionId 会话（共享对话上下文），基于子任务自身关联智能文档改代码 */
export async function aicodingAiSubTask(
  id: number,
  actor?: AicodingActor | null,
  opts?: { fromQueue?: boolean },
) {
  const sub = await AiSubTask.findByPk(id, { include: [{ model: AITask, as: 'parent' }] });
  if (!sub) throw ApiError.notFound('AI子任务不存在');
  const parent = (sub as unknown as { parent?: AITask }).parent!;
  if (!parent) throw ApiError.notFound('所属 AI 任务不存在');
  if (parent.status === '已结束') throw ApiError.badRequest('已结束的任务不能启动 AICoding');
  if (!sub.smartDocId) throw ApiError.badRequest('请先在子任务中关联智能文档后再启动 AICoding');
  const sd = await SmartDoc.findByPk(sub.smartDocId);
  if (!sd?.content) throw ApiError.badRequest('关联智能文档暂无需求描述内容，无法启动 AICoding');
  const sessionId = parent.sessionId;
  if (!sessionId || !fs.existsSync(taskWorkspaceDir(sessionId))) {
    throw ApiError.badRequest('代码库尚未拉取，无法启动 AICoding（请确认父任务创建时成功拉取了代码库）');
  }
  if (await isTaskLocked(parent.id)) throw ApiError.badRequest('该任务正在 AICoding 中，无法重复启动');
  if (!opts?.fromQueue) await assertParentNotInRunningQueue(parent.id);
  if (await activeCodingParentCount(parent.id) >= 2) {
    throw ApiError.badRequest('最多允许两个任务同时进行 AICoding，请稍后再试');
  }

  await sub.update({ codingStatus: '编译中', codingError: null, status: '进行中' });
  const repoDir = taskWorkspaceDir(sessionId);
  const prompt = buildAicodingPrompt(repoDir, sd.content);
  try {
    await startAicodingRun({
      sessionId,
      repoDir,
      taskId: parent.id,
      subTaskId: sub.id,
      taskType: '子任务',
      title: sub.title,
      smartDocId: sub.smartDocId,
      branch: sub.branch ?? parent.branch,
      prompt,
      actor,
    });
  } catch (e) {
    await sub.update({ codingStatus: '编译失败', codingError: (e as Error).message });
    throw ApiError.badRequest(`AICoding 启动失败：${(e as Error).message}`);
  }
  return { codingStatus: '编译中' as AicodingStatus };
}
