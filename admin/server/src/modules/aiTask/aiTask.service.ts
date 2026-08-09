import { Op } from 'sequelize';
import fs from 'fs';
import { AITask, SmartDoc, CodeRepo, AI_TASK_STATUS, type AITaskStatus } from '../../models/index.js';
import { generateProjectId } from '../dataSim/dataSim.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { cloneRepo, checkoutBranch, taskWorkspaceDir } from '../../utils/git.js';

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

export async function listAiTasks(filter: {
  title?: string;
  status?: AITaskStatus;
  smartDocId?: number;
  offset?: number;
  limit?: number;
}) {
  const where: Record<string, unknown> = {};
  if (filter.title) where.title = { [Op.like]: `%${filter.title}%` };
  if (filter.status) where.status = filter.status;
  if (filter.smartDocId) where.smartDocId = filter.smartDocId;

  const { rows, count } = await AITask.findAndCountAll({
    where,
    offset: filter.offset,
    limit: filter.limit,
    order: [['id', 'DESC']],
    distinct: true,
    include: [{ model: SmartDoc, as: 'smartDoc', attributes: ['id', 'title'], required: false }],
  });
  return { rows, count };
}

export async function createAiTask(input: AITaskInput) {
  // 生成唯一 sessionId（16 位 base62，与数据模拟 projectId 同一算法）
  let sessionId = generateProjectId();
  while (await AITask.findOne({ where: { sessionId } })) {
    sessionId = generateProjectId();
  }

  // 解析关联智能文档对应的代码库地址
  let repoUrl: string | null = null;
  if (input.smartDocId) {
    const sd = await SmartDoc.findByPk(input.smartDocId);
    if (sd?.repoId) {
      const repo = await CodeRepo.findByPk(sd.repoId);
      repoUrl = repo?.address ?? null;
    }
  }

  // 拉取代码库到 AiWorkSpace/<sessionId>（外层文件夹以 SessionID 命名），
  // 并切换到创建任务时填入的代码分支；二者任一失败则整条创建失败，并清理已拉取的目录。
  // 子任务与父任务共用一套代码库，无需单独处理。
  if (repoUrl) {
    let dir: string;
    try {
      dir = await cloneRepo(repoUrl, sessionId);
    } catch (e) {
      // cloneRepo 内部已清理残留目录
      throw ApiError.badRequest(`代码库拉取失败，AI 任务创建中止：${(e as Error).message}`);
    }
    if (input.branch) {
      try {
        await checkoutBranch(dir, input.branch);
      } catch (e) {
        // 分支切换失败：删除已拉取的 SessionID 文件夹，避免残留
        await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => undefined);
        throw ApiError.badRequest(`代码分支切换失败『${input.branch}』，AI 任务创建中止：${(e as Error).message}`);
      }
    }
  }

  let task;
  try {
    task = await AITask.create({
      title: input.title.trim(),
      summary: input.summary?.trim() || null,
      sessionId,
      smartDocId: input.smartDocId ?? null,
      branch: input.branch?.trim() || null,
      status: input.status ?? '待开始',
      creatorId: input.creatorId ?? null,
      creatorName: input.creatorName ?? null,
    });
  } catch (e) {
    // 记录已创建则清理已拉取的代码目录，避免残留
    if (repoUrl) await fs.promises.rm(taskWorkspaceDir(sessionId), { recursive: true, force: true });
    throw e;
  }
  return task;
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
