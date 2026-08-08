import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { ApiError } from '../utils/ApiError.js';

type Source = 'body' | 'query' | 'params';

/**
 * zod 校验中间件。校验通过后把解析结果写回 req[source]，
 * 后续控制器拿到的就是已转型（如字符串数字转 number）的数据。
 */
export function validate(schema: ZodType, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const first = result.error.issues[0];
      const path = first?.path.join('.') ?? '';
      return next(ApiError.badRequest(path ? `${path}: ${first?.message}` : (first?.message ?? '参数校验失败')));
    }
    // express 5 里 req.query 是 getter，只能通过 defineProperty 覆盖
    if (source === 'query') {
      Object.defineProperty(req, 'query', { value: result.data, writable: true, configurable: true });
    } else {
      req[source] = result.data as never;
    }
    next();
  };
}
