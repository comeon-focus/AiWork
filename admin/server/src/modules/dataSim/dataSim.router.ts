import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { requirePerms } from '../../middleware/perms.js';
import { operLog } from '../../middleware/operLog.js';
import { ok } from '../../utils/response.js';
import * as service from './dataSim.service.js';

const router = Router();

const querySchema = z.object({ name: z.string().trim().optional() });
const reqSchema = z.object({ name: z.string().trim().min(1, '项目名称必填').max(100) });
const idSchema = z.object({ id: z.coerce.number().int().positive() });

router.get(
  '/',
  requirePerms('vspace:datasim:list'),
  validate(querySchema, 'query'),
  async (req, res) => {
    const q = req.query as z.infer<typeof querySchema>;
    ok(res, await service.listDataSimProjects({ name: q.name }));
  },
);

router.post(
  '/',
  requirePerms('vspace:datasim:add'),
  operLog('数据模拟', 'INSERT'),
  validate(reqSchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof reqSchema>;
    const auth = req.user!;
    ok(res, await service.createDataSimProject(body, { id: auth.id, nickname: auth.nickname }), '新增成功');
  },
);

router.put(
  '/:id',
  requirePerms('vspace:datasim:edit'),
  operLog('数据模拟', 'UPDATE'),
  validate(idSchema, 'params'),
  validate(reqSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    const auth = req.user!;
    ok(res, await service.updateDataSimProject(id, req.body as z.infer<typeof reqSchema>, { id: auth.id, nickname: auth.nickname }), '修改成功');
  },
);

router.delete(
  '/:id',
  requirePerms('vspace:datasim:remove'),
  operLog('数据模拟', 'DELETE'),
  validate(idSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    await service.removeDataSimProject(id);
    ok(res, null, '删除成功');
  },
);

export default router;
