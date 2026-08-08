import { Router, type Request } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/auth.js';
import { ok } from '../../utils/response.js';
import { getClientIp } from '../../utils/request.js';
import { ApiError } from '../../utils/ApiError.js';
import * as authService from './auth.service.js';

const router = Router();

const loginSchema = z.object({
  username: z.string().trim().min(2, '账号至少 2 个字符').max(50),
  password: z.string().min(6, '密码至少 6 位').max(100),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10, '缺少刷新凭证'),
});

function clientOf(req: Request) {
  return { ip: getClientIp(req), ua: String(req.headers['user-agent'] ?? '') };
}

router.post('/login', validate(loginSchema), async (req, res) => {
  const { username, password } = req.body as z.infer<typeof loginSchema>;
  const tokens = await authService.login(username, password, clientOf(req));
  ok(res, tokens, '登录成功');
});

router.post('/refresh', validate(refreshSchema), async (req, res) => {
  const { refreshToken } = req.body as z.infer<typeof refreshSchema>;
  const tokens = await authService.refresh(refreshToken, clientOf(req));
  ok(res, tokens);
});

router.post('/logout', async (req, res) => {
  const refreshToken = (req.body as { refreshToken?: string } | undefined)?.refreshToken;
  await authService.logout(refreshToken);
  ok(res, null, '已退出登录');
});

/** 登录后拉取：用户信息 + 操作权限码 + 页面路由树 */
router.get('/profile', authenticate, async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  ok(res, await authService.getProfile(req.user));
});

export default router;
