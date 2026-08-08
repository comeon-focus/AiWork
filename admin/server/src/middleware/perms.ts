import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError.js';

function has(perms: string[], code: string): boolean {
  return perms.includes('*') || perms.includes(code);
}

/**
 * 操作权限校验 —— 安全边界在这里，前端的按钮显隐只是体验优化。
 * 多个权限码之间是「任一满足」。
 */
export function requirePerms(...codes: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return next(ApiError.unauthorized());
    if (user.isSuper) return next();
    if (codes.some((code) => has(user.perms, code))) return next();
    next(ApiError.forbidden(`缺少权限：${codes.join(' 或 ')}`));
  };
}

/** 要求同时具备全部权限码 */
export function requireAllPerms(...codes: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return next(ApiError.unauthorized());
    if (user.isSuper) return next();
    const missing = codes.filter((code) => !has(user.perms, code));
    if (missing.length === 0) return next();
    next(ApiError.forbidden(`缺少权限：${missing.join('、')}`));
  };
}

/** 仅超级管理员可访问 */
export function requireSuper(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(ApiError.unauthorized());
  if (!req.user.isSuper) return next(ApiError.forbidden('该操作仅超级管理员可执行'));
  next();
}
