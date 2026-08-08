import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { requirePerms } from '../../middleware/perms.js';
import { operLog } from '../../middleware/operLog.js';
import { ok, page } from '../../utils/response.js';
import { parsePaging } from '../../utils/request.js';
import { DataScope } from '../../types/index.js';
import * as service from './role.service.js';

const router = Router();

const dataScopeEnum = z.enum([
  DataScope.ALL,
  DataScope.DEPT_AND_CHILD,
  DataScope.DEPT,
  DataScope.SELF,
  DataScope.CUSTOM,
]);

const roleSchema = z.object({
  name: z.string().trim().min(1, '角色名称必填').max(50),
  roleKey: z
    .string()
    .trim()
    .min(1, '角色标识必填')
    .max(50)
    .regex(/^[a-zA-Z][a-zA-Z0-9_:-]*$/, '角色标识只能是字母开头的英文、数字、_ : -'),
  sort: z.coerce.number().int().default(0),
  status: z.coerce.number().int().min(0).max(1).default(1),
  remark: z.string().trim().max(255).nullish(),
  dataScope: dataScopeEnum.default(DataScope.SELF),
  menuIds: z.array(z.coerce.number().int().positive()).optional(),
  deptIds: z.array(z.coerce.number().int().positive()).optional(),
  repoIds: z.array(z.coerce.number().int().positive()).optional(),
});

const querySchema = z.object({
  name: z.string().trim().optional(),
  roleKey: z.string().trim().optional(),
  status: z.coerce.number().int().optional(),
  page: z.coerce.number().int().optional(),
  pageSize: z.coerce.number().int().optional(),
});

const idSchema = z.object({ id: z.coerce.number().int().positive() });

router.get('/all', requirePerms('system:role:list', 'system:user:list'), async (_req, res) => {
  ok(res, await service.allRoles());
});

router.get('/', requirePerms('system:role:list'), validate(querySchema, 'query'), async (req, res) => {
  const q = req.query as z.infer<typeof querySchema>;
  const paging = parsePaging(q);
  const { rows, count } = await service.listRoles({ ...q, offset: paging.offset, limit: paging.limit });
  page(res, rows, count, paging.page, paging.pageSize);
});

router.get('/:id', requirePerms('system:role:list'), validate(idSchema, 'params'), async (req, res) => {
  const { id } = req.params as unknown as z.infer<typeof idSchema>;
  ok(res, await service.getRole(id));
});

router.post('/', requirePerms('system:role:add'), operLog('角色管理', 'GRANT'), validate(roleSchema), async (req, res) => {
  ok(res, await service.createRole(req.body as z.infer<typeof roleSchema>), '新增成功');
});

router.put(
  '/:id',
  requirePerms('system:role:edit'),
  operLog('角色管理', 'GRANT'),
  validate(idSchema, 'params'),
  validate(roleSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    ok(res, await service.updateRole(id, req.body as z.infer<typeof roleSchema>), '修改成功');
  },
);

router.delete(
  '/:id',
  requirePerms('system:role:remove'),
  operLog('角色管理', 'DELETE'),
  validate(idSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    await service.removeRole(id);
    ok(res, null, '删除成功');
  },
);

export default router;
