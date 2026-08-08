import type { Request } from 'express';

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]!.trim();
  }
  return (req.ip ?? req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
}

/** 极简 UA 解析，仅用于日志展示，不追求精确 */
export function parseUserAgent(ua = ''): { browser: string; os: string } {
  const browser =
    /Edg\/([\d.]+)/.exec(ua)?.[0] ??
    /OPR\/([\d.]+)/.exec(ua)?.[0] ??
    /Chrome\/([\d.]+)/.exec(ua)?.[0] ??
    /Firefox\/([\d.]+)/.exec(ua)?.[0] ??
    /Version\/([\d.]+).*Safari/.exec(ua)?.[0] ??
    'Unknown';

  let os = 'Unknown';
  if (/Windows NT 10/.test(ua)) os = 'Windows 10/11';
  else if (/Windows NT/.test(ua)) os = 'Windows';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad/.test(ua)) os = 'iOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  return { browser: browser.slice(0, 50), os };
}

/** 统一解析分页参数 */
export function parsePaging(query: Record<string, unknown>): {
  page: number;
  pageSize: number;
  offset: number;
  limit: number;
} {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 10));
  return { page, pageSize, offset: (page - 1) * pageSize, limit: pageSize };
}
