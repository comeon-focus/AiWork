import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { requirePerms } from '../../middleware/perms.js';
import { operLog } from '../../middleware/operLog.js';
import { ok, page } from '../../utils/response.js';
import { parsePaging } from '../../utils/request.js';
import { AI_COMPILE_STATUS } from '../../models/index.js';
import * as service from './aiCompileLog.service.js';

const router = Router();

const querySchema = z.object({
  title: z.string().trim().optional(),
  sessionId: z.string().trim().optional(),
  status: z.enum(AI_COMPILE_STATUS).optional(),
  taskId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().optional(),
  pageSize: z.coerce.number().int().optional(),
});

const idSchema = z.object({ id: z.coerce.number().int().positive() });

const tailSchema = z.object({ offset: z.coerce.number().int().min(0).default(0) });

router.get(
  '/',
  requirePerms('orchestration:compileLog:list'),
  validate(querySchema, 'query'),
  async (req, res) => {
    const q = req.query as unknown as z.infer<typeof querySchema>;
    const paging = parsePaging(q);
    const { rows, count } = await service.listCompileLogs({
      title: q.title,
      sessionId: q.sessionId,
      status: q.status,
      taskId: q.taskId,
      offset: paging.offset,
      limit: paging.limit,
    });
    page(res, rows, count, paging.page, paging.pageSize);
  },
);

router.get(
  '/:id',
  requirePerms('orchestration:compileLog:list'),
  validate(idSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    ok(res, await service.getCompileLog(id));
  },
);

// 增量拉日志：前端 1.5s 轮询一次，绝不能挂 operLog，否则操作日志表会被瞬间刷爆
router.get(
  '/:id/tail',
  requirePerms('orchestration:compileLog:list'),
  validate(idSchema, 'params'),
  validate(tailSchema, 'query'),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    const { offset } = req.query as unknown as z.infer<typeof tailSchema>;
    ok(res, await service.tailCompileLog(id, offset));
  },
);

router.delete(
  '/:id',
  requirePerms('orchestration:compileLog:remove'),
  operLog('编译详情', 'DELETE'),
  validate(idSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    await service.removeCompileLog(id);
    ok(res, null, '删除成功');
  },
);

export default router;
