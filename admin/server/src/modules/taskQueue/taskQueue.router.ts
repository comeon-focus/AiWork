import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { requirePerms } from '../../middleware/perms.js';
import { operLog } from '../../middleware/operLog.js';
import { ok, page } from '../../utils/response.js';
import { parsePaging } from '../../utils/request.js';
import * as service from './taskQueue.service.js';

const router = Router();

const itemSchema = z.object({
  taskId: z.coerce.number().int().positive(),
  subTaskId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
});
const queueSchema = z.object({
  name: z.string().trim().min(1, '队列名称必填').max(100),
  remark: z.string().trim().max(255).nullish(),
  items: z.array(itemSchema).min(1, '请至少关联一个 AI 任务'),
});
const orderSchema = z.object({ itemIds: z.array(z.coerce.number().int().positive()) });
const querySchema = z.object({
  name: z.string().trim().optional(),
  status: z.enum(['待执行', '执行中', '暂停中', '已执行']).optional(),
  page: z.coerce.number().int().optional(),
  pageSize: z.coerce.number().int().optional(),
});
const idSchema = z.object({ id: z.coerce.number().int().positive() });

function auth(req: { user?: import('../../types/index.js').AuthUser }) {
  if (!req.user) throw new Error('unauthorized');
  return req.user;
}

/* 关联 AI 任务候选（须定义在 /:id 之前，避免被 :id 捕获） */
router.get(
  '/task-options',
  requirePerms('orchestration:taskQueue:list'),
  validate(z.object({ excludeQueueId: z.coerce.number().int().positive().optional() }), 'query'),
  async (req, res) => {
    const { excludeQueueId } = req.query as unknown as { excludeQueueId?: number };
    ok(res, await service.listAiTaskOptions(excludeQueueId));
  },
);

router.get(
  '/',
  requirePerms('orchestration:taskQueue:list'),
  validate(querySchema, 'query'),
  async (req, res) => {
    const q = req.query as z.infer<typeof querySchema>;
    const paging = parsePaging(q);
    const { rows, count } = await service.listTaskQueues({
      name: q.name,
      status: q.status,
      offset: paging.offset,
      limit: paging.limit,
    });
    page(res, rows, count, paging.page, paging.pageSize);
  },
);

/* 详情（前端轮询，禁止挂 operLog） */
router.get('/:id', requirePerms('orchestration:taskQueue:list'), validate(idSchema, 'params'), async (req, res) => {
  const { id } = req.params as unknown as z.infer<typeof idSchema>;
  ok(res, await service.getTaskQueueDetail(id));
});

router.post(
  '/',
  requirePerms('orchestration:taskQueue:add'),
  operLog('任务队列', 'INSERT'),
  validate(queueSchema),
  async (req, res) => {
    const u = auth(req);
    ok(res, await service.createTaskQueue(req.body as z.infer<typeof queueSchema>, { id: u.id, nickname: u.nickname }), '新增成功');
  },
);

router.put(
  '/:id',
  requirePerms('orchestration:taskQueue:edit'),
  operLog('任务队列', 'UPDATE'),
  validate(idSchema, 'params'),
  validate(queueSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    ok(res, await service.updateTaskQueue(id, req.body as z.infer<typeof queueSchema>), '修改成功');
  },
);

/* 调整未执行任务的执行顺序（暂停中队列专用） */
router.put(
  '/:id/items/order',
  requirePerms('orchestration:taskQueue:edit'),
  operLog('任务队列', 'UPDATE'),
  validate(idSchema, 'params'),
  validate(orderSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    await service.reorderTaskQueueItems(id, (req.body as z.infer<typeof orderSchema>).itemIds);
    ok(res, null, '顺序已更新');
  },
);

router.post(
  '/:id/start',
  requirePerms('orchestration:taskQueue:execute'),
  operLog('任务队列', 'UPDATE'),
  validate(idSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    const u = auth(req);
    ok(res, await service.startTaskQueue(id, { id: u.id, nickname: u.nickname }), '队列已开始执行');
  },
);

router.post(
  '/:id/pause',
  requirePerms('orchestration:taskQueue:execute'),
  operLog('任务队列', 'UPDATE'),
  validate(idSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    ok(res, await service.pauseTaskQueue(id), '已提交暂停，当前任务完成后队列将暂停');
  },
);

router.delete(
  '/:id',
  requirePerms('orchestration:taskQueue:remove'),
  operLog('任务队列', 'DELETE'),
  validate(idSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    await service.removeTaskQueue(id);
    ok(res, null, '删除成功');
  },
);

export default router;
