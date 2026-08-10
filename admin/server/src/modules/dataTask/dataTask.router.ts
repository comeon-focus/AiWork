import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { requirePerms } from '../../middleware/perms.js';
import { operLog } from '../../middleware/operLog.js';
import { ok } from '../../utils/response.js';
import { ApiError } from '../../utils/ApiError.js';
import * as service from './dataTask.service.js';

const router = Router();

const listQuerySchema = z.object({
  keyword: z.string().trim().max(255).optional(),
  status: z.coerce.number().int().min(0).max(2).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

const idSchema = z.object({ id: z.coerce.number().int().positive() });
const idIidSchema = z.object({ id: z.coerce.number().int().positive(), iid: z.coerce.number().int().positive() });

const taskSchema = z.object({
  name: z.string().trim().min(1, '任务名称必填').max(100),
  projectIds: z
    .array(z.string().trim().min(1, '关联项目不能为空'))
    .min(1, '请至少关联一个项目')
    .max(50, '关联项目数量过多'),
  interfaceCount: z.coerce.number().int().positive('接口任务数量需为正整数'),
  userIds: z.array(z.coerce.number().int().positive()).optional(),
});

const taskUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  projectIds: z
    .array(z.string().trim().min(1, '关联项目不能为空'))
    .min(1, '请至少关联一个项目')
    .max(50, '关联项目数量过多')
    .optional(),
  interfaceCount: z.coerce.number().int().positive().optional(),
  userIds: z.array(z.coerce.number().int().positive()).optional(),
});

const statusSchema = z.object({
  status: z.coerce.number().int().min(0).max(2),
});

const interfaceSchema = z.object({
  description: z.string().trim().min(1, '接口描述必填').max(255),
  method: z.enum(service.METHODS),
  path: z.string().trim().min(1, '接口路径必填').max(255),
  responseData: z.string().max(20000).nullish(),
});

function auth(req: { user?: import('../../types/index.js').AuthUser }) {
  if (!req.user) throw ApiError.unauthorized();
  return { id: req.user.id, nickname: req.user.nickname };
}

/* 责任人候选（须定义在 /:id 之前，避免被 :id 捕获） */
router.get(
  '/users',
  requirePerms('vspace:datatask:list'),
  async (_req, res) => {
    ok(res, await service.listUsers());
  },
);

router.get(
  '/',
  requirePerms('vspace:datatask:list'),
  validate(listQuerySchema, 'query'),
  async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuerySchema>;
    ok(res, await service.listDataTasks({ keyword: q.keyword, status: q.status, page: q.page, pageSize: q.pageSize }));
  },
);

router.post(
  '/',
  requirePerms('vspace:datatask:add'),
  operLog('数据任务', 'INSERT'),
  validate(taskSchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof taskSchema>;
    ok(res, await service.createDataTask(body, auth(req)), '新增成功');
  },
);

router.put(
  '/:id',
  requirePerms('vspace:datatask:edit'),
  operLog('数据任务', 'UPDATE'),
  validate(idSchema, 'params'),
  validate(taskUpdateSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    const body = req.body as z.infer<typeof taskUpdateSchema>;
    ok(res, await service.updateDataTask(id, body, auth(req)), '修改成功');
  },
);

router.delete(
  '/:id',
  requirePerms('vspace:datatask:remove'),
  operLog('数据任务', 'DELETE'),
  validate(idSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    await service.removeDataTask(id);
    ok(res, null, '删除成功');
  },
);

router.put(
  '/:id/status',
  requirePerms('vspace:datatask:edit'),
  operLog('数据任务', 'UPDATE'),
  validate(idSchema, 'params'),
  validate(statusSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    const { status } = req.body as z.infer<typeof statusSchema>;
    ok(res, await service.changeTaskStatus(id, status, auth(req)), '状态已更新');
  },
);

router.post(
  '/:id/sync',
  requirePerms('vspace:datatask:edit'),
  operLog('数据任务', 'UPDATE'),
  validate(idSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    const result = await service.syncTaskInterfaces(id, auth(req));
    ok(res, result, `同步完成：新增 ${result.imported} 条，更新 ${result.updated} 条`);
  },
);

/* 任务接口 */
router.get(
  '/:id/interfaces',
  requirePerms('vspace:datatask:list'),
  validate(idSchema, 'params'),
  validate(listQuerySchema, 'query'),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    const q = req.query as unknown as z.infer<typeof listQuerySchema>;
    ok(res, await service.listTaskInterfaces(id, { keyword: q.keyword, page: q.page, pageSize: q.pageSize }));
  },
);

router.post(
  '/:id/interfaces',
  requirePerms('vspace:datatask:edit'),
  operLog('数据任务接口', 'INSERT'),
  validate(idSchema, 'params'),
  validate(interfaceSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    const body = req.body as z.infer<typeof interfaceSchema>;
    ok(res, await service.createTaskInterface(id, body, auth(req)), '新增成功');
  },
);

router.put(
  '/:id/interfaces/:iid',
  requirePerms('vspace:datatask:edit'),
  operLog('数据任务接口', 'UPDATE'),
  validate(idIidSchema, 'params'),
  validate(interfaceSchema),
  async (req, res) => {
    const { id, iid } = req.params as unknown as z.infer<typeof idIidSchema>;
    const body = req.body as z.infer<typeof interfaceSchema>;
    ok(res, await service.updateTaskInterface(id, iid, body, auth(req)), '修改成功');
  },
);

router.delete(
  '/:id/interfaces/:iid',
  requirePerms('vspace:datatask:remove'),
  operLog('数据任务接口', 'DELETE'),
  validate(idIidSchema, 'params'),
  async (req, res) => {
    const { id, iid } = req.params as unknown as z.infer<typeof idIidSchema>;
    await service.removeTaskInterface(id, iid);
    ok(res, null, '删除成功');
  },
);

export default router;
