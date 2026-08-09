import { Op } from 'sequelize';
import fs from 'fs';
import {
  AITask,
  AiSubTask,
  SmartDoc,
  CodeRepo,
  AI_TASK_STATUS,
  type AITaskStatus,
  type AicodingStatus,
} from '../../models/index.js';
import { generateProjectId } from '../dataSim/dataSim.service.js';
import { ApiError } from '../../utils/ApiError.js';
import {
  cloneRepo,
  checkoutBranch,
  createAndPushBranch,
  isBranchNotFound,
  taskWorkspaceDir,
  hasUncommittedChanges,
  removeWorkspaceDir,
  clearCodebuddySession,
} from '../../utils/git.js';
import { runAICoding } from '../../utils/codebuddy.js';

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
  // 标记「整个任务是否正在 AICoding」：父任务自身或任一子任务处于编译中
  if (rows.length) {
    const activeSubs = await AiSubTask.findAll({
      where: { parentId: { [Op.in]: rows.map((r) => r.id) }, codingStatus: '编译中' },
      attributes: ['parentId'],
      group: ['parentId'],
      raw: true,
    });
    const activeParentIds = new Set((activeSubs as { parentId: number }[]).map((s) => s.parentId));
    for (const r of rows) {
      (r as unknown as { codingActive: boolean }).codingActive =
        r.codingStatus === '编译中' || activeParentIds.has(r.id);
    }
  }
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
        const msg = (e as Error).message;
        if (isBranchNotFound(msg)) {
          // 分支不存在：基于当前 HEAD 创建本地分支并推送远端（创建远程分支）
          try {
            await createAndPushBranch(dir, input.branch);
          } catch (e2) {
            await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => undefined);
            throw ApiError.badRequest(`远程分支创建失败『${input.branch}』，AI 任务创建中止：${(e2 as Error).message}`);
          }
        } else {
          // 其它切换错误（如本地未提交冲突）：删除已拉取的 SessionID 文件夹，避免残留
          await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => undefined);
          throw ApiError.badRequest(`代码分支切换失败『${input.branch}』，AI 任务创建中止：${msg}`);
        }
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
      codingStatus: '暂无',
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
  if (await isTaskLocked(task.id)) throw ApiError.badRequest('该任务正在 AICoding 中，无法修改');

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

  // 结束任务前：若正在 AICoding，或代码库有未提交改动，则禁止结束
  if (status === '已结束') {
    if (await isTaskLocked(task.id)) throw ApiError.badRequest('该任务正在 AICoding 中，无法结束');
    const sid = task.sessionId;
    if (fs.existsSync(taskWorkspaceDir(sid)) && (await hasUncommittedChanges(sid))) {
      throw ApiError.badRequest('该任务代码库存在未提交的修改，无法结束任务（请先提交或处理改动）');
    }
    await task.update({ status });
    // 释放 codebuddy 会话缓存并删除本地代码文件夹，回收资源
    if (fs.existsSync(taskWorkspaceDir(sid))) {
      await clearCodebuddySession(sid);
      await removeWorkspaceDir(sid);
    }
  } else {
    await task.update({ status });
  }
  return task;
}

export async function removeAiTask(id: number) {
  const task = await AITask.findByPk(id);
  if (!task) throw ApiError.notFound('AI任务不存在');
  if (await isTaskLocked(task.id)) throw ApiError.badRequest('该任务正在 AICoding 中，无法删除');
  await task.destroy();
}

/* ── AICoding 并发与锁定辅助 ─────────────────────────── */

/** 当前正在 AICoding 的「父级会话」去重数量（每个父任务=1 个会话，含其全部子任务） */
export async function activeCodingParentCount(excludeParentId?: number): Promise<number> {
  const parentSelf = (
    await AITask.findAll({ where: { codingStatus: '编译中' }, attributes: ['id'], raw: true })
  ).map((t) => (t as { id: number }).id);
  const subParents = (
    await AiSubTask.findAll({
      where: { codingStatus: '编译中' },
      attributes: ['parentId'],
      group: ['parentId'],
      raw: true,
    })
  ).map((s) => (s as { parentId: number }).parentId);
  const all = new Set<number>([...parentSelf, ...subParents]);
  if (excludeParentId) all.delete(excludeParentId);
  return all.size;
}

/** 某父任务（含其任一子任务）是否正在 AICoding → 整个任务不可修改 */
export async function isTaskLocked(parentId: number): Promise<boolean> {
  const parent = await AITask.findOne({ where: { id: parentId, codingStatus: '编译中' }, raw: true });
  if (parent) return true;
  const sub = await AiSubTask.findOne({ where: { parentId, codingStatus: '编译中' }, raw: true });
  return !!sub;
}

/** 启动父任务 AICoding：调用 codebuddy 基于关联智能文档在代码库下改代码 */
export async function aicodingAITask(id: number) {
  const task = await AITask.findByPk(id);
  if (!task) throw ApiError.notFound('AI任务不存在');
  if (task.status === '已结束') throw ApiError.badRequest('已结束的任务不能启动 AICoding');
  if (!task.smartDocId) throw ApiError.badRequest('请先在 AI 任务中关联智能文档后再启动 AICoding');
  const sd = await SmartDoc.findByPk(task.smartDocId);
  if (!sd?.content) throw ApiError.badRequest('关联智能文档暂无需求描述内容，无法启动 AICoding');
  const sessionId = task.sessionId;
  if (!fs.existsSync(taskWorkspaceDir(sessionId))) {
    throw ApiError.badRequest('代码库尚未拉取，无法启动 AICoding（请确认任务创建时成功拉取了代码库）');
  }
  if (await isTaskLocked(task.id)) throw ApiError.badRequest('该任务正在 AICoding 中，无法重复启动');
  if (await activeCodingParentCount(task.id) >= 2) {
    throw ApiError.badRequest('最多允许两个任务同时进行 AICoding，请稍后再试');
  }

  await task.update({ codingStatus: '编译中' });
  const prompt = `根据以下智能需求描述文档，在当前代码库中进行相应的代码修改：\n\n${sd.content}`;
  runAICoding(sessionId, prompt, taskWorkspaceDir(sessionId), (code) => {
    AITask.findByPk(id)
      .then((t) => {
        if (!t) return;
        if (code === 0) {
          return t.update({ codingStatus: '编译成功', codingError: null });
        }
        const reason = code === null ? 'codebuddy 启动失败' : `codebuddy 进程退出码 ${code}`;
        return t.update({ codingStatus: '编译失败', codingError: reason });
      })
      .catch(() => undefined);
    if (code !== 0) console.error(`[aicoding] AI 任务 ${id} codebuddy 退出码 ${code}`);
  });
  return { codingStatus: '编译中' as AicodingStatus };
}
