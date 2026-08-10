import { Op } from 'sequelize';
import { sequelize } from '../../db/index.js';
import { DataTask, TASK_STATUS, DataTaskUser, DataTaskProject, DataTaskInterface, DataSimProject, DataSimInterface, User } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';

export const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'] as const;

export interface DataTaskInput {
  name: string;
  projectIds: string[];
  interfaceCount: number;
  userIds?: number[];
}

export interface TaskUserItem {
  id: number;
  nickname: string;
}

export interface DataTaskProjectItem {
  projectId: string;
  name: string;
}

export interface DataTaskListItem {
  id: number;
  name: string;
  projectIds: string[];
  projectNames: string[];
  interfaceCount: number;
  status: number;
  progress: number;
  createdCount: number;
  users: TaskUserItem[];
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListTaskFilter {
  keyword?: string;
  status?: number;
  page?: number;
  pageSize?: number;
}

export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SyncResult {
  imported: number;
  updated: number;
}

/** 计算任务完成进度（封顶 100，四舍五入） */
function calcProgress(createdCount: number, target: number): number {
  if (!target || target <= 0) return 0;
  return Math.min(100, Math.round((createdCount / target) * 100));
}

async function createdCountOf(taskId: number): Promise<number> {
  return DataTaskInterface.count({ where: { taskId } });
}

/** 批量取多个任务的已创建接口数，返回 Map<taskId, count> */
async function createdCountMap(taskIds: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (taskIds.length === 0) return map;
  const rows = await DataTaskInterface.findAll({
    where: { taskId: { [Op.in]: taskIds } },
    attributes: ['taskId', [sequelize.fn('COUNT', sequelize.col('id')), 'cnt']],
    group: ['task_id'],
  });
  for (const r of rows) {
    const plain = r.get({ plain: true }) as unknown as { taskId: number; cnt: string | number };
    map.set(plain.taskId, Number(plain.cnt));
  }
  return map;
}

async function usersOfTask(taskId: number): Promise<TaskUserItem[]> {
  const rows = await DataTaskUser.findAll({
    where: { taskId },
    include: [{ model: User, as: 'user', attributes: ['id', 'nickname'] }],
    attributes: [],
  });
  return rows
    .map((r) => (r as unknown as { user?: { id: number; nickname: string } }).user)
    .filter((u): u is { id: number; nickname: string } => !!u)
    .map((u) => ({ id: u.id, nickname: u.nickname }));
}

/** 批量取任务关联的项目 id 列表，返回 Map<taskId, projectId[]> */
async function projectIdsMap(taskIds: number[]): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  if (taskIds.length === 0) return map;
  const links = await DataTaskProject.findAll({ where: { taskId: { [Op.in]: taskIds } } });
  for (const link of links) {
    const arr = map.get(link.taskId) ?? [];
    arr.push(link.projectId);
    map.set(link.taskId, arr);
  }
  return map;
}

export async function listDataTasks(filter: ListTaskFilter): Promise<PageResult<DataTaskListItem>> {
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 10;
  const where: Record<string, unknown> = {};
  if (filter.keyword && filter.keyword.trim()) {
    where.name = { [Op.like]: `%${filter.keyword.trim()}%` };
  }
  if (filter.status !== undefined && filter.status !== null) {
    where.status = filter.status;
  }
  const { rows, count } = await DataTask.findAndCountAll({
    where,
    order: [['id', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  const counts = await createdCountMap(rows.map((r) => r.id));
  const links = await projectIdsMap(rows.map((r) => r.id));
  const allProjIds = [...new Set([...links.values()].flat())];
  const projects = allProjIds.length
    ? await DataSimProject.findAll({ where: { projectId: { [Op.in]: allProjIds } } })
    : [];
  const projNameMap = new Map(projects.map((p) => [p.projectId, p.name]));

  const list = await Promise.all(
    rows.map(async (t) => {
      const createdCount = counts.get(t.id) ?? 0;
      const projectIds = links.get(t.id) ?? [];
      return {
        id: t.id,
        name: t.name,
        projectIds,
        projectNames: projectIds.map((pid) => projNameMap.get(pid) ?? pid),
        interfaceCount: t.interfaceCount,
        status: t.status,
        progress: calcProgress(createdCount, t.interfaceCount),
        createdCount,
        users: await usersOfTask(t.id),
        createdBy: t.createdBy,
        updatedBy: t.updatedBy,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      } as DataTaskListItem;
    }),
  );
  return { list, total: count, page, pageSize };
}

export async function getDataTask(id: number): Promise<DataTask> {
  const t = await DataTask.findByPk(id);
  if (!t) throw ApiError.notFound('任务不存在');
  return t;
}

/** 校验关联项目均存在且至少有一个；返回去重后的项目 id 列表 */
async function assertProjectsExist(projectIds: string[]): Promise<string[]> {
  const unique = [...new Set(projectIds.map((p) => p.trim()).filter(Boolean))];
  if (unique.length === 0) throw ApiError.badRequest('请至少关联一个项目');
  const found = await DataSimProject.findAll({ where: { projectId: { [Op.in]: unique } } });
  if (found.length !== unique.length) throw ApiError.badRequest('存在无效的关联项目');
  return unique;
}

/** 全量替换任务的关联项目（先删后插，幂等） */
async function setTaskProjects(taskId: number, projectIds: string[]): Promise<void> {
  const unique = await assertProjectsExist(projectIds);
  await DataTaskProject.destroy({ where: { taskId } });
  if (unique.length) {
    await DataTaskProject.bulkCreate(
      unique.map((pid) => ({ taskId, projectId: pid })),
      { ignoreDuplicates: true },
    );
  }
}

/** 取任务的关联项目 id 列表（去重） */
async function projectIdsOf(taskId: number): Promise<string[]> {
  const links = await DataTaskProject.findAll({ where: { taskId } });
  return [...new Set(links.map((l) => l.projectId))];
}

export async function createDataTask(input: DataTaskInput, auth: { id: number; nickname: string }): Promise<DataTask> {
  const unique = await assertProjectsExist(input.projectIds);

  const task = await DataTask.create({
    name: input.name.trim(),
    // 保留首个项目作为冗余主项目，便于历史查询与兼容
    projectId: unique[0]!,
    interfaceCount: input.interfaceCount,
    status: TASK_STATUS.IN_PROGRESS,
    createdBy: auth.nickname,
    updatedBy: auth.nickname,
  });

  await setTaskProjects(task.id, unique);
  if (input.userIds?.length) {
    await DataTaskUser.bulkCreate(
      input.userIds.map((userId) => ({ taskId: task.id, userId })),
      { ignoreDuplicates: true },
    );
  }
  return task;
}

export async function updateDataTask(
  id: number,
  input: { name?: string; projectIds?: string[]; interfaceCount?: number; userIds?: number[] },
  auth: { id: number; nickname: string },
): Promise<DataTask> {
  const t = await getDataTask(id);
  if (t.status === TASK_STATUS.SUCCESS) throw ApiError.badRequest('任务已成功，不可修改');

  if (input.projectIds) {
    const unique = await assertProjectsExist(input.projectIds);
    await setTaskProjects(t.id, unique);
    t.projectId = unique[0]!;
  }
  if (input.name !== undefined) t.name = input.name.trim();
  if (input.interfaceCount !== undefined) t.interfaceCount = input.interfaceCount;
  t.updatedBy = auth.nickname;
  await t.save();

  if (input.userIds) {
    await DataTaskUser.destroy({ where: { taskId: t.id } });
    if (input.userIds.length) {
      await DataTaskUser.bulkCreate(
        input.userIds.map((userId) => ({ taskId: t.id, userId })),
        { ignoreDuplicates: true },
      );
    }
  }
  return t;
}

export async function removeDataTask(id: number): Promise<void> {
  const t = await getDataTask(id);
  if (t.status === TASK_STATUS.SUCCESS) throw ApiError.badRequest('任务已成功，不可删除');
  await DataTaskUser.destroy({ where: { taskId: t.id } });
  await DataTaskProject.destroy({ where: { taskId: t.id } });
  await DataTaskInterface.destroy({ where: { taskId: t.id } });
  await t.destroy();
}

export async function changeTaskStatus(
  id: number,
  status: number,
  auth: { id: number; nickname: string },
): Promise<DataTask> {
  const t = await getDataTask(id);

  const valid: number[] = [TASK_STATUS.IN_PROGRESS, TASK_STATUS.SUCCESS, TASK_STATUS.FAILED];
  if (!valid.includes(status)) {
    throw ApiError.badRequest('非法的任务状态');
  }
  if (status === TASK_STATUS.SUCCESS) {
    const created = await createdCountOf(t.id);
    if (created < t.interfaceCount) {
      throw ApiError.badRequest(`完成度未到 100%（已创建 ${created}/${t.interfaceCount}），不能改为成功`);
    }
  }
  t.status = status;
  t.updatedBy = auth.nickname;
  await t.save();
  return t;
}

/* ── 任务接口 ─────────────────────────────────────── */

export interface DataTaskInterfaceInput {
  description: string;
  method: string;
  path: string;
  responseData?: string | null;
}

export async function listTaskInterfaces(
  taskId: number,
  filter: { keyword?: string; page?: number; pageSize?: number },
): Promise<PageResult<DataTaskInterface>> {
  const t = await getDataTask(taskId);
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 10;
  const where: { [key: string]: unknown; [key: symbol]: unknown } = { taskId: t.id };
  if (filter.keyword && filter.keyword.trim()) {
    const kw = filter.keyword.trim();
    where[Op.or] = [
      { description: { [Op.like]: `%${kw}%` } },
      { path: { [Op.like]: `%${kw}%` } },
      { method: kw.toUpperCase() },
    ];
  }
  const { rows, count } = await DataTaskInterface.findAndCountAll({
    where,
    order: [['id', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  return { list: rows, total: count, page, pageSize };
}

async function assertEditable(taskId: number): Promise<DataTask> {
  const t = await getDataTask(taskId);
  if (t.status === TASK_STATUS.SUCCESS) throw ApiError.badRequest('任务已成功，接口不可再修改');
  return t;
}

async function isPathTaken(taskId: number, path: string, excludeId?: number): Promise<boolean> {
  const where: Record<string, unknown> = { taskId, path: path.trim() };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  return !!(await DataTaskInterface.findOne({ where }));
}

export async function createTaskInterface(
  taskId: number,
  input: DataTaskInterfaceInput,
  auth: { id: number; nickname: string },
): Promise<DataTaskInterface> {
  await assertEditable(taskId);
  if (await isPathTaken(taskId, input.path)) throw ApiError.conflict('接口路径已存在');
  return DataTaskInterface.create({
    taskId,
    description: input.description.trim(),
    method: input.method,
    path: input.path.trim(),
    responseData: input.responseData ?? null,
    createdBy: auth.nickname,
    updatedBy: auth.nickname,
  });
}

export async function updateTaskInterface(
  taskId: number,
  interfaceId: number,
  input: DataTaskInterfaceInput,
  auth: { id: number; nickname: string },
): Promise<DataTaskInterface> {
  await assertEditable(taskId);
  const it = await DataTaskInterface.findOne({ where: { id: interfaceId, taskId } });
  if (!it) throw ApiError.notFound('接口不存在');
  if (await isPathTaken(taskId, input.path, interfaceId)) throw ApiError.conflict('接口路径已存在');
  it.description = input.description.trim();
  it.method = input.method;
  it.path = input.path.trim();
  it.responseData = input.responseData ?? null;
  // 已同步过的接口被修改后，标记回未同步（同步副本已过时，需重新同步）
  if (it.synced) it.synced = false;
  it.updatedBy = auth.nickname;
  await it.save();
  return it;
}

export async function removeTaskInterface(taskId: number, interfaceId: number): Promise<void> {
  await assertEditable(taskId);
  const it = await DataTaskInterface.findOne({ where: { id: interfaceId, taskId } });
  if (!it) throw ApiError.notFound('接口不存在');
  await it.destroy();
}

/**
 * 把任务下的接口一键同步到其关联的所有项目：对每个关联项目按 path upsert 进
 * sys_data_sim_interface（同一项目内 path 唯一，跨项目互不影响），并把这些任务接口标记为已同步。
 * 重复同步幂等：已存在的 path 走更新，不存在的走新增。
 */
export async function syncTaskInterfaces(
  taskId: number,
  auth: { id: number; nickname: string },
): Promise<SyncResult> {
  const t = await getDataTask(taskId);
  if (t.status === TASK_STATUS.SUCCESS) throw ApiError.badRequest('任务已成功，不能同步');

  const projectIds = await projectIdsOf(taskId);
  if (projectIds.length === 0) {
    throw ApiError.badRequest('该任务尚未关联任何项目，请先在编辑中关联项目后再同步');
  }

  const interfaces = await DataTaskInterface.findAll({ where: { taskId } });
  if (interfaces.length === 0) return { imported: 0, updated: 0 };

  let imported = 0;
  let updated = 0;
  const syncedIds: number[] = [];

  for (const pid of projectIds) {
    const existingMap = new Map<string, number>();
    for (const it of await DataSimInterface.findAll({
      where: { projectId: pid },
      attributes: ['id', 'path'],
    })) {
      existingMap.set(it.path.trim(), it.id);
    }

    for (const src of interfaces) {
      const path = src.path.trim();
      const payload = {
        description: src.description,
        method: src.method,
        path,
        responseData: src.responseData,
      };
      const existingId = existingMap.get(path);
      if (existingId != null) {
        await DataSimInterface.update({ ...payload, updatedBy: auth.nickname }, { where: { id: existingId } });
        updated++;
      } else {
        const created = await DataSimInterface.create({
          projectId: pid,
          createdBy: auth.nickname,
          updatedBy: auth.nickname,
          ...payload,
        });
        existingMap.set(path, created.id);
        imported++;
      }
      syncedIds.push(src.id);
    }
  }

  if (syncedIds.length) {
    await DataTaskInterface.update({ synced: true }, { where: { id: { [Op.in]: syncedIds } } });
  }
  return { imported, updated };
}

/** 责任人候选：返回全部用户（id / nickname / username） */
export async function listUsers(): Promise<{ id: number; nickname: string; username: string }[]> {
  const rows = await User.findAll({ attributes: ['id', 'nickname', 'username'], order: [['id', 'ASC']] });
  return rows.map((u) => ({ id: u.id, nickname: u.nickname, username: u.username }));
}
