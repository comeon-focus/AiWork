import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { requirePerms } from '../../middleware/perms.js';
import { operLog } from '../../middleware/operLog.js';
import { ok } from '../../utils/response.js';
import { listConfigs, getConfigByKey, createConfig, updateConfig, removeConfig } from './config.service.js';

const router = Router();

const keySchema = z.object({ key: z.string().trim().min(1).max(100) });

const updateSchema = z.object({
  configValue: z.string().max(500),
  remark: z.string().trim().max(255).nullish(),
});

const createSchema = z.object({
  configKey: z.string().trim().min(1).max(100),
  configValue: z.string().max(500),
  remark: z.string().trim().max(255).nullish(),
});

router.get(
  '/',
  requirePerms('system:config:list'),
  async (_req, res) => {
    ok(res, await listConfigs());
  },
);

router.get(
  '/:key',
  requirePerms('system:config:list'),
  validate(keySchema, 'params'),
  async (req, res) => {
    const { key } = req.params as unknown as z.infer<typeof keySchema>;
    ok(res, await getConfigByKey(key));
  },
);

router.post(
  '/',
  requirePerms('system:config:add'),
  operLog('系统配置', 'INSERT'),
  validate(createSchema),
  async (req, res) => {
    const { configKey, configValue, remark } = req.body as z.infer<typeof createSchema>;
    ok(res, await createConfig(configKey, configValue, remark), '创建成功');
  },
);

router.put(
  '/:key',
  requirePerms('system:config:edit'),
  operLog('系统配置', 'UPDATE'),
  validate(keySchema, 'params'),
  validate(updateSchema),
  async (req, res) => {
    const { key } = req.params as unknown as z.infer<typeof keySchema>;
    const { configValue, remark } = req.body as z.infer<typeof updateSchema>;
    ok(res, await updateConfig(key, configValue, remark), '保存成功');
  },
);

router.delete(
  '/:key',
  requirePerms('system:config:remove'),
  operLog('系统配置', 'DELETE'),
  validate(keySchema, 'params'),
  async (req, res) => {
    const { key } = req.params as unknown as z.infer<typeof keySchema>;
    await removeConfig(key);
    ok(res, null, '删除成功');
  },
);

export default router;
