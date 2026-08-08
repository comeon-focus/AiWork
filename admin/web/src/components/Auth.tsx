import type { ReactNode } from 'react';
import { usePerms } from '@/hooks/usePerms';

interface AuthProps {
  /** 权限码，数组表示「任一满足」 */
  perms?: string | string[];
  children: ReactNode;
  /** 无权限时展示的内容，默认什么都不渲染 */
  fallback?: ReactNode;
}

/**
 * 按钮/区块级权限包裹组件。
 * 只影响「看不看得见」，真正的拦截在后端 requirePerms 中间件。
 */
export function Auth({ perms, children, fallback = null }: AuthProps) {
  const { hasPerm } = usePerms();
  return <>{hasPerm(perms) ? children : fallback}</>;
}
