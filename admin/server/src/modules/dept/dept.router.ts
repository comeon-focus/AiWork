import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { requirePerms } from '../../middleware/perms.js';
import { operLog } from '../../middleware/operLog.js';
import { ok } from '../../utils/response.js';
import * as service from './dept.service.js';

const router = Router();

const deptSchema = z.object({
  parentId: z.coerce.number().int().min(0).default(0),
  name: z.string().trim().min(1, '部门名称必填').max(50),
  orderNum: z.coerce.number().int().default(0),
  leader: z.string().trim().max(50).nullish(),
  phone: z.string().trim().max(20).nullish(),
  status: z.coerce.number().int().min(0).max(1).default(1),
});

const querySchema = z.object({
  name: z.string().trim().optional(),
  status: z.coerce.number().int().optional(),
});

const idSchema = z.object({ id: z.coerce.number().int().positive() });

router.get('/tree', requirePerms('system:dept:list', 'system:user:list'), validate(querySchema, 'query'), async (req, res) => {
  ok(res, await service.deptTree(req.query as z.infer<typeof querySchema>));
});

router.get('/', requirePerms('system:dept:list'), validate(querySchema, 'query'), async (req, res) => {
  ok(res, await service.listDepts(req.query as z.infer<typeof querySchema>));
});

router.post('/', requirePerms('system:dept:add'), operLog('部门管理', 'INSERT'), validate(deptSchema), async (req, res) => {
  ok(res, await service.createDept(req.body as z.infer<typeof deptSchema>), '新增成功');
});

router.put(
  '/:id',
  requirePerms('system:dept:edit'),
  operLog('部门管理', 'UPDATE'),
  validate(idSchema, 'params'),
  validate(deptSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    ok(res, await service.updateDept(id, req.body as z.infer<typeof deptSchema>), '修改成功');
  },
);

router.delete(
  '/:id',
  requirePerms('system:dept:remove'),
  operLog('部门管理', 'DELETE'),
  validate(idSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    await service.removeDept(id);
    ok(res, null, '删除成功');
  },
);

export default router;
