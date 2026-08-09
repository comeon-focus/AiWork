import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { requirePerms } from '../../middleware/perms.js';
import { operLog } from '../../middleware/operLog.js';
import { ok, page } from '../../utils/response.js';
import { parsePaging } from '../../utils/request.js';
import { AI_GIT_COMMIT_STATUS } from '../../models/index.js';
import * as service from './aiGitCommit.service.js';

const router = Router();

const querySchema = z.object({
  title: z.string().trim().optional(),
  sessionId: z.string().trim().optional(),
  status: z.enum(AI_GIT_COMMIT_STATUS).optional(),
  taskId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().optional(),
  pageSize: z.coerce.number().int().optional(),
});

const idSchema = z.object({ id: z.coerce.number().int().positive() });

router.get(
  '/',
  requirePerms('orchestration:gitCommit:list'),
  validate(querySchema, 'query'),
  async (req, res) => {
    const q = req.query as unknown as z.infer<typeof querySchema>;
    const paging = parsePaging(q);
    const { rows, count } = await service.listGitCommits({
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
  requirePerms('orchestration:gitCommit:list'),
  validate(idSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    ok(res, await service.getGitCommit(id));
  },
);

router.delete(
  '/:id',
  requirePerms('orchestration:gitCommit:remove'),
  operLog('GIT提交记录', 'DELETE'),
  validate(idSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    await service.removeGitCommit(id);
    ok(res, null, '删除成功');
  },
);

export default router;
