import { Op } from 'sequelize';
import fs from 'fs';
import path from 'path';
import {
  AITask,
  AiSubTask,
  AiCompileLog,
  AiGitCommit,
  SmartDoc,
  CodeRepo,
  TaskQueue,
  TaskQueueItem,
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
  AI_WORKSPACE_DIR,
  taskWorkspaceDir,
  hasUncommittedChanges,
  removeWorkspaceDir,
  clearCodebuddySession,
  codebuddyHomeDir,
  snapshotRepo,
  diffRepoSince,
  commitAllAndPush,
  GitAfterCommitError,
  deleteRemoteBranch,
  findCodebuddySessionFile,
  type CommitResult,
} from '../../utils/git.js';
import { runAICoding, resolveModel, MODEL_WHITELIST } from '../../utils/codebuddy.js';
import {
  startCompileLog,
  appendCompileLine,
  finishCompileLog,
  latestCompileLog,
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
  /** 选用的 AI 模型；为空/null 表示使用系统默认模型 */
  model?: string | null;
  /** 任务状态：待开始 / 进行中 / 已结束 */
  status?: AITaskStatus;
  creatorId?: number | null;
  creatorName?: string | null;
}

/**
 * 可选 AI 模型列表（白名单）与系统默认模型。
 * 前端「AI 任务」表单据此渲染下拉选项；defaultModel 为系统配置生效的默认模型（可能为 null）。
 */
export function listAiModels() {
  return { models: MODEL_WHITELIST, defaultModel: resolveModel() };
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

  // 已被未完成队列关联的任务交由队列统一调度，列表里不再展示
  const occupied = await listQueueOccupiedTaskIds();
  if (occupied.length) where.id = { [Op.notIn]: occupied };

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
  // 并切换到创建任务时填入的代码分支。拉取 / 切换 / 建分支 / 写库 任一环节失败，
  // 都必须把已下载的目录删掉，避免无主目录堆积占用磁盘。
  // 子任务与父任务共用一套代码库，无需单独处理。
  let clonedDir: string | null = null;
  // 任务创建时是否由系统新建并推送了分支：删除任务时据此决定是否回收远程分支，
  // 避免误删用户原本就存在、只是被任务复用的分支（如 main/develop）。
  let branchCreated = false;
  if (repoUrl) {
    const target = taskWorkspaceDir(sessionId);
    try {
      clonedDir = await cloneRepo(repoUrl, sessionId);
      if (input.branch) {
        try {
          await checkoutBranch(clonedDir, input.branch);
        } catch (e) {
          const msg = (e as Error).message;
          if (isBranchNotFound(msg)) {
            // 分支不存在：基于当前 HEAD 创建本地分支并推送远端（创建远程分支）
            await createAndPushBranch(clonedDir, input.branch);
            branchCreated = true;
          } else {
            throw ApiError.badRequest(`代码分支切换失败『${input.branch}』，AI 任务创建中止：${msg}`);
          }
        }
      }
    } catch (e) {
      // 拉取 / 切换 / 建分支任一环节失败：删除已下载的目录（cloneRepo 自身已清理时这里是兜底）
      await fs.promises.rm(target, { recursive: true, force: true }).catch(() => undefined);
      if (e instanceof ApiError) throw e;
      throw ApiError.badRequest(`代码库拉取失败，AI 任务创建中止：${(e as Error).message}`);
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
      branchCreated,
      model: input.model?.trim() || null,
      status: input.status ?? '待开始',
      codingStatus: '暂无',
      creatorId: input.creatorId ?? null,
      creatorName: input.creatorName ?? null,
    });
  } catch (e) {
    // 写库失败：删除已拉取的代码目录，避免无主目录堆积占盘
    if (clonedDir) await fs.promises.rm(clonedDir, { recursive: true, force: true }).catch(() => undefined);
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
    model: input.model?.trim() || null,
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

  // 结束任务前：若代码库有未提交改动，则禁止结束（避免丢失 AICoding 产生的修改）
  if (status === '已结束') {
    const sid = task.sessionId;
    if (fs.existsSync(taskWorkspaceDir(sid)) && (await hasUncommittedChanges(sid))) {
      throw ApiError.badRequest('该任务代码库存在未提交的修改，无法结束任务（请先提交代码或处理改动）');
    }
    // 结束任务仅修改状态：保留本地代码仓库、会话缓存与远程分支，便于事后回看与提交
    await task.update({ status });
  } else {
    await task.update({ status });
  }
  return task;
}

export async function removeAiTask(id: number, opts?: { force?: boolean }) {
  const task = await AITask.findByPk(id);
  if (!task) throw ApiError.notFound('AI任务不存在');
  if (await isTaskLocked(task.id)) throw ApiError.badRequest('该任务正在 AICoding 中，无法删除');
  // 代码库有未提交改动时：默认拦截并提示需二次确认（前端弹确认框）；
  // 仅当用户在确认框中「强制删除」(force) 时才放行，丢弃工作区改动。
  const sid = task.sessionId;
  const dir = taskWorkspaceDir(sid);
  if (fs.existsSync(dir) && (await hasUncommittedChanges(sid)) && !opts?.force) {
    throw ApiError.needConfirm('该任务代码库存在未提交的修改，删除将丢弃这些改动，确认继续？');
  }
  // 释放当前会话的 codebuddy 缓存以回收内存，并删除该任务本地代码文件夹（含其中所有文件）
  if (fs.existsSync(dir)) {
    await clearCodebuddySession(sid);
    // 仅回收「由本任务创建」的远程分支：复用已有分支（如 main）的任务删除时不误删，避免丢代码
    if (task.branchCreated && task.branch) await deleteRemoteBranch(dir, task.branch);
    await removeWorkspaceDir(sid);
  }
  // 先删子任务及其编译日志 / 提交记录，避免 sys_ai_sub_task_ibfk_1
  // （parent_id → sys_ai_task.id，无 ON DELETE CASCADE）外键约束导致父任务删除失败。
  // 这些子表本身没有指回父任务的级联删除，必须显式清理，否则会留下孤儿数据。
  await AiSubTask.destroy({ where: { parentId: id } });
  await AiCompileLog.destroy({ where: { taskId: id } });
  await AiGitCommit.destroy({ where: { taskId: id } });
  await task.destroy();
}

/* ── 孤儿工作区检测与回收 ─────────────────────────── */

/** 孤儿工作区：AiWorkSpace 下存在、但数据库里已无对应 AI 任务的目录
 *  （任务被删库未清目录、或创建中途崩溃残留）。父/子任务共用同一 sessionId 目录，
 *  只要 AITask 中还存在该 sessionId 即不算孤儿。 */
export interface OrphanWorkspace {
  sessionId: string;
  path: string;
  sizeBytes: number;
}

/** 递归统计目录磁盘占用（符号链接不深入，避免循环） */
async function dirSize(dir: string): Promise<number> {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop() as string;
    let entries;
    try {
      entries = await fs.promises.readdir(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(cur, e.name);
      try {
        if (e.isDirectory()) stack.push(p);
        else if (e.isSymbolicLink()) total += (await fs.promises.stat(p)).size;
        else if (e.isFile()) total += (await fs.promises.stat(p)).size;
      } catch {
        /* 权限/竞态忽略 */
      }
    }
  }
  return total;
}

/** 列出 AiWorkSpace 下所有孤儿目录及其占用 */
export async function listOrphanWorkspaces(): Promise<OrphanWorkspace[]> {
  await fs.promises.mkdir(AI_WORKSPACE_DIR, { recursive: true });
  let entries;
  try {
    entries = await fs.promises.readdir(AI_WORKSPACE_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const names = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  if (!names.length) return [];

  // 一次性查出仍存在的 sessionId，避免逐目录查库（sessionId 唯一）
  const existing = new Set(
    (
      await AITask.findAll({
        where: { sessionId: { [Op.in]: names } },
        attributes: ['sessionId'],
        raw: true,
      })
    ).map((t) => (t as { sessionId: string }).sessionId),
  );

  const orphans: OrphanWorkspace[] = [];
  for (const name of names) {
    if (existing.has(name)) continue; // 仍有关联任务，不是孤儿
    const dir = taskWorkspaceDir(name);
    const sizeBytes = await dirSize(dir).catch(() => 0);
    orphans.push({ sessionId: name, path: dir, sizeBytes });
  }
  return orphans.sort((a, b) => b.sizeBytes - a.sizeBytes);
}

/** 清理指定孤儿工作区：仅删真实孤儿，二次校验仍有关联任务则跳过，绝不误删。
 *  同时回收对应的 codebuddy 会话缓存，释放磁盘。 */
export async function cleanOrphanWorkspaces(
  sessionIds: string[],
): Promise<{ removed: string[]; freedBytes: number }> {
  if (!sessionIds.length) return { removed: [], freedBytes: 0 };
  // 二次校验：绝不清理仍关联着 AI 任务的目录
  const existing = new Set(
    (
      await AITask.findAll({
        where: { sessionId: { [Op.in]: sessionIds } },
        attributes: ['sessionId'],
        raw: true,
      })
    ).map((t) => (t as { sessionId: string }).sessionId),
  );

  const removed: string[] = [];
  let freedBytes = 0;
  for (const sid of sessionIds) {
    if (existing.has(sid)) continue; // 有关联任务，跳过
    const dir = taskWorkspaceDir(sid);
    if (!fs.existsSync(dir)) continue;
    freedBytes += await dirSize(dir).catch(() => 0);
    await clearCodebuddySession(sid); // 一并回收 codebuddy 会话缓存
    await removeWorkspaceDir(sid);
    removed.push(sid);
  }
  return { removed, freedBytes };
}

/* ── 已结束任务资源回收 ─────────────────────────── */

/**
 * 已结束任务资源占用：任务已结束（仅改状态，本地仓库/会话/分支都保留），
 * 但重资源仍可回收。回收只删本地产物，保留 AITask 行与编译日志/提交记录等历史。
 */
export interface EndedTaskResource {
  id: number;
  title: string;
  sessionId: string;
  branch: string | null;
  /** 是否由系统创建、可回收的远程分支（删除任务时同款逻辑） */
  reclaimableBranch: boolean;
  /** 本地工作区目录是否存在 */
  hasWorkspace: boolean;
  /** 本地工作区磁盘占用（字节） */
  workspaceSizeBytes: number;
  /** codebuddy 会话缓存是否存在 */
  hasSession: boolean;
}

/** 列出「已结束」且仍持有可回收资源的任务 */
export async function listEndedTaskResources(): Promise<EndedTaskResource[]> {
  // 一次性读取 codebuddy projects 目录，判断各任务会话缓存是否存在（避免逐任务扫盘）
  const projectsDir = path.join(codebuddyHomeDir(), 'projects');
  const projEntries = await fs.promises.readdir(projectsDir).catch(() => [] as string[]);
  const hasSession = (sid: string) => projEntries.some((n) => n === sid || n.endsWith(`-${sid}`));

  const tasks = (await AITask.findAll({
    where: { status: '已结束' },
    attributes: ['id', 'title', 'sessionId', 'branch', 'branchCreated'],
    order: [['id', 'DESC']],
    raw: true,
  })) as unknown as Array<{ id: number; title: string; sessionId: string; branch: string | null; branchCreated: boolean | null }>;

  const result: EndedTaskResource[] = [];
  for (const t of tasks) {
    const dir = taskWorkspaceDir(t.sessionId);
    const ws = fs.existsSync(dir);
    const size = ws ? await dirSize(dir).catch(() => 0) : 0;
    const reclaimableBranch = !!t.branchCreated && !!t.branch;
    // 仅列出确实仍持有可回收资源的任务
    if (!ws && !reclaimableBranch && !hasSession(t.sessionId)) continue;
    result.push({
      id: t.id,
      title: t.title,
      sessionId: t.sessionId,
      branch: t.branch,
      reclaimableBranch,
      hasWorkspace: ws,
      workspaceSizeBytes: size,
      hasSession: hasSession(t.sessionId),
    });
  }
  return result;
}

export interface ReclaimResult {
  removedWorkspace: boolean;
  removedBranch: boolean;
  removedSession: boolean;
  freedBytes: number;
}

/**
 * 回收「已结束」任务的本地资源：删本地工作区 + codebuddy 会话缓存，
 * 若分支由系统创建则一并删远程分支。保留 DB 行与历史。
 * 仅「已结束」任务可走此路径；未提交改动需二次确认（force）后才丢弃。
 */
export async function reclaimEndedTaskResources(id: number, opts?: { force?: boolean }): Promise<ReclaimResult> {
  const task = await AITask.findByPk(id);
  if (!task) throw ApiError.notFound('AI任务不存在');
  if (task.status !== '已结束') throw ApiError.badRequest('仅「已结束」任务可回收本地资源');
  if (await isTaskLocked(task.id)) throw ApiError.badRequest('该任务正在 AICoding 中，无法回收');

  const sid = task.sessionId;
  const dir = taskWorkspaceDir(sid);
  const ws = fs.existsSync(dir);
  // 工作区有未提交改动：默认需二次确认，force 才放行（与删除任务一致）
  if (ws && (await hasUncommittedChanges(sid)) && !opts?.force) {
    throw ApiError.needConfirm('该任务代码库存在未提交的修改，回收将丢弃这些改动，确认继续？');
  }

  // 工作区不在时无法推送删除远程分支（需本地仓库），远程分支回收依赖工作区存在
  let removedBranch = false;
  let freedBytes = 0;
  if (ws) {
    freedBytes = await dirSize(dir).catch(() => 0);
    await clearCodebuddySession(sid);
    if (task.branchCreated && task.branch) removedBranch = await deleteRemoteBranch(dir, task.branch);
    await removeWorkspaceDir(sid);
    return { removedWorkspace: true, removedBranch, removedSession: true, freedBytes };
  }

  // 工作区已不在：仍尝试清理可能残留的 codebuddy 会话缓存
  await clearCodebuddySession(sid);
  return { removedWorkspace: false, removedBranch: false, removedSession: true, freedBytes: 0 };
}

/* ── 会话查看器 ─────────────────────────── */

/** 单条会话消息（角色 + 文本） */
export interface SessionMessage {
  role: string;
  text: string;
  timestamp?: number | null;
}

/** 某任务的 AICoding 会话视图：对话记录（来自 codebuddy jsonl）+ 最近一次编译的改动摘要 */
export interface TaskSessionView {
  sessionId: string;
  /** 会话 jsonl 是否存在（工作区被回收后可能已不在） */
  exists: boolean;
  messages: SessionMessage[];
  /** 最近一条编译记录摘要（含改动明细），可能为空 */
  compileLog: Record<string, unknown> | null;
}

/** 单条消息文本上限与总条数上限，避免超大会话撑爆响应 */
const MAX_SESSION_TEXT = 8000;
const MAX_SESSION_MESSAGES = 500;

/** 从 content 数组/字符串中抽取可读文本；工具调用折叠成 `[工具调用: name] ...` */
function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (typeof p === 'string') return p;
        const o = p as { text?: string; type?: string; name?: string; input?: unknown };
        if (typeof o?.text === 'string') return o.text;
        if (o?.type === 'function_call' || o?.type === 'tool_use') {
          const name = o.name ?? 'tool';
          const input = typeof o.input === 'string' ? o.input : JSON.stringify(o.input ?? '');
          return `[工具调用: ${name}] ${input.slice(0, 500)}`;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (content && typeof content === 'object') {
    const o = content as { text?: string };
    if (typeof o?.text === 'string') return o.text;
  }
  return '';
}

/** 读取并解析 codebuddy 会话 jsonl（每行一条 JSON 消息） */
async function readSessionMessages(file: string): Promise<SessionMessage[]> {
  const raw = await fs.promises.readFile(file, 'utf8').catch(() => '');
  const out: SessionMessage[] = [];
  for (const line of raw.split('\n')) {
    const l = line.trim();
    if (!l) continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(l);
    } catch {
      continue;
    }
    const role = (obj.role as string) ?? '';
    const text = extractMessageText(obj.content).slice(0, MAX_SESSION_TEXT);
    if (!role && !text) continue;
    out.push({ role, text, timestamp: (obj.timestamp as number) ?? null });
  }
  // 只保留末尾 MAX_SESSION_MESSAGES 条，避免超长会话撑爆响应
  return out.length > MAX_SESSION_MESSAGES ? out.slice(out.length - MAX_SESSION_MESSAGES) : out;
}

/** 按 sessionId + 任务（及可选子任务）拼装会话视图，父子任务共用同一 sessionId */
export async function buildSessionView(
  sessionId: string,
  taskId: number,
  subTaskId: number | null,
): Promise<TaskSessionView> {
  const file = await findCodebuddySessionFile(sessionId);
  const messages = file ? await readSessionMessages(file) : [];
  const log = await latestCompileLog({ sessionId, taskId, subTaskId: subTaskId ?? null });
  return {
    sessionId,
    exists: !!file,
    messages,
    compileLog: log ? (log.get({ plain: true }) as Record<string, unknown>) : null,
  };
}

/** 父任务 AICoding 会话视图（父子共享同一 sessionId） */
export async function getTaskSession(taskId: number): Promise<TaskSessionView> {
  const task = await AITask.findByPk(taskId);
  if (!task) throw ApiError.notFound('AI任务不存在');
  return buildSessionView(task.sessionId, task.id, null);
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

/**
 * 被「未完成队列」占用的父任务 id 列表。
 * TaskQueueItem.taskId 存的始终是父任务 id（子任务条目也一样），
 * 因此只要父任务或其任一子任务入队，整个父任务都会被算进来。
 * 队列变为「已执行」、队列被删除、条目被移出队列时自动释放，无需额外维护状态。
 */
export async function listQueueOccupiedTaskIds(excludeQueueId?: number): Promise<number[]> {
  const rows = await TaskQueueItem.findAll({
    attributes: ['taskId'],
    group: ['taskId'],
    include: [
      {
        model: TaskQueue,
        as: 'queue',
        attributes: [],
        required: true,
        where: {
          status: { [Op.ne]: '已执行' },
          ...(excludeQueueId ? { id: { [Op.ne]: excludeQueueId } } : {}),
        },
      },
    ],
    raw: true,
  });
  return (rows as unknown as { taskId: number }[]).map((r) => r.taskId);
}

/**
 * 队列执行期间，其关联的任务不允许被手动 AICoding，否则会和队列抢同一个代码库。
 * 一个父任务下的父/子任务共用同一套代码库，所以只要该父任务的任一队列项
 * （父任务本身，或它的任一子任务）处于「执行中」队列，整个父任务（含全部子任务）
 * 都禁止手动 AICoding——即便只是某个子任务被占用，父任务本体和其它兄弟子任务也一并锁定。
 * 队列引擎自己调用时必须跳过该校验（fromQueue），否则会把自己拦死。
 * 这里直查模型而不引 taskQueue.service，避免 service 之间循环依赖。
 */
export async function assertParentNotInRunningQueue(parentId: number): Promise<void> {
  const item = await TaskQueueItem.findOne({
    where: { taskId: parentId },
    include: [{ model: TaskQueue, as: 'queue', where: { status: '执行中' }, attributes: ['name'], required: true }],
  });
  if (item) {
    const name = (item as unknown as { queue?: { name: string } }).queue?.name ?? '';
    throw ApiError.badRequest(`该任务已被任务队列『${name}』占用且队列正在执行，请等待队列完成或暂停后再操作`);
  }
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
  /** 显式选用的 AI 模型；为空/null 表示使用系统默认模型 */
  model?: string | null;
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
  // 模型优先级：任务显式指定（且合法）→ 系统配置默认模型 → 不指定（走 codebuddy 默认）
  const resolvedModel =
    input.model && MODEL_WHITELIST.includes(input.model) ? input.model : resolveModel();
  const log = await startCompileLog({
    sessionId: input.sessionId,
    taskId: input.taskId,
    subTaskId: input.subTaskId,
    taskType: input.taskType,
    title: input.title,
    smartDocId: input.smartDocId,
    branch: input.branch ?? before.branch,
    model: resolvedModel,
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
export async function aicodingAITask(
  id: number,
  actor?: AicodingActor | null,
  opts?: { fromQueue?: boolean },
) {
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
  if (!opts?.fromQueue) await assertParentNotInRunningQueue(task.id);
  if (await activeCodingParentCount(task.id) >= 2) {
    throw ApiError.badRequest('最多允许两个任务同时进行 AICoding，请稍后再试');
  }

  await task.update({ codingStatus: '编译中', codingError: null, status: '进行中' });
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
      model: task.model,
      actor,
    });
  } catch (e) {
    // 起不来就地解锁，别让任务卡在「编译中」
    await task.update({ codingStatus: '编译失败', codingError: (e as Error).message });
    throw ApiError.badRequest(`AICoding 启动失败：${(e as Error).message}`);
  }
  return { codingStatus: '编译中' as AicodingStatus };
}
