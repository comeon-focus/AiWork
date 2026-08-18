import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { requirePerms } from '../../middleware/perms.js';
import { operLog } from '../../middleware/operLog.js';
import { ok, page } from '../../utils/response.js';
import { parsePaging } from '../../utils/request.js';
import { AI_TASK_STATUS } from '../../models/index.js';
import { MODEL_WHITELIST } from '../../utils/codebuddy.js';
import * as service from './aiTask.service.js';

const router = Router();

/** 字节数转人类可读（用于清理结果提示） */
function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const taskSchema = z.object({
  title: z.string().trim().min(1, '标题必填').max(100),
  summary: z.string().trim().max(255).nullish(),
  smartDocId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  branch: z.string().trim().max(100).nullish(),
  /** 选用的 AI 模型；留空/null 表示使用系统默认模型 */
  model: z
    .string()
    .max(50)
    .nullish()
    .refine((v) => !v || MODEL_WHITELIST.includes(v), { message: '不支持的 AI 模型' }),
  status: z.enum(AI_TASK_STATUS).optional(),
});

const statusSchema = z.object({ status: z.enum(AI_TASK_STATUS) });

const querySchema = z.object({
  title: z.string().trim().optional(),
  sessionId: z.string().trim().optional(),
  status: z.enum(AI_TASK_STATUS).optional(),
  smartDocId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().optional(),
  pageSize: z.coerce.number().int().optional(),
});

const idSchema = z.object({ id: z.coerce.number().int().positive() });

/** 孤儿工作区清理入参：指定要清理的 sessionId 列表 */
const orphanCleanSchema = z.object({
  sessionIds: z.array(z.string().trim().min(1).max(16)).min(1).max(500),
});

/** 已结束任务资源回收入参：force=1 表示已确认丢弃未提交改动 */
const reclaimSchema = z.object({ force: z.boolean().optional() });

router.get(
  '/models',
  requirePerms('orchestration:aiTask:list'),
  async (_req, res) => {
    ok(res, service.listAiModels());
  },
);

router.get(
  '/',
  requirePerms('orchestration:aiTask:list'),
  validate(querySchema, 'query'),
  async (req, res) => {
    const q = req.query as unknown as z.infer<typeof querySchema>;
    const paging = parsePaging(q);
    const { rows, count } = await service.listAiTasks({
      title: q.title,
      sessionId: q.sessionId,
      status: q.status,
      smartDocId: q.smartDocId,
      offset: paging.offset,
      limit: paging.limit,
    });
    page(res, rows, count, paging.page, paging.pageSize);
  },
);

router.post(
  '/',
  requirePerms('orchestration:aiTask:add'),
  operLog('AI任务', 'INSERT'),
  validate(taskSchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof taskSchema>;
    const auth = req.user!;
    ok(
      res,
      await service.createAiTask({
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
  requirePerms('orchestration:aiTask:edit'),
  operLog('AI任务', 'UPDATE'),
  validate(idSchema, 'params'),
  validate(taskSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    ok(res, await service.updateAiTask(id, req.body as z.infer<typeof taskSchema>), '修改成功');
  },
);

router.delete(
  '/:id',
  requirePerms('orchestration:aiTask:remove'),
  operLog('AI任务', 'DELETE'),
  validate(idSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    // force=1：用户已在确认框中确认丢弃未提交改动
    const force = req.query.force === 'true' || req.query.force === '1';
    await service.removeAiTask(id, { force });
    ok(res, null, '删除成功');
  },
);

/** 孤儿工作区列表：AiWorkSpace 下已无对应 AI 任务的目录（资源泄漏检测） */
router.get(
  '/orphan-workspaces',
  requirePerms('orchestration:aiTask:list'),
  async (_req, res) => {
    ok(res, await service.listOrphanWorkspaces());
  },
);

/** 清理孤儿工作区：仅删真实孤儿（二次校验），绝不误删仍有关联任务的目录 */
router.post(
  '/orphan-workspaces/clean',
  requirePerms('orchestration:aiTask:remove'),
  operLog('AI任务', 'DELETE'),
  validate(orphanCleanSchema),
  async (req, res) => {
    const { sessionIds } = req.body as z.infer<typeof orphanCleanSchema>;
    const result = await service.cleanOrphanWorkspaces(sessionIds);
    ok(res, result, `已清理 ${result.removed.length} 个孤儿工作区，释放 ${formatBytes(result.freedBytes)}`);
  },
);

/** 已结束任务资源占用列表：仍持有本地仓库/远程分支/会话缓存的「已结束」任务 */
router.get(
  '/ended-resources',
  requirePerms('orchestration:aiTask:list'),
  async (_req, res) => {
    ok(res, await service.listEndedTaskResources());
  },
);

/** 回收「已结束」任务的本地资源（保留 DB 行与历史）；force=1 丢弃未提交改动 */
router.post(
  '/:id/reclaim',
  requirePerms('orchestration:aiTask:remove'),
  operLog('AI任务', 'UPDATE'),
  validate(idSchema, 'params'),
  validate(reclaimSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    const { force } = req.body as z.infer<typeof reclaimSchema>;
    const result = await service.reclaimEndedTaskResources(id, { force });
    ok(res, result, '已回收该任务的本地资源（任务记录与历史保留）');
  },
);

router.patch(
  '/:id/status',
  requirePerms('orchestration:aiTask:edit'),
  operLog('AI任务', 'UPDATE'),
  validate(idSchema, 'params'),
  validate(statusSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    const { status } = req.body as z.infer<typeof statusSchema>;
    ok(res, await service.updateAiTaskStatus(id, status), '状态已更新');
  },
);

/** AICoding 会话查看：返回会话对话记录 + 最近一次编译的改动摘要 */
router.get(
  '/:id/session',
  requirePerms('orchestration:aiTask:list'),
  validate(idSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    ok(res, await service.getTaskSession(id));
  },
);

router.post(
  '/:id/commit',
  requirePerms('orchestration:aiTask:commit'),
  operLog('AI任务', 'UPDATE'),
  validate(idSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    const auth = req.user!;
    const r = await service.commitAiTaskCode(id, { id: auth.id, nickname: auth.nickname });
    ok(res, r, `已提交 ${r.changedFiles} 个文件并推送到 ${r.branch}`);
  },
);

router.post(
  '/:id/aicoding',
  requirePerms('orchestration:aiTask:edit'),
  operLog('AI任务', 'UPDATE'),
  validate(idSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    const auth = req.user!;
    ok(res, await service.aicodingAITask(id, { id: auth.id, nickname: auth.nickname }), 'AICoding 已启动');
  },
);

export default router;
