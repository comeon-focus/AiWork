import { Op } from 'sequelize';
import { Role, RoleMenu, RoleDept, RoleCodeRepo, UserRole } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { sequelize } from '../../db/index.js';
import { DataScope, type DataScopeType } from '../../types/index.js';
import { SUPER_ROLE_KEY } from '../../services/permission.service.js';

export interface RoleInput {
  name: string;
  roleKey: string;
  sort: number;
  status: number;
  remark?: string | null;
  dataScope: DataScopeType;
  /** 已勾选的菜单 id（含目录、页面、按钮），一次性覆盖式保存 */
  menuIds?: number[];
  /** dataScope=CUSTOM 时的部门 id */
  deptIds?: number[];
  /** 已授权的代码库 id，覆盖式保存 */
  repoIds?: number[];
}

function assertNotSuperRole(role: Role) {
  if (role.roleKey === SUPER_ROLE_KEY) {
    throw ApiError.forbidden('超级管理员角色受保护，不允许修改或删除');
  }
}

export async function listRoles(filter: {
  name?: string;
  roleKey?: string;
  status?: number;
  offset: number;
  limit: number;
}) {
  const where: Record<string, unknown> = { delFlag: 0 };
  if (filter.name) where.name = { [Op.like]: `%${filter.name}%` };
  if (filter.roleKey) where.roleKey = { [Op.like]: `%${filter.roleKey}%` };
  if (filter.status !== undefined) where.status = filter.status;

  return Role.findAndCountAll({
    where,
    offset: filter.offset,
    limit: filter.limit,
    order: [
      ['sort', 'ASC'],
      ['id', 'ASC'],
    ],
  });
}

/** 下拉选项：分配用户角色时用 */
export async function allRoles() {
  return Role.findAll({
    where: { delFlag: 0, status: 1 },
    attributes: ['id', 'name', 'roleKey'],
    order: [['sort', 'ASC']],
  });
}

export async function getRole(id: number) {
  const role = await Role.findOne({ where: { id, delFlag: 0 } });
  if (!role) throw ApiError.notFound('角色不存在');

  const [menuRows, deptRows, repoRows] = await Promise.all([
    RoleMenu.findAll({ where: { roleId: id }, raw: true }),
    RoleDept.findAll({ where: { roleId: id }, raw: true }),
    RoleCodeRepo.findAll({ where: { roleId: id }, raw: true }),
  ]);

  return {
    ...role.toJSON(),
    menuIds: menuRows.map((r) => r.menuId),
    deptIds: deptRows.map((r) => r.deptId),
    repoIds: repoRows.map((r) => r.repoId),
  };
}

export async function createRole(input: RoleInput) {
  if (input.roleKey === SUPER_ROLE_KEY) throw ApiError.badRequest(`角色标识 ${SUPER_ROLE_KEY} 为系统保留`);

  return sequelize.transaction(async (tx) => {
    const role = await Role.create(
      {
        name: input.name,
        roleKey: input.roleKey,
        sort: input.sort,
        status: input.status,
        remark: input.remark ?? null,
        dataScope: input.dataScope,
      },
      { transaction: tx },
    );

    const menuIds = [...new Set(input.menuIds ?? [])];
    if (menuIds.length) {
      await RoleMenu.bulkCreate(menuIds.map((menuId) => ({ roleId: role.id, menuId })), { transaction: tx });
    }

    const repoIds = [...new Set(input.repoIds ?? [])];
    if (repoIds.length) {
      await RoleCodeRepo.bulkCreate(repoIds.map((repoId) => ({ roleId: role.id, repoId })), { transaction: tx });
    }

    if (input.dataScope === DataScope.CUSTOM) {
      const deptIds = [...new Set(input.deptIds ?? [])];
      if (deptIds.length) {
        await RoleDept.bulkCreate(deptIds.map((deptId) => ({ roleId: role.id, deptId })), { transaction: tx });
      }
    }

    return role;
  });
}

export async function updateRole(id: number, input: RoleInput) {
  const role = await Role.findOne({ where: { id, delFlag: 0 } });
  if (!role) throw ApiError.notFound('角色不存在');
  assertNotSuperRole(role);

  return sequelize.transaction(async (tx) => {
    await role.update(
      {
        name: input.name,
        roleKey: input.roleKey,
        sort: input.sort,
        status: input.status,
        remark: input.remark ?? null,
        dataScope: input.dataScope,
      },
      { transaction: tx },
    );

    // 菜单授权：整体覆盖，避免增量维护带来的残留与重复
    if (input.menuIds) {
      await RoleMenu.destroy({ where: { roleId: id }, transaction: tx });
      const menuIds = [...new Set(input.menuIds)];
      if (menuIds.length) {
        await RoleMenu.bulkCreate(menuIds.map((menuId) => ({ roleId: id, menuId })), { transaction: tx });
      }
    }

    // 代码库授权：整体覆盖
    await RoleCodeRepo.destroy({ where: { roleId: id }, transaction: tx });
    const repoIds = [...new Set(input.repoIds ?? [])];
    if (repoIds.length) {
      await RoleCodeRepo.bulkCreate(repoIds.map((repoId) => ({ roleId: id, repoId })), { transaction: tx });
    }

    // 非自定义范围时清空部门关联，防止切回 CUSTOM 时残留旧配置
    await RoleDept.destroy({ where: { roleId: id }, transaction: tx });
    if (input.dataScope === DataScope.CUSTOM) {
      const deptIds = [...new Set(input.deptIds ?? [])];
      if (deptIds.length) {
        await RoleDept.bulkCreate(deptIds.map((deptId) => ({ roleId: id, deptId })), { transaction: tx });
      }
    }

    return role;
  });
}

export async function removeRole(id: number) {
  const role = await Role.findOne({ where: { id, delFlag: 0 } });
  if (!role) throw ApiError.notFound('角色不存在');
  assertNotSuperRole(role);

  const used = await UserRole.count({ where: { roleId: id } });
  if (used > 0) throw ApiError.conflict(`该角色已分配给 ${used} 个用户，请先解除关联`);

  await sequelize.transaction(async (tx) => {
    await RoleMenu.destroy({ where: { roleId: id }, transaction: tx });
    await RoleDept.destroy({ where: { roleId: id }, transaction: tx });
    await RoleCodeRepo.destroy({ where: { roleId: id }, transaction: tx });
    await role.update({ delFlag: 1 }, { transaction: tx });
  });
}
