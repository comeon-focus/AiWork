import { Op } from 'sequelize';
import { User, Role, Dept, UserRole } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { sequelize } from '../../db/index.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { buildDataScopeWhere, withDataScope } from '../../utils/dataScope.js';
import { revokeAllTokens } from '../auth/auth.service.js';
import { SUPER_ROLE_KEY } from '../../services/permission.service.js';
import type { AuthUser } from '../../types/index.js';

export interface UserInput {
  deptId?: number | null;
  username: string;
  password?: string;
  nickname: string;
  email?: string | null;
  phone?: string | null;
  gender: number;
  status: number;
  remark?: string | null;
  roleIds?: number[];
}

const userInclude = [
  { model: Dept, as: 'dept', attributes: ['id', 'name'] },
  { model: Role, as: 'roles', attributes: ['id', 'name', 'roleKey'], through: { attributes: [] } },
];

/**
 * 取用户时叠加数据权限条件。
 * 详情/修改/删除都走这里，避免「列表被过滤、但直接按 id 请求就能越权」的漏洞。
 */
async function findUserInScope(auth: AuthUser, id: number): Promise<User> {
  const scope = buildDataScopeWhere(auth, { deptField: 'deptId', userField: 'id' });
  const user = await User.findOne({ where: withDataScope({ id, delFlag: 0 }, scope), include: userInclude });
  if (!user) throw ApiError.forbidden('该用户不存在或不在你的数据权限范围内');
  return user;
}

async function assertCanOperate(auth: AuthUser, target: User) {
  if (target.isSuper && !auth.isSuper) throw ApiError.forbidden('不能操作超级管理员');
}

export async function listUsers(
  auth: AuthUser,
  filter: {
    username?: string;
    nickname?: string;
    phone?: string;
    status?: number;
    deptId?: number;
    offset: number;
    limit: number;
  },
) {
  const business: Record<string, unknown> = { delFlag: 0 };
  if (filter.username) business.username = { [Op.like]: `%${filter.username}%` };
  if (filter.nickname) business.nickname = { [Op.like]: `%${filter.nickname}%` };
  if (filter.phone) business.phone = { [Op.like]: `%${filter.phone}%` };
  if (filter.status !== undefined) business.status = filter.status;
  if (filter.deptId) {
    // 按部门筛选时含其子部门，与侧边部门树的直觉一致
    business.deptId = {
      [Op.in]: sequelize.literal(
        `(SELECT id FROM sys_dept WHERE del_flag = 0 AND (id = ${Number(filter.deptId)} OR FIND_IN_SET(${Number(filter.deptId)}, ancestors)))`,
      ),
    };
  }

  const scope = buildDataScopeWhere(auth, { deptField: 'deptId', userField: 'id' });

  return User.findAndCountAll({
    where: withDataScope(business, scope),
    include: userInclude,
    offset: filter.offset,
    limit: filter.limit,
    order: [['id', 'DESC']],
    distinct: true,
  });
}

/** 部门负责人候选：返回全部未删除用户（id / nickname / username） */
export async function listUserOptions(): Promise<{ id: number; nickname: string; username: string }[]> {
  const rows = await User.findAll({
    where: { delFlag: 0 },
    attributes: ['id', 'nickname', 'username'],
    order: [['id', 'ASC']],
  });
  return rows.map((u) => ({ id: u.id, nickname: u.nickname, username: u.username }));
}

export async function getUser(auth: AuthUser, id: number) {
  const user = await findUserInScope(auth, id);
  return { ...user.toJSON(), roleIds: (user.roles ?? []).map((r) => r.id) };
}

async function assertRolesAssignable(auth: AuthUser, roleIds: number[]) {
  if (roleIds.length === 0) return;
  const roles = await Role.findAll({ where: { id: { [Op.in]: roleIds }, delFlag: 0 } });
  if (roles.length !== roleIds.length) throw ApiError.badRequest('存在无效的角色');
  // 只有超管能把「超管角色」授予他人，防止普通管理员自我提权
  if (!auth.isSuper && roles.some((r) => r.roleKey === SUPER_ROLE_KEY)) {
    throw ApiError.forbidden('无权分配超级管理员角色');
  }
}

export async function createUser(auth: AuthUser, input: UserInput) {
  if (!input.password) throw ApiError.badRequest('新增用户必须设置初始密码');
  const roleIds = [...new Set(input.roleIds ?? [])];
  await assertRolesAssignable(auth, roleIds);

  return sequelize.transaction(async (tx) => {
    const user = await User.create(
      {
        deptId: input.deptId ?? null,
        username: input.username,
        password: await hashPassword(input.password!),
        nickname: input.nickname,
        email: input.email ?? null,
        phone: input.phone ?? null,
        avatar: null,
        gender: input.gender,
        status: input.status,
        lastLoginAt: null,
        lastLoginIp: null,
        remark: input.remark ?? null,
      },
      { transaction: tx },
    );

    if (roleIds.length) {
      await UserRole.bulkCreate(roleIds.map((roleId) => ({ userId: user.id, roleId })), { transaction: tx });
    }
    return user;
  });
}

export async function updateUser(auth: AuthUser, id: number, input: Omit<UserInput, 'username'>) {
  const user = await findUserInScope(auth, id);
  await assertCanOperate(auth, user);

  const roleIds = input.roleIds ? [...new Set(input.roleIds)] : undefined;
  if (roleIds) await assertRolesAssignable(auth, roleIds);

  return sequelize.transaction(async (tx) => {
    await user.update(
      {
        deptId: input.deptId ?? null,
        nickname: input.nickname,
        email: input.email ?? null,
        phone: input.phone ?? null,
        gender: input.gender,
        status: input.status,
        remark: input.remark ?? null,
      },
      { transaction: tx },
    );

    if (roleIds) {
      await UserRole.destroy({ where: { userId: id }, transaction: tx });
      if (roleIds.length) {
        await UserRole.bulkCreate(roleIds.map((roleId) => ({ userId: id, roleId })), { transaction: tx });
      }
    }

    // 被停用的账号立即踢下线
    if (input.status === 0) await revokeAllTokens(id);
    return user;
  });
}

export async function removeUser(auth: AuthUser, id: number) {
  if (auth.id === id) throw ApiError.badRequest('不能删除自己');
  const user = await findUserInScope(auth, id);
  await assertCanOperate(auth, user);

  await sequelize.transaction(async (tx) => {
    await UserRole.destroy({ where: { userId: id }, transaction: tx });
    await user.update({ delFlag: 1, status: 0 }, { transaction: tx });
  });
  await revokeAllTokens(id);
}

export async function resetPassword(auth: AuthUser, id: number, newPassword: string) {
  const user = await findUserInScope(auth, id);
  await assertCanOperate(auth, user);
  await user.update({ password: await hashPassword(newPassword) });
  // 改密后旧凭证全部作废
  await revokeAllTokens(id);
}

export async function changeOwnPassword(userId: number, oldPassword: string, newPassword: string) {
  const user = await User.scope('withPassword').findOne({ where: { id: userId, delFlag: 0 } });
  if (!user) throw ApiError.notFound('用户不存在');
  if (!(await verifyPassword(oldPassword, user.password))) throw ApiError.badRequest('原密码不正确');
  await user.update({ password: await hashPassword(newPassword) });
  await revokeAllTokens(userId);
}

export async function updateOwnProfile(
  userId: number,
  input: {
    nickname: string;
    email?: string | null;
    phone?: string | null;
    gitKey?: string | null;
    gender: number;
  },
) {
  const user = await User.findOne({ where: { id: userId, delFlag: 0 } });
  if (!user) throw ApiError.notFound('用户不存在');
  await user.update({
    nickname: input.nickname,
    email: input.email ? input.email : null,
    phone: input.phone ? input.phone : null,
    gitKey: input.gitKey ? input.gitKey : null,
    gender: input.gender,
  });
  return user;
}
