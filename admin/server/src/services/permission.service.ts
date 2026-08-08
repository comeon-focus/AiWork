import { Op, type Order } from 'sequelize';
import { User, Role, Menu, RoleMenu, RoleDept, RoleCodeRepo } from '../models/index.js';
import { DataScope, MenuType, type AuthUser, type RoleScope } from '../types/index.js';

/** 超管角色标识：拥有该角色等同于超级管理员 */
export const SUPER_ROLE_KEY = 'admin';

export interface LoadedUser {
  user: User;
  roles: Role[];
  auth: AuthUser;
}

/**
 * 解析用户的「有效权限」——全系统唯一的权限计算入口。
 * 中间件、登录、profile 都走这里，保证前端看到的和后端拦截的完全一致。
 */
export async function loadAuthUser(userId: number): Promise<LoadedUser | null> {
  const user = await User.findOne({ where: { id: userId, delFlag: 0 } });
  if (!user || user.status !== 1) return null;

  const roles = await getUserRoles(userId);
  const isSuper = user.isSuper || roles.some((r) => r.roleKey === SUPER_ROLE_KEY);

  const auth: AuthUser = {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    deptId: user.deptId,
    isSuper,
    perms: isSuper ? ['*'] : await getRolePerms(roles.map((r) => r.id)),
    dataScopes: isSuper ? [{ scope: DataScope.ALL, customDeptIds: [] }] : await getRoleScopes(roles),
    codeRepoIds: isSuper ? [] : await getRoleRepoIds(roles.map((r) => r.id)),
  };

  return { user, roles, auth };
}

/** 用户启用中的角色 */
export async function getUserRoles(userId: number): Promise<Role[]> {
  const rows = await User.findByPk(userId, {
    include: [
      {
        model: Role,
        as: 'roles',
        through: { attributes: [] },
        where: { status: 1, delFlag: 0 },
        required: false,
      },
    ],
  });
  return rows?.roles ?? [];
}

/** 角色集合对应的操作权限码并集 */
export async function getRolePerms(roleIds: number[]): Promise<string[]> {
  if (roleIds.length === 0) return [];
  const menus = await Menu.findAll({
    attributes: ['perms'],
    where: { perms: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] }, status: 1 },
    include: [
      {
        model: Role,
        as: 'roles',
        attributes: [],
        through: { attributes: [] },
        where: { id: { [Op.in]: roleIds } },
        required: true,
      },
    ],
    raw: true,
  });
  return [...new Set(menus.map((m) => m.perms!).filter(Boolean))];
}

/** 各角色的数据范围（CUSTOM 角色附带其自定义部门集合） */
export async function getRoleScopes(roles: Role[]): Promise<RoleScope[]> {
  const customRoleIds = roles.filter((r) => r.dataScope === DataScope.CUSTOM).map((r) => r.id);

  const deptMap = new Map<number, number[]>();
  if (customRoleIds.length > 0) {
    const rows = await RoleDept.findAll({ where: { roleId: { [Op.in]: customRoleIds } }, raw: true });
    for (const row of rows) {
      const arr = deptMap.get(row.roleId) ?? [];
      arr.push(row.deptId);
      deptMap.set(row.roleId, arr);
    }
  }

  return roles.map((r) => ({ scope: r.dataScope, customDeptIds: deptMap.get(r.id) ?? [] }));
}

/**
 * 用户可访问的菜单节点（页面权限来源）。
 * 超管直接取全量，普通用户按角色授权取并集，天然去重。
 */
export async function getUserMenus(auth: AuthUser, roleIds: number[]): Promise<Menu[]> {
  const where = { status: 1, type: { [Op.in]: [MenuType.CATALOG, MenuType.MENU] } };
  const order: Order = [
    ['parentId', 'ASC'],
    ['sort', 'ASC'],
  ];

  if (auth.isSuper) return Menu.findAll({ where, order });
  if (roleIds.length === 0) return [];

  return Menu.findAll({
    where,
    order,
    include: [
      {
        model: Role,
        as: 'roles',
        attributes: [],
        through: { attributes: [] },
        where: { id: { [Op.in]: roleIds } },
        required: true,
      },
    ],
  });
}

/** 角色已勾选的菜单 id 列表（授权回显用） */
export async function getRoleMenuIds(roleId: number): Promise<number[]> {
  const rows = await RoleMenu.findAll({ where: { roleId }, raw: true });
  return rows.map((r) => r.menuId);
}

/** 角色集合对应的代码库 id 并集（代码库数据权限） */
export async function getRoleRepoIds(roleIds: number[]): Promise<number[]> {
  if (roleIds.length === 0) return [];
  const rows = await RoleCodeRepo.findAll({ where: { roleId: { [Op.in]: roleIds } }, raw: true });
  return [...new Set(rows.map((r) => r.repoId))];
}
