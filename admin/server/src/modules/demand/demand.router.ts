import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { requirePerms } from '../../middleware/perms.js';
import { operLog } from '../../middleware/operLog.js';
import { ok } from '../../utils/response.js';
import { uploadRequirement, fileTypeOf } from '../../middleware/upload.js';
import { DEMAND_STATUS } from '../../models/index.js';
import * as service from './demand.service.js';

const router = Router();

const fileSchema = z.object({
  fileName: z.string(),
  fileType: z.enum(['doc', 'image']),
  url: z.string(),
});

const demandSchema = z.object({
  title: z.string().trim().min(1, '标题必填').max(100),
  summary: z.string().trim().max(255).nullish(),
  content: z.string().trim().max(5000).nullish(),
  status: z.enum(DEMAND_STATUS).optional(),
  files: z.array(fileSchema).max(20).optional(),
});

const querySchema = z.object({
  title: z.string().trim().optional(),
});

const idSchema = z.object({ id: z.coerce.number().int().positive() });

interface UploadedFile {
  originalname: string;
  mimetype: string;
  filename: string;
}

// 需求文档上传（仅需求文档一类，无 kind 区分）
router.post(
  '/upload',
  requirePerms('orchestration:demand:add'),
  uploadRequirement.array('files', 10),
  (req, res, next) => {
    try {
      const files = (req.files as unknown as UploadedFile[]).map((f) => ({
        fileName: f.originalname,
        fileType: fileTypeOf(f.mimetype),
        url: `/api/uploads/${f.filename}`,
      }));
      ok(res, files, '上传成功');
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/',
  requirePerms('orchestration:demand:list'),
  validate(querySchema, 'query'),
  async (req, res) => {
    const q = req.query as z.infer<typeof querySchema>;
    ok(res, await service.listDemands({ title: q.title }));
  },
);

router.get(
  '/options',
  requirePerms('orchestration:demand:list'),
  async (_req, res) => {
    ok(res, await service.listDemandOptions());
  },
);

router.post(
  '/',
  requirePerms('orchestration:demand:add'),
  operLog('需求列表', 'INSERT'),
  validate(demandSchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof demandSchema>;
    const auth = req.user!;
    ok(
      res,
      await service.createDemand({
        ...body,
        creatorId: auth.id,
        creatorName: auth.nickname,
      }),
      '新增成功',
    );
  },
);

router.put(
  '/:id',
  requirePerms('orchestration:demand:edit'),
  operLog('需求列表', 'UPDATE'),
  validate(idSchema, 'params'),
  validate(demandSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    ok(res, await service.updateDemand(id, req.body as z.infer<typeof demandSchema>), '修改成功');
  },
);

router.delete(
  '/:id',
  requirePerms('orchestration:demand:remove'),
  operLog('需求列表', 'DELETE'),
  validate(idSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    await service.removeDemand(id);
    ok(res, null, '删除成功');
  },
);

export default router;
