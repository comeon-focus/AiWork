import type { Response } from 'express';

export interface ApiBody<T = unknown> {
  code: number;
  msg: string;
  data: T;
}

export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function ok<T>(res: Response, data: T = null as T, msg = 'success') {
  const body: ApiBody<T> = { code: 0, msg, data };
  res.json(body);
}

export function page<T>(res: Response, list: T[], total: number, p: number, pageSize: number) {
  ok<PageResult<T>>(res, { list, total, page: p, pageSize });
}
