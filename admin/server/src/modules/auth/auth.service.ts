import { Op } from 'sequelize';
import { User, LoginLog, RefreshToken } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { verifyPassword } from '../../utils/password.js';
import { hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt.js';
import { buildTree } from '../../utils/tree.js';
import { loadAuthUser, getUserMenus, getUserRoles } from '../../services/permission.service.js';
import { parseUserAgent } from '../../utils/request.js';
import type { AuthUser } from '../../types/index.js';

export interface ClientInfo {
  ip: string;
  ua: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

async function issueTokens(userId: number, username: string, client: ClientInfo): Promise<TokenPair> {
  const accessToken = signAccessToken(userId, username);
  const { token: refreshToken, expiresAt } = signRefreshToken(userId);

  await RefreshToken.create({
    userId,
    tokenHash: hashToken(refreshToken),
    expiresAt,
    ip: client.ip,
    ua: client.ua.slice(0, 255),
  });

  return { accessToken, refreshToken };
}

async function recordLogin(username: string, client: ClientInfo, success: boolean, msg: string) {
  const { browser, os } = parseUserAgent(client.ua);
  await LoginLog.create({ username, ip: client.ip, browser, os, status: success ? 1 : 0, msg });
}

export async function login(username: string, password: string, client: ClientInfo): Promise<TokenPair> {
  const user = await User.scope('withPassword').findOne({ where: { username, delFlag: 0 } });

  if (!user || !(await verifyPassword(password, user.password))) {
    await recordLogin(username, client, false, '账号或密码错误');
    // 不区分「账号不存在」和「密码错误」，避免账号枚举
    throw ApiError.badRequest('账号或密码错误');
  }

  if (user.status !== 1) {
    await recordLogin(username, client, false, '账号已被停用');
    throw ApiError.forbidden('账号已被停用，请联系管理员');
  }

  await user.update({ lastLoginAt: new Date(), lastLoginIp: client.ip });
  await recordLogin(username, client, true, '登录成功');

  return issueTokens(user.id, user.username, client);
}

/**
 * 刷新 access token，并轮换 refresh token：
 * 旧的立即作废，被盗用的旧 token 无法二次使用。
 */
export async function refresh(token: string, client: ClientInfo): Promise<TokenPair> {
  let userId: number;
  try {
    userId = verifyRefreshToken(token).sub;
  } catch {
    throw ApiError.unauthorized('刷新凭证无效或已过期');
  }

  const record = await RefreshToken.findOne({
    where: { tokenHash: hashToken(token), revokedAt: null, expiresAt: { [Op.gt]: new Date() } },
  });
  if (!record) throw ApiError.unauthorized('刷新凭证已失效，请重新登录');

  const loaded = await loadAuthUser(userId);
  if (!loaded) {
    await record.update({ revokedAt: new Date() });
    throw ApiError.unauthorized('账号不存在或已被停用');
  }

  await record.update({ revokedAt: new Date() });
  return issueTokens(loaded.user.id, loaded.user.username, client);
}

export async function logout(token?: string, userId?: number): Promise<void> {
  if (token) {
    await RefreshToken.update({ revokedAt: new Date() }, { where: { tokenHash: hashToken(token), revokedAt: null } });
    return;
  }
  if (userId) await revokeAllTokens(userId);
}

/** 改密码、停用账号时调用，强制该用户全部设备下线 */
export async function revokeAllTokens(userId: number): Promise<void> {
  await RefreshToken.update({ revokedAt: new Date() }, { where: { userId, revokedAt: null } });
}

export interface RouteMeta {
  title: string;
  icon: string | null;
  keepAlive: boolean;
  hidden: boolean;
}

export interface RouteItem {
  id: number;
  parentId: number;
  name: string;
  path: string;
  component: string | null;
  redirect: string | null;
  meta: RouteMeta;
  children: RouteItem[];
}

export interface ProfileResult {
  user: {
    id: number;
    username: string;
    nickname: string;
    avatar: string | null;
    email: string | null;
    phone: string | null;
    deptId: number | null;
    isSuper: boolean;
  };
  roles: string[];
  /** 操作权限码，超管为 ['*'] */
  perms: string[];
  /** 页面权限：前端据此生成动态路由与侧边栏 */
  routes: RouteItem[];
  /** 数据权限范围：每个角色一条，前端可用于展示当前账号的数据可见面 */
  dataScopes: { scope: string; customDeptIds: number[] }[];
}

export async function getProfile(auth: AuthUser): Promise<ProfileResult> {
  const loaded = await loadAuthUser(auth.id);
  if (!loaded) throw ApiError.unauthorized();

  const roles = await getUserRoles(auth.id);
  const menus = await getUserMenus(loaded.auth, roles.map((r) => r.id));

  const flat = menus.map((m) => ({
    id: m.id,
    parentId: m.parentId,
    name: m.name,
    path: m.path ?? '',
    component: m.component,
    redirect: m.redirect,
    meta: {
      title: m.name,
      icon: m.icon,
      keepAlive: m.keepAlive === 1,
      hidden: m.visible === 0,
    },
  }));

  return {
    user: {
      id: loaded.user.id,
      username: loaded.user.username,
      nickname: loaded.user.nickname,
      avatar: loaded.user.avatar,
      email: loaded.user.email,
      phone: loaded.user.phone,
      deptId: loaded.user.deptId,
      isSuper: loaded.auth.isSuper,
    },
    roles: roles.map((r) => r.roleKey),
    perms: loaded.auth.perms,
    routes: buildTree(flat) as unknown as RouteItem[],
    dataScopes: loaded.auth.dataScopes,
  };
}
