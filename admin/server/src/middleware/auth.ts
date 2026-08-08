import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { verifyAccessToken } from '../utils/jwt.js';
import { ApiError } from '../utils/ApiError.js';
import { loadAuthUser } from '../services/permission.service.js';

/**
 * 解析 access token，把「有效权限」挂到 req.user。
 * 权限每次请求实时计算，因此后台调整角色后立即生效，无需用户重新登录。
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(ApiError.unauthorized());
  }

  const token = header.slice(7).trim();
  let userId: number;
  try {
    userId = verifyAccessToken(token).sub;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) return next(ApiError.tokenExpired());
    return next(ApiError.unauthorized('登录凭证无效'));
  }

  const loaded = await loadAuthUser(userId);
  if (!loaded) return next(ApiError.unauthorized('账号不存在或已被停用'));

  req.user = loaded.auth;
  next();
}
