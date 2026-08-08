import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { requirePerms } from '../../middleware/perms.js';
import { operLog } from '../../middleware/operLog.js';
import { ok } from '../../utils/response.js';
import * as service from './codeRepo.service.js';

const router = Router();

const repoSchema = z.object({
  name: z.string().trim().min(1, '名称必填').max(50),
  address: z.string().trim().max(255).nullish(),
  remark: z.string().trim().max(255).nullish(),
  status: z.coerce.number().int().min(0).max(1).default(1),
  sort: z.coerce.number().int().default(0),
});

const querySchema = z.object({
  name: z.string().trim().optional(),
});

const idSchema = z.object({ id: z.coerce.number().int().positive() });

// 列表：非超管按角色分配的代码库做数据权限过滤
router.get(
  '/',
  requirePerms('system:repo:list'),
  validate(querySchema, 'query'),
  async (req, res) => {
    const q = req.query as z.infer<typeof querySchema>;
    const ids = req.user!.isSuper ? undefined : req.user!.codeRepoIds;
    ok(res, await service.listCodeRepos({ name: q.name, ids }));
  },
);

router.post(
  '/',
  requirePerms('system:repo:add'),
  operLog('代码库管理', 'INSERT'),
  validate(repoSchema),
  async (req, res) => {
    ok(res, await service.createCodeRepo(req.body as z.infer<typeof repoSchema>), '新增成功');
  },
);

router.put(
  '/:id',
  requirePerms('system:repo:edit'),
  operLog('代码库管理', 'UPDATE'),
  validate(idSchema, 'params'),
  validate(repoSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    ok(res, await service.updateCodeRepo(id, req.body as z.infer<typeof repoSchema>), '修改成功');
  },
);

router.delete(
  '/:id',
  requirePerms('system:repo:remove'),
  operLog('代码库管理', 'DELETE'),
  validate(idSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    await service.removeCodeRepo(id);
    ok(res, null, '删除成功');
  },
);

export default router;
