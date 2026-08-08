import { useCallback } from 'react';
import { checkPerm, useAuthStore } from '@/store/useAuthStore';

/**
 * 按钮级权限判断。
 * 注意：这里只影响「看不看得见」，真正的拦截在后端 requirePerms 中间件。
 */
export function usePerms() {
  const perms = useAuthStore((s) => s.perms);
  const hasPerm = useCallback((code?: string | string[]) => checkPerm(perms, code), [perms]);
  return { perms, hasPerm };
}
