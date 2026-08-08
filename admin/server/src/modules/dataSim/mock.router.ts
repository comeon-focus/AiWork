import { Router, type Request, type Response } from 'express';
import { DataSimInterface } from '../../models/dataSimInterface.js';

/**
 * 数据模拟的对外调用入口（免鉴权）。
 * 链接形如：/mock/{projectId}{path}
 * 命中条件：projectId + 接口路径 + 请求方法 三者匹配，返回该接口配置的响应数据。
 * 响应数据支持两种写法：
 *   1. 普通 JSON：原样返回（能解析为 JSON 时按 application/json 返回）。
 *   2. 动态 JS 对象字面量：可包含箭头函数，函数会接收请求上下文 _req 并被调用，
 *      从而根据接口参数（query / params / body / headers 等）返回不同结构。例如：
 *        {
 *          a: 1,
 *          b: ({ _req }) => _req.query.id,
 *          list: ({ _req }) => Array.from({ length: Number(_req.query.size || 10) }, (_, i) => ({ id: i })),
 *        }
 * 注：脚本内容来自管理员在后台配置的数据，并非请求方注入，调用方无法借此执行任意代码。
 * 支持 JSONP：携带 callback 查询参数时，按 application/javascript 返回 callback(<json>) 形式。
 */
const router = Router();

// 限制 callback 名称，避免脚本注入
const CALLBACK_RE = /^[A-Za-z_$][\w$.[\]]*$/;

interface ReqContext {
  method: string;
  url: string;
  path: string;
  query: Request['query'];
  params: Request['params'];
  headers: Request['headers'];
  body: unknown;
  get: (name: string) => string | undefined;
  _req?: unknown;
}

function buildContext(req: Request): ReqContext {
  const ctx: ReqContext = {
    method: req.method,
    url: req.originalUrl,
    path: req.path,
    query: req.query,
    params: req.params,
    headers: req.headers,
    body: req.body,
    get: (name: string) => req.get(name) ?? undefined,
  };
  // 便于同时支持 ({ _req }) => ... 与 (_req) => ... 两种写法
  ctx._req = ctx;
  return ctx;
}

/**
 * 解析响应值：函数会被调用（传入请求上下文），对象 / 数组会递归解析，
 * 以便 { b: ({ _req }) => _req.query.id } 中的 b 取到函数执行结果而非函数本身。
 */
function resolve(value: unknown, ctx: ReqContext): unknown {
  if (typeof value === 'function') {
    return resolve(value(ctx), ctx);
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolve(v, ctx));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      out[key] = resolve((value as Record<string, unknown>)[key], ctx);
    }
    return out;
  }
  return value;
}

async function handleMock(req: Request, res: Response) {
  // req.path 相对 /mock 挂载点，例如 /FBuuSWvhzBSYWkFk/api/users
  const segments = req.path.split('/').filter(Boolean);
  if (segments.length === 0) {
    res.status(404).json({ code: 404, msg: '缺少项目ID', data: null });
    return;
  }

  const projectId = segments[0];
  const interfacePath = segments.length > 1 ? `/${segments.slice(1).join('/')}` : '/';

  const item = await DataSimInterface.findOne({
    where: { projectId, path: interfacePath, method: req.method.toUpperCase() },
  });

  if (!item) {
    res.status(404).json({ code: 404, msg: '未找到匹配的模拟接口', data: null });
    return;
  }

  const raw = item.responseData;
  if (!raw || !raw.trim()) {
    res.json({ code: 0, msg: 'ok', data: null });
    return;
  }

  const ctx = buildContext(req);
  const trimmed = raw.trim();
  let value: unknown;
  let isText = false;

  try {
    // 优先按严格 JSON 解析
    value = JSON.parse(trimmed);
  } catch {
    // 非严格 JSON：尝试作为含函数的 JS 对象字面量求值（动态响应）
    const looksLikeObject = /^[[{]/.test(trimmed);
    try {
      const fn = new Function('_req', `"use strict"; return (${trimmed});`);
      value = resolve(fn(ctx), ctx);
    } catch (err) {
      if (looksLikeObject) {
        res.status(500).json({ code: 500, msg: `响应数据脚本执行失败：${(err as Error).message}`, data: null });
        return;
      }
      // 形如 XML 等纯文本，按原样返回
      value = trimmed;
      isText = true;
    }
  }

  // JSONP 模式
  const callback = req.query.callback;
  if (typeof callback === 'string' && callback.length > 0) {
    if (!CALLBACK_RE.test(callback)) {
      res.status(400).json({ code: 400, msg: '非法的 callback 参数', data: null });
      return;
    }
    res.type('application/javascript').send(`${callback}(${JSON.stringify(value)})`);
    return;
  }

  if (isText) {
    res.type('text/plain').send(raw);
  } else {
    res.json(value);
  }
}

router.use(handleMock);

export default router;
