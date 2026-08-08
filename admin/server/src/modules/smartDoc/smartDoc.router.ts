import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { requirePerms } from '../../middleware/perms.js';
import { operLog } from '../../middleware/operLog.js';
import { ok } from '../../utils/response.js';
import * as service from './smartDoc.service.js';

const router = Router();

const docSchema = z.object({
  title: z.string().trim().min(1, '标题必填').max(200),
  summary: z.string().trim().max(2000).nullish(),
  content: z.string().max(200000).nullish(),
  repoId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
});

const querySchema = z.object({
  title: z.string().trim().optional(),
});

const idSchema = z.object({ id: z.coerce.number().int().positive() });

router.get(
  '/',
  requirePerms('orchestration:smartDoc:list'),
  validate(querySchema, 'query'),
  async (req, res) => {
    const q = req.query as z.infer<typeof querySchema>;
    ok(res, await service.listSmartDocs({ title: q.title }));
  },
);

router.get(
  '/:id',
  requirePerms('orchestration:smartDoc:list'),
  validate(idSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    ok(res, await service.getSmartDoc(id));
  },
);

router.put(
  '/:id',
  requirePerms('orchestration:smartDoc:edit'),
  operLog('智能文档', 'UPDATE'),
  validate(idSchema, 'params'),
  validate(docSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    ok(res, await service.updateSmartDoc(id, req.body as z.infer<typeof docSchema>), '修改成功');
  },
);

router.delete(
  '/:id',
  requirePerms('orchestration:smartDoc:remove'),
  operLog('智能文档', 'DELETE'),
  validate(idSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    await service.removeSmartDoc(id);
    ok(res, null, '删除成功');
  },
);

export default router;
