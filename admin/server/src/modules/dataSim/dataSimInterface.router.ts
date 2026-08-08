import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { requirePerms } from '../../middleware/perms.js';
import { operLog } from '../../middleware/operLog.js';
import { ok } from '../../utils/response.js';
import { ApiError } from '../../utils/ApiError.js';
import * as service from './dataSimInterface.service.js';

const router = Router();

const listQuerySchema = z.object({
  projectId: z.string().min(1),
  keyword: z.string().trim().max(255).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});
const reqSchema = z.object({
  projectId: z.string().min(1),
  description: z.string().trim().min(1, '接口描述必填').max(255),
  method: z.enum(service.METHODS),
  path: z.string().trim().min(1, '接口路径必填').max(255),
  responseData: z.string().max(20000).nullish(),
});
const idSchema = z.object({ id: z.coerce.number().int().positive() });
const importSchema = z.object({
  projectId: z.string().min(1),
  // 单条记录的结构合法性在校验阶段逐个判断；非法条目跳过而非整体失败
  items: z.array(z.unknown()).min(1, '至少需要一条接口').max(10000, '单次最多导入 10000 条'),
});

router.get(
  '/',
  requirePerms('vspace:datasim:list'),
  validate(listQuerySchema, 'query'),
  async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuerySchema>;
    ok(res, await service.listDataSimInterfaces({ projectId: q.projectId, keyword: q.keyword, page: q.page, pageSize: q.pageSize }));
  },
);

router.post(
  '/',
  requirePerms('vspace:datasim:add'),
  operLog('数据模拟接口', 'INSERT'),
  validate(reqSchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof reqSchema>;
    if (await service.isPathTaken(body.projectId, body.path)) {
      throw ApiError.conflict('接口路径已存在');
    }
    const auth = req.user!;
    ok(res, await service.createDataSimInterface(body, { id: auth.id, nickname: auth.nickname }), '新增成功');
  },
);

router.put(
  '/:id',
  requirePerms('vspace:datasim:edit'),
  operLog('数据模拟接口', 'UPDATE'),
  validate(idSchema, 'params'),
  validate(reqSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    const body = req.body as z.infer<typeof reqSchema>;
    if (await service.isPathTaken(body.projectId, body.path, id)) {
      throw ApiError.conflict('接口路径已存在');
    }
    const auth = req.user!;
    ok(res, await service.updateDataSimInterface(id, body, { id: auth.id, nickname: auth.nickname }), '修改成功');
  },
);

router.delete(
  '/:id',
  requirePerms('vspace:datasim:remove'),
  operLog('数据模拟接口', 'DELETE'),
  validate(idSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    await service.removeDataSimInterface(id);
    ok(res, null, '删除成功');
  },
);

// 批量导入：忽略 JSON 中的 id / projectId，统一归入目标项目
router.post(
  '/import',
  requirePerms('vspace:datasim:add'),
  operLog('数据模拟接口', 'IMPORT'),
  validate(importSchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof importSchema>;
    const auth = req.user!;
    const result = await service.importDataSimInterfaces(body.projectId, body.items, {
      id: auth.id,
      nickname: auth.nickname,
    });
    ok(
      res,
      result,
      `导入完成：新增 ${result.imported} 条，更新 ${result.updated} 条，失败 ${result.failed} 条`,
    );
  },
);

export default router;
