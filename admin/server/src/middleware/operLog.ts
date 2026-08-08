import type { NextFunction, Request, Response } from 'express';
import { Dept, OperLog } from '../models/index.js';
import { getClientIp } from '../utils/request.js';

export type BusinessType = 'INSERT' | 'UPDATE' | 'DELETE' | 'GRANT' | 'EXPORT' | 'IMPORT' | 'OTHER';

const SENSITIVE_KEYS = ['password', 'oldPassword', 'newPassword', 'refreshToken', 'token'];

function desensitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(desensitize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        SENSITIVE_KEYS.includes(k) ? '******' : desensitize(v),
      ]),
    );
  }
  return value;
}

function truncate(text: string, max = 4000): string {
  return text.length > max ? `${text.slice(0, max)}...(截断)` : text;
}

/**
 * 记录写操作日志。挂在需要审计的路由上，响应结束后异步落库，不阻塞请求。
 */
export function operLog(title: string, businessType: BusinessType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    let responseBody: unknown = null;

    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      responseBody = body;
      return originalJson(body);
    };

    res.on('finish', () => {
      void writeLog();
    });

    async function writeLog() {
      try {
        const user = req.user;
        const body = responseBody as { code?: number; msg?: string } | null;
        const success = res.statusCode < 400 && (body?.code === undefined || body.code === 0);

        let deptName: string | null = null;
        if (user?.deptId != null) {
          deptName = (await Dept.findByPk(user.deptId))?.name ?? null;
        }

        await OperLog.create({
          title,
          businessType,
          operId: user?.id ?? null,
          operName: user?.username ?? null,
          deptName,
          operUrl: req.originalUrl.slice(0, 255),
          requestMethod: req.method,
          operIp: getClientIp(req),
          operParam: truncate(
            JSON.stringify({ params: req.params, query: req.query, body: desensitize(req.body) }),
          ),
          jsonResult: success ? truncate(JSON.stringify(responseBody), 2000) : null,
          status: success ? 1 : 0,
          errorMsg: success ? null : truncate(body?.msg ?? `HTTP ${res.statusCode}`, 1000),
          costTime: Date.now() - start,
        });
      } catch (err) {
        // 日志失败不能影响主流程
        console.error('[operLog] 写入失败', err);
      }
    }

    next();
  };
}
