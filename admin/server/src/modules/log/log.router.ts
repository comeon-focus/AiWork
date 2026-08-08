import { Router } from 'express';
import { Op } from 'sequelize';
import { z } from 'zod';
import { LoginLog, OperLog } from '../../models/index.js';
import { validate } from '../../middleware/validate.js';
import { requirePerms } from '../../middleware/perms.js';
import { operLog } from '../../middleware/operLog.js';
import { ok, page } from '../../utils/response.js';
import { parsePaging } from '../../utils/request.js';

const router = Router();

const rangeSchema = {
  beginTime: z.string().trim().optional(),
  endTime: z.string().trim().optional(),
  page: z.coerce.number().int().optional(),
  pageSize: z.coerce.number().int().optional(),
};

const loginQuery = z.object({
  ...rangeSchema,
  username: z.string().trim().optional(),
  status: z.coerce.number().int().optional(),
});

const operQuery = z.object({
  ...rangeSchema,
  title: z.string().trim().optional(),
  operName: z.string().trim().optional(),
  businessType: z.string().trim().optional(),
  status: z.coerce.number().int().optional(),
});

function timeRange(field: string, begin?: string, end?: string): Record<string, unknown> {
  if (!begin && !end) return {};
  const conds: Record<symbol, Date> = {};
  if (begin) conds[Op.gte] = new Date(begin);
  if (end) conds[Op.lte] = new Date(end);
  return { [field]: conds };
}

router.get('/login', requirePerms('monitor:loginlog:list'), validate(loginQuery, 'query'), async (req, res) => {
  const q = req.query as z.infer<typeof loginQuery>;
  const paging = parsePaging(q);
  const where: Record<string, unknown> = { ...timeRange('loginAt', q.beginTime, q.endTime) };
  if (q.username) where.username = { [Op.like]: `%${q.username}%` };
  if (q.status !== undefined) where.status = q.status;

  const { rows, count } = await LoginLog.findAndCountAll({
    where,
    offset: paging.offset,
    limit: paging.limit,
    order: [['loginAt', 'DESC']],
  });
  page(res, rows, count, paging.page, paging.pageSize);
});

router.delete(
  '/login',
  requirePerms('monitor:loginlog:remove'),
  operLog('登录日志', 'DELETE'),
  async (_req, res) => {
    await LoginLog.destroy({ where: {}, truncate: true });
    ok(res, null, '已清空登录日志');
  },
);

router.get('/oper', requirePerms('monitor:operlog:list'), validate(operQuery, 'query'), async (req, res) => {
  const q = req.query as z.infer<typeof operQuery>;
  const paging = parsePaging(q);
  const where: Record<string, unknown> = { ...timeRange('operAt', q.beginTime, q.endTime) };
  if (q.title) where.title = { [Op.like]: `%${q.title}%` };
  if (q.operName) where.operName = { [Op.like]: `%${q.operName}%` };
  if (q.businessType) where.businessType = q.businessType;
  if (q.status !== undefined) where.status = q.status;

  const { rows, count } = await OperLog.findAndCountAll({
    where,
    offset: paging.offset,
    limit: paging.limit,
    order: [['operAt', 'DESC']],
  });
  page(res, rows, count, paging.page, paging.pageSize);
});

router.delete('/oper', requirePerms('monitor:operlog:remove'), operLog('操作日志', 'DELETE'), async (_req, res) => {
  await OperLog.destroy({ where: {}, truncate: true });
  ok(res, null, '已清空操作日志');
});

export default router;
