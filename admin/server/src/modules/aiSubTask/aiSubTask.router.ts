import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { requirePerms } from '../../middleware/perms.js';
import { operLog } from '../../middleware/operLog.js';
import { ok, page } from '../../utils/response.js';
import { parsePaging } from '../../utils/request.js';
import { AI_TASK_STATUS } from '../../models/index.js';
import * as service from './aiSubTask.service.js';

const router = Router();

const taskSchema = z.object({
  parentId: z.coerce.number().int().positive(),
  title: z.string().trim().min(1, '标题必填').max(100),
  summary: z.string().trim().max(255).nullish(),
  smartDocId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  branch: z.string().trim().max(100).nullish(),
  status: z.enum(AI_TASK_STATUS).optional(),
});

const statusSchema = z.object({ status: z.enum(AI_TASK_STATUS) });

const querySchema = z.object({
  parentId: z.coerce.number().int().positive(),
  title: z.string().trim().optional(),
  page: z.coerce.number().int().optional(),
  pageSize: z.coerce.number().int().optional(),
});

const idSchema = z.object({ id: z.coerce.number().int().positive() });

router.get(
  '/',
  requirePerms('orchestration:aiTask:list'),
  validate(querySchema, 'query'),
  async (req, res) => {
    const q = req.query as unknown as z.infer<typeof querySchema>;
    const paging = parsePaging(q);
    const { rows, count } = await service.listAiSubTasks({
      parentId: q.parentId,
      title: q.title,
      offset: paging.offset,
      limit: paging.limit,
    });
    page(res, rows, count, paging.page, paging.pageSize);
  },
);

router.post(
  '/',
  requirePerms('orchestration:aiTask:add'),
  operLog('AI子任务', 'INSERT'),
  validate(taskSchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof taskSchema>;
    const auth = req.user!;
    ok(
      res,
      await service.createAiSubTask({
        ...body,
        creatorId: auth.id,
        creatorName: auth.nickname,
      }),
      '新增成功',
    );
  },
);

router.put(
  '/:id',
  requirePerms('orchestration:aiTask:edit'),
  operLog('AI子任务', 'UPDATE'),
  validate(idSchema, 'params'),
  validate(taskSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    ok(res, await service.updateAiSubTask(id, req.body as z.infer<typeof taskSchema>), '修改成功');
  },
);

router.patch(
  '/:id/status',
  requirePerms('orchestration:aiTask:edit'),
  operLog('AI子任务', 'UPDATE'),
  validate(idSchema, 'params'),
  validate(statusSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    const { status } = req.body as z.infer<typeof statusSchema>;
    ok(res, await service.updateAiSubTaskStatus(id, status), '状态已更新');
  },
);

router.post(
  '/:id/aicoding',
  requirePerms('orchestration:aiTask:edit'),
  operLog('AI子任务', 'UPDATE'),
  validate(idSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    ok(res, await service.aicodingAiSubTask(id), 'AICoding 已启动');
  },
);

router.delete(
  '/:id',
  requirePerms('orchestration:aiTask:remove'),
  operLog('AI子任务', 'DELETE'),
  validate(idSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    await service.removeAiSubTask(id);
    ok(res, null, '删除成功');
  },
);

export default router;
