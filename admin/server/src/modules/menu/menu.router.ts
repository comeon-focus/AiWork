import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { requirePerms } from '../../middleware/perms.js';
import { operLog } from '../../middleware/operLog.js';
import { ok } from '../../utils/response.js';
import { MenuType } from '../../types/index.js';
import * as service from './menu.service.js';

const router = Router();

const menuSchema = z.object({
  parentId: z.coerce.number().int().min(0).default(0),
  name: z.string().trim().min(1, '名称必填').max(50),
  type: z.enum([MenuType.CATALOG, MenuType.MENU, MenuType.BUTTON]),
  path: z.string().trim().max(200).nullish(),
  component: z.string().trim().max(200).nullish(),
  perms: z.string().trim().max(100).nullish(),
  icon: z.string().trim().max(50).nullish(),
  sort: z.coerce.number().int().default(0),
  visible: z.coerce.number().int().min(0).max(1).default(1),
  status: z.coerce.number().int().min(0).max(1).default(1),
  keepAlive: z.coerce.number().int().min(0).max(1).default(0),
  redirect: z.string().trim().max(200).nullish(),
});

const querySchema = z.object({
  name: z.string().trim().optional(),
  status: z.coerce.number().int().optional(),
  type: z.enum([MenuType.CATALOG, MenuType.MENU, MenuType.BUTTON]).optional(),
});

const idSchema = z.object({ id: z.coerce.number().int().positive() });

/** 角色授权弹窗也要读菜单树，所以放开 system:role:edit */
router.get(
  '/tree',
  requirePerms('system:menu:list', 'system:role:edit', 'system:role:add'),
  validate(querySchema, 'query'),
  async (req, res) => {
    ok(res, await service.menuTree(req.query as z.infer<typeof querySchema>));
  },
);

router.post('/', requirePerms('system:menu:add'), operLog('菜单管理', 'INSERT'), validate(menuSchema), async (req, res) => {
  ok(res, await service.createMenu(req.body as z.infer<typeof menuSchema>), '新增成功');
});

router.put(
  '/:id',
  requirePerms('system:menu:edit'),
  operLog('菜单管理', 'UPDATE'),
  validate(idSchema, 'params'),
  validate(menuSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    ok(res, await service.updateMenu(id, req.body as z.infer<typeof menuSchema>), '修改成功');
  },
);

router.delete(
  '/:id',
  requirePerms('system:menu:remove'),
  operLog('菜单管理', 'DELETE'),
  validate(idSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    await service.removeMenu(id);
    ok(res, null, '删除成功');
  },
);

export default router;
