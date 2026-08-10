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
  type AiCompileTaskType,
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
  snapshotRepo,
  diffRepoSince,
  commitAllAndPush,
  GitAfterCommitError,
  type CommitResult,
} from '../../utils/git.js';
import { runAICoding, resolveModel } from '../../utils/codebuddy.js';
import {
  startCompileLog,
  appendCompileLine,
  finishCompileLog,
} from '../aiCompileLog/aiCompileLog.service.js';
import {
  recordGitCommit,
  type GitCommitRecordInput,
} from '../aiGitCommit/aiGitCommit.service.js';

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
  sessionId?: string;
  status?: AITaskStatus;
  smartDocId?: number;
  offset?: number;
  limit?: number;
}) {
  const where: Record<string, unknown> = {};
  if (filter.title) where.title = { [Op.like]: `%${filter.title}%` };
  // 模糊匹配：Session ID 有 16 位，允许只记得片段时也能搜到
  if (filter.sessionId) where.sessionId = { [Op.like]: `%${filter.sessionId}%` };
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
  if (!rows.length) return { rows: [], count };

  // 「整个任务是否正在 AICoding」：父任务自身或任一子任务处于编译中
  const activeSubs = await AiSubTask.findAll({
    where: { parentId: { [Op.in]: rows.map((r) => r.id) }, codingStatus: '编译中' },
    attributes: ['parentId'],
    group: ['parentId'],
    raw: true,
  });
  const activeParentIds = new Set((activeSubs as { parentId: number }[]).map((s) => s.parentId));

  // 计算字段必须挂到 plain 对象上：直接赋给 Sequelize 实例会被 toJSON() 丢掉，发不到前端
  const list = rows.map((r) => ({
    ...(r.get({ plain: true }) as Record<string, unknown>),
    codingActive: r.codingStatus === '编译中' || activeParentIds.has(r.id),
    // 未关联代码库、或任务结束后已回收目录的，前端据此禁用「提交代码」
    hasWorkspace: fs.existsSync(taskWorkspaceDir(r.sessionId)),
  }));
  return { rows: list, count };
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

  // 父子锁定规则：父任务自身在 AICoding，或任一子任务在 AICoding → 父任务状态不可改
  if (await isTaskLocked(task.id)) {
    throw ApiError.badRequest('该任务正在 AICoding 中，无法修改状态');
  }

  // 结束任务前：若代码库有未提交改动，则禁止结束
  if (status === '已结束') {
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
  // 释放当前会话的 codebuddy 缓存以回收内存，并删除该任务本地代码文件夹（含其中所有文件）
  const sid = task.sessionId;
  if (fs.existsSync(taskWorkspaceDir(sid))) {
    await clearCodebuddySession(sid);
    await removeWorkspaceDir(sid);
  }
  await task.destroy();
}

/* ── 提交代码 ─────────────────────────── */

/**
 * commit 注释：固定前缀 + SessionID + 任务标题，用 '-' 连接。
 * 标题里的换行会破坏 commit 首行，统一压成空格。
 */
export function buildCommitMessage(sessionId: string, title: string): string {
  return ['feat: AICoding', sessionId, title.replace(/\s+/g, ' ').trim()].join('-');
}

/**
 * 提交该任务代码库下的全部改动并推送到远端。
 * 无论成败都会在「GIT提交记录」里留一条：失败原因与接口返回的提示保持同一份文案，
 * 用户在弹窗里看到什么，事后在列表里就能查到什么。
 */
export async function commitAiTaskCode(
  id: number,
  actor?: AicodingActor | null,
): Promise<CommitResult & { message: string }> {
  const task = await AITask.findByPk(id);
  if (!task) throw ApiError.notFound('AI任务不存在');

  const message = buildCommitMessage(task.sessionId, task.title);
  const base = {
    sessionId: task.sessionId,
    taskId: task.id,
    title: task.title,
    branch: task.branch,
    commitMessage: message,
    creatorId: actor?.id ?? null,
    creatorName: actor?.nickname ?? null,
  };
  /** 记录失败并抛出——两处必须用同一段文案，所以收敛成一个出口 */
  const fail = async (reason: string, extra?: Partial<GitCommitRecordInput>): Promise<never> => {
    await recordGitCommit({ ...base, status: '提交失败', errorMsg: reason, ...extra });
    throw ApiError.badRequest(reason);
  };

  if (task.status === '已结束') return fail('该任务已结束，本地代码库已回收，无法提交');
  if (await isTaskLocked(task.id)) return fail('该任务正在 AICoding 中，请等编译结束后再提交');

  const dir = taskWorkspaceDir(task.sessionId);
  if (!fs.existsSync(dir)) return fail('该任务没有本地代码库，无法提交');

  let result: CommitResult | null;
  try {
    result = await commitAllAndPush(dir, message);
  } catch (e) {
    // 拉取/推送失败时本地 commit 已经落地，必须如实说明，否则用户会重复点击
    if (e instanceof GitAfterCommitError) {
      const { stage, result: r } = e;
      const what = stage === 'pull' ? '拉取' : '推送';
      return fail(`代码已在本地提交（${r.commitHash}），但${what}远端分支『${r.branch}』失败：${e.reason}`, {
        commitHash: r.commitHash,
        branch: r.branch,
        changedFiles: r.changedFiles,
        changedDetail: r.detail,
      });
    }
    return fail(`提交代码失败：${(e as Error).message}`);
  }
  if (!result) return fail('该任务代码库没有需要提交的改动');

  await recordGitCommit({
    ...base,
    status: '提交成功',
    branch: result.branch,
    commitHash: result.commitHash,
    changedFiles: result.changedFiles,
    changedDetail: result.detail,
  });
  return { ...result, message };
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

/* ── AICoding 执行流程 ─────────────────────────── */

/** 触发人，用于编译记录归属 */
export interface AicodingActor {
  id: number;
  nickname: string;
}

export interface StartRunInput {
  sessionId: string;
  repoDir: string;
  taskId: number;
  /** 为 null 表示父任务自身发起 */
  subTaskId: number | null;
  taskType: AiCompileTaskType;
  title: string;
  smartDocId: number | null;
  branch: string | null;
  prompt: string;
  actor?: AicodingActor | null;
}

/**
 * 组装 AICoding 提示词。
 * 必须显式圈定工作目录：codebuddy 以 bypassPermissions 运行，Bash 工具不受 --add-dir 约束，
 * 实测它会顺着绝对路径读到工作区外的真实项目目录（进而有改错仓库的风险）。
 */
export function buildAicodingPrompt(repoDir: string, docContent: string): string {
  return [
    `你的工作目录严格限定为 ${repoDir}，只允许读写该目录内的文件。`,
    '禁止访问或修改该目录以外的任何路径，即使它看起来是同一个项目。',
    '',
    '根据以下智能需求描述文档，在该代码库中进行相应的代码修改：',
    '',
    docContent,
  ].join('\n');
}

/** 把终态回写到发起方（父任务或子任务）那张表 */
async function writeBackCodingStatus(input: StartRunInput, status: AicodingStatus, error: string | null) {
  const patch = { codingStatus: status, codingError: error };
  if (input.subTaskId) {
    await AiSubTask.update(patch, { where: { id: input.subTaskId } });
  } else {
    await AITask.update(patch, { where: { id: input.taskId } });
  }
}

/**
 * 父/子任务共用的 AICoding 启动流程：
 * 拍 git 快照 → 建编译记录 → 子进程流式写日志 → 结束后比对 git 并回写终态。
 * 二者唯一的差异是终态写回哪张表。
 */
export async function startAicodingRun(input: StartRunInput): Promise<void> {
  const before = await snapshotRepo(input.repoDir);
  const log = await startCompileLog({
    sessionId: input.sessionId,
    taskId: input.taskId,
    subTaskId: input.subTaskId,
    taskType: input.taskType,
    title: input.title,
    smartDocId: input.smartDocId,
    branch: input.branch ?? before.branch,
    model: resolveModel(),
    prompt: input.prompt,
    headBefore: before.head,
    creatorId: input.actor?.id ?? null,
    creatorName: input.actor?.nickname ?? null,
  });

  runAICoding(input.sessionId, input.prompt, input.repoDir, {
    onLine: (line) => appendCompileLine(log.id, line),
    onDone: (result) => {
      void (async () => {
        try {
          const change = await diffRepoSince(input.repoDir, before);
          // 声称成功却零改动：把线索留在日志里，历史 bug（prompt 被吞、空跑）正是这个形态
          if (result.ok && change.changedFiles === 0) {
            appendCompileLine(log.id, '[--:--:--] SYS    ⚠ 本次运行结束，但 git 检测到代码零改动');
          }
          await finishCompileLog(log.id, result, change);
          await writeBackCodingStatus(input, result.ok ? '编译成功' : '编译失败', result.reason);
          if (!result.ok) console.error(`[aicoding] 编译失败 log=${log.id}：${result.reason}`);
        } catch (e) {
          console.error(`[aicoding] 收尾失败 log=${log.id}:`, (e as Error).message);
          // 收尾异常也必须解锁任务，否则 isTaskLocked 会把任务永久锁死
          await writeBackCodingStatus(input, '编译失败', '编译结果写入失败').catch(() => undefined);
        }
      })();
    },
  });
}

/** 启动父任务 AICoding：调用 codebuddy 基于关联智能文档在代码库下改代码 */
export async function aicodingAITask(id: number, actor?: AicodingActor | null) {
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

  await task.update({ codingStatus: '编译中', codingError: null });
  const repoDir = taskWorkspaceDir(sessionId);
  const prompt = buildAicodingPrompt(repoDir, sd.content);
  try {
    await startAicodingRun({
      sessionId,
      repoDir,
      taskId: task.id,
      subTaskId: null,
      taskType: '父任务',
      title: task.title,
      smartDocId: task.smartDocId,
      branch: task.branch,
      prompt,
      actor,
    });
  } catch (e) {
    // 起不来就地解锁，别让任务卡在「编译中」
    await task.update({ codingStatus: '编译失败', codingError: (e as Error).message });
    throw ApiError.badRequest(`AICoding 启动失败：${(e as Error).message}`);
  }
  return { codingStatus: '编译中' as AicodingStatus };
}
