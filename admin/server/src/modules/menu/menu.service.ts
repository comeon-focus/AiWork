import { Op } from 'sequelize';
import { Menu, RoleMenu } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { buildTree, collectDescendantIds } from '../../utils/tree.js';
import { MenuType, type MenuTypeValue } from '../../types/index.js';
import { sequelize } from '../../db/index.js';

export interface MenuInput {
  parentId: number;
  name: string;
  type: MenuTypeValue;
  path?: string | null;
  component?: string | null;
  perms?: string | null;
  icon?: string | null;
  sort: number;
  visible: number;
  status: number;
  keepAlive: number;
  redirect?: string | null;
}

/** 按节点类型校验必填项，保证菜单树本身就是一份合法的权限清单 */
function assertValid(input: MenuInput) {
  if (input.type === MenuType.BUTTON) {
    if (!input.perms?.trim()) throw ApiError.badRequest('按钮类型必须填写权限标识');
  }
  if (input.type === MenuType.MENU) {
    if (!input.path?.trim()) throw ApiError.badRequest('页面类型必须填写路由地址');
    if (!input.component?.trim()) throw ApiError.badRequest('页面类型必须填写组件路径');
  }
  if (input.type === MenuType.CATALOG && !input.path?.trim()) {
    throw ApiError.badRequest('目录类型必须填写路由地址');
  }
}

export async function listMenus(filter: { name?: string; status?: number; type?: MenuTypeValue }) {
  const where: Record<string, unknown> = {};
  if (filter.name) where.name = { [Op.like]: `%${filter.name}%` };
  if (filter.status !== undefined) where.status = filter.status;
  if (filter.type) where.type = filter.type;

  return Menu.findAll({
    where,
    order: [
      ['parentId', 'ASC'],
      ['sort', 'ASC'],
    ],
  });
}

export async function menuTree(filter: { name?: string; status?: number; type?: MenuTypeValue }) {
  const list = await listMenus(filter);
  return buildTree(list.map((m) => m.toJSON()));
}

async function ensurePermsUnique(perms: string | null | undefined, excludeId?: number) {
  const value = perms?.trim();
  if (!value) return;
  const where: Record<string, unknown> = { perms: value };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  if (await Menu.count({ where })) throw ApiError.conflict(`权限标识 ${value} 已存在`);
}

export async function createMenu(input: MenuInput) {
  assertValid(input);
  await ensurePermsUnique(input.perms);
  return Menu.create({ ...input, perms: input.perms?.trim() || null });
}

export async function updateMenu(id: number, input: MenuInput) {
  const menu = await Menu.findByPk(id);
  if (!menu) throw ApiError.notFound('菜单不存在');
  assertValid(input);
  if (input.parentId === id) throw ApiError.badRequest('上级菜单不能是自己');

  const all = await Menu.findAll({ attributes: ['id', 'parentId'], raw: true });
  if (collectDescendantIds(all, id).includes(input.parentId)) {
    throw ApiError.badRequest('上级菜单不能是自己的下级');
  }

  await ensurePermsUnique(input.perms, id);
  await menu.update({ ...input, perms: input.perms?.trim() || null });
  return menu;
}

export async function removeMenu(id: number) {
  const menu = await Menu.findByPk(id);
  if (!menu) throw ApiError.notFound('菜单不存在');

  const childCount = await Menu.count({ where: { parentId: id } });
  if (childCount > 0) throw ApiError.conflict('存在子菜单，请先删除子菜单');

  // 同步清掉角色授权，避免留下指向不存在菜单的脏关联
  await sequelize.transaction(async (tx) => {
    await RoleMenu.destroy({ where: { menuId: id }, transaction: tx });
    await menu.destroy({ transaction: tx });
  });
}
