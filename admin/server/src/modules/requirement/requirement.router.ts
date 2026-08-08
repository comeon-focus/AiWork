import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { requirePerms } from '../../middleware/perms.js';
import { operLog } from '../../middleware/operLog.js';
import { ok } from '../../utils/response.js';
import { uploadRequirement, fileTypeOf } from '../../middleware/upload.js';
import * as service from './requirement.service.js';
import { listDemandOptions } from '../demand/demand.service.js';
import { aiOptimizeRequirement } from '../smartDoc/smartDoc.service.js';

const router = Router();

const fileSchema = z.object({
  fileName: z.string(),
  fileType: z.enum(['doc', 'image']),
  kind: z.enum(['requirement', 'design']),
  url: z.string(),
});

const reqSchema = z.object({
  title: z.string().trim().min(1, '标题必填').max(100),
  summary: z.string().trim().max(255).nullish(),
  content: z.string().trim().max(5000).nullish(),
  files: z.array(fileSchema).max(20).optional(),
  demandIds: z.array(z.coerce.number().int().positive()).max(50).optional(),
  repoId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
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

// 文件上传（需求文档 / 设计稿），单文件一次请求；kind 由表单字段区分
router.post(
  '/upload',
  requirePerms('orchestration:requirement:add'),
  uploadRequirement.array('files', 10),
  (req, res, next) => {
    try {
      const kind = req.body?.kind === 'design' ? 'design' : 'requirement';
      const files = (req.files as unknown as UploadedFile[]).map((f) => ({
        fileName: f.originalname,
        fileType: fileTypeOf(f.mimetype),
        kind,
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
  requirePerms('orchestration:requirement:list'),
  validate(querySchema, 'query'),
  async (req, res) => {
    const q = req.query as z.infer<typeof querySchema>;
    ok(res, await service.listRequirements({ title: q.title }));
  },
);

router.post(
  '/demand-options',
  requirePerms('orchestration:requirement:list'),
  async (_req, res) => {
    ok(res, await listDemandOptions());
  },
);

router.post(
  '/',
  requirePerms('orchestration:requirement:add'),
  operLog('需求列表', 'INSERT'),
  validate(reqSchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof reqSchema>;
    const auth = req.user!;
    ok(
      res,
      await service.createRequirement({
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
  requirePerms('orchestration:requirement:edit'),
  operLog('需求列表', 'UPDATE'),
  validate(idSchema, 'params'),
  validate(reqSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    ok(res, await service.updateRequirement(id, req.body as z.infer<typeof reqSchema>), '修改成功');
  },
);

// AI 优化：调用本机 CodeBuddy 润色需求，生成一条智能文档
router.post(
  '/:id/ai-optimize',
  requirePerms('orchestration:requirement:ai'),
  operLog('需求列表', 'OTHER'),
  validate(idSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    const auth = req.user!;
    ok(res, await aiOptimizeRequirement(id, { id: auth.id, name: auth.nickname }), 'AI 优化完成');
  },
);

router.delete(
  '/:id',
  requirePerms('orchestration:requirement:remove'),
  operLog('需求列表', 'DELETE'),
  validate(idSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    await service.removeRequirement(id);
    ok(res, null, '删除成功');
  },
);

export default router;
