import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { requirePerms } from '../../middleware/perms.js';
import { operLog } from '../../middleware/operLog.js';
import { ok, page } from '../../utils/response.js';
import { parsePaging } from '../../utils/request.js';
import { ApiError } from '../../utils/ApiError.js';
import * as service from './user.service.js';

const router = Router();

const passwordRule = z
  .string()
  .min(8, '密码至少 8 位')
  .max(100)
  .regex(/[A-Za-z]/, '密码需包含字母')
  .regex(/\d/, '密码需包含数字');

const baseUser = {
  deptId: z.coerce.number().int().positive().nullish(),
  nickname: z.string().trim().min(1, '昵称必填').max(50),
  email: z.string().trim().email('邮箱格式不正确').max(100).nullish().or(z.literal('')),
  phone: z.string().trim().max(20).nullish(),
  gender: z.coerce.number().int().min(0).max(2).default(0),
  status: z.coerce.number().int().min(0).max(1).default(1),
  remark: z.string().trim().max(255).nullish(),
  roleIds: z.array(z.coerce.number().int().positive()).optional(),
};

const createSchema = z.object({
  ...baseUser,
  username: z
    .string()
    .trim()
    .min(2, '账号至少 2 个字符')
    .max(50)
    .regex(/^[a-zA-Z0-9_]+$/, '账号只能包含字母、数字、下划线'),
  password: passwordRule,
});

const updateSchema = z.object({ ...baseUser, username: z.string().trim().optional() });

const querySchema = z.object({
  username: z.string().trim().optional(),
  nickname: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  status: z.coerce.number().int().optional(),
  deptId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().optional(),
  pageSize: z.coerce.number().int().optional(),
});

const idSchema = z.object({ id: z.coerce.number().int().positive() });
const resetPwdSchema = z.object({ password: passwordRule });
const changePwdSchema = z.object({ oldPassword: z.string().min(1, '请输入原密码'), newPassword: passwordRule });
const profileSchema = z.object({
  nickname: z.string().trim().min(1, '昵称必填').max(50),
  email: z.string().trim().email('邮箱格式不正确').max(100).nullish().or(z.literal('')),
  phone: z.string().trim().max(20).nullish(),
  gender: z.coerce.number().int().min(0).max(2).default(0),
});

function auth(req: { user?: import('../../types/index.js').AuthUser }) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

/* ── 个人中心：任何登录用户都可操作自己 ─────────────── */
router.put('/profile', operLog('个人信息', 'UPDATE'), validate(profileSchema), async (req, res) => {
  ok(res, await service.updateOwnProfile(auth(req).id, req.body as z.infer<typeof profileSchema>), '修改成功');
});

router.put('/profile/password', operLog('修改密码', 'UPDATE'), validate(changePwdSchema), async (req, res) => {
  const { oldPassword, newPassword } = req.body as z.infer<typeof changePwdSchema>;
  await service.changeOwnPassword(auth(req).id, oldPassword, newPassword);
  ok(res, null, '密码修改成功，请重新登录');
});

/* ── 用户管理 ───────────────────────────────────────── */
router.get('/', requirePerms('system:user:list'), validate(querySchema, 'query'), async (req, res) => {
  const q = req.query as z.infer<typeof querySchema>;
  const paging = parsePaging(q);
  const { rows, count } = await service.listUsers(auth(req), {
    ...q,
    offset: paging.offset,
    limit: paging.limit,
  });
  page(res, rows, count, paging.page, paging.pageSize);
});

router.get('/:id', requirePerms('system:user:list'), validate(idSchema, 'params'), async (req, res) => {
  const { id } = req.params as unknown as z.infer<typeof idSchema>;
  ok(res, await service.getUser(auth(req), id));
});

router.post('/', requirePerms('system:user:add'), operLog('用户管理', 'INSERT'), validate(createSchema), async (req, res) => {
  ok(res, await service.createUser(auth(req), req.body as z.infer<typeof createSchema>), '新增成功');
});

router.put(
  '/:id',
  requirePerms('system:user:edit'),
  operLog('用户管理', 'UPDATE'),
  validate(idSchema, 'params'),
  validate(updateSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    ok(res, await service.updateUser(auth(req), id, req.body as z.infer<typeof updateSchema>), '修改成功');
  },
);

router.put(
  '/:id/password',
  requirePerms('system:user:resetPwd'),
  operLog('重置密码', 'UPDATE'),
  validate(idSchema, 'params'),
  validate(resetPwdSchema),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    const { password } = req.body as z.infer<typeof resetPwdSchema>;
    await service.resetPassword(auth(req), id, password);
    ok(res, null, '密码重置成功');
  },
);

router.delete(
  '/:id',
  requirePerms('system:user:remove'),
  operLog('用户管理', 'DELETE'),
  validate(idSchema, 'params'),
  async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idSchema>;
    await service.removeUser(auth(req), id);
    ok(res, null, '删除成功');
  },
);

export default router;
