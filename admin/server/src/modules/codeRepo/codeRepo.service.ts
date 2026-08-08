import { Op } from 'sequelize';
import { CodeRepo, RoleCodeRepo } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { sequelize } from '../../db/index.js';

export interface CodeRepoInput {
  name: string;
  address?: string | null;
  remark?: string | null;
  status: number;
  sort: number;
}

export interface CodeRepoFilter {
  name?: string;
  /** 数据权限过滤：非超管只能看到被角色分配的代码库 */
  ids?: number[];
}

export async function listCodeRepos(filter: CodeRepoFilter) {
  const where: Record<string, unknown> = {};
  if (filter.name) where.name = { [Op.like]: `%${filter.name}%` };
  if (filter.ids && filter.ids.length) where.id = { [Op.in]: filter.ids };

  return CodeRepo.findAll({
    where,
    order: [
      ['sort', 'ASC'],
      ['id', 'ASC'],
    ],
  });
}

/** 角色集合对应的代码库 id 并集 */
export async function getRoleRepoIds(roleIds: number[]): Promise<number[]> {
  if (roleIds.length === 0) return [];
  const rows = await RoleCodeRepo.findAll({ where: { roleId: { [Op.in]: roleIds } }, raw: true });
  return [...new Set(rows.map((r) => r.repoId))];
}

export async function createCodeRepo(input: CodeRepoInput) {
  const name = input.name.trim();
  if (await CodeRepo.count({ where: { name } })) throw ApiError.conflict(`代码库「${name}」已存在`);
  return CodeRepo.create({ name, address: input.address?.trim() || null, remark: input.remark?.trim() || null, status: input.status, sort: input.sort });
}

export async function updateCodeRepo(id: number, input: CodeRepoInput) {
  const repo = await CodeRepo.findByPk(id);
  if (!repo) throw ApiError.notFound('代码库不存在');
  const name = input.name.trim();
  if (name !== repo.name && (await CodeRepo.count({ where: { name, id: { [Op.ne]: id } } }))) {
    throw ApiError.conflict(`代码库「${name}」已存在`);
  }
  await repo.update({ name, address: input.address?.trim() || null, remark: input.remark?.trim() || null, status: input.status, sort: input.sort });
  return repo;
}

export async function removeCodeRepo(id: number) {
  const repo = await CodeRepo.findByPk(id);
  if (!repo) throw ApiError.notFound('代码库不存在');
  // 同步清掉角色授权，避免留下指向不存在代码库的脏关联
  await sequelize.transaction(async (tx) => {
    await RoleCodeRepo.destroy({ where: { repoId: id }, transaction: tx });
    await repo.destroy({ transaction: tx });
  });
}
