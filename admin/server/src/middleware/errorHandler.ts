import type { NextFunction, Request, Response } from 'express';
import { BaseError, UniqueConstraintError, ValidationError } from 'sequelize';
import { ApiError, ErrorCode } from '../utils/ApiError.js';
import { isProd } from '../config/index.js';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ code: ErrorCode.NOT_FOUND, msg: `接口不存在: ${req.method} ${req.path}`, data: null });
}

export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err);

  if (err instanceof ApiError) {
    res.status(err.httpStatus).json({ code: err.code, msg: err.message, data: null });
    return;
  }

  if (err instanceof UniqueConstraintError) {
    const field = err.errors[0]?.path ?? '字段';
    res.status(409).json({ code: ErrorCode.CONFLICT, msg: `${field} 已存在`, data: null });
    return;
  }

  if (err instanceof ValidationError) {
    res.status(400).json({ code: ErrorCode.BAD_REQUEST, msg: err.errors[0]?.message ?? '数据校验失败', data: null });
    return;
  }

  if (err instanceof BaseError) {
    console.error('[db error]', err);
    res.status(500).json({ code: ErrorCode.INTERNAL, msg: '数据库操作失败', data: null });
    return;
  }

  console.error('[unhandled error]', err);
  res.status(500).json({
    code: ErrorCode.INTERNAL,
    msg: isProd ? '服务器内部错误' : err instanceof Error ? err.message : String(err),
    data: null,
  });
}
