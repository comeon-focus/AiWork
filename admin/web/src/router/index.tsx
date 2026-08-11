import { Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { Navigate, useLocation, useRoutes } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuthStore } from '@/store/useAuthStore';
import BasicLayout from '@/layouts/BasicLayout';
import Login from '@/pages/login';
import Forbidden from '@/pages/error/403';
import NotFound from '@/pages/error/404';
import { buildRouteObjects, firstAccessiblePath } from './dynamic';

function FullscreenLoading() {
  return (
    <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }}>
      <Spin size="large" tip="加载中..." />
    </div>
  );
}

/** 路由守卫：已登录用户访问登录页时，直接重定向至首页（或其他原本想去的页面） */
function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const hasToken = useAuthStore((s) => s.hasToken);
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  if (hasToken) {
    return <Navigate to={from ?? '/'} replace />;
  }
  return <>{children}</>;
}

/** 路由守卫：未登录跳登录页；已登录但权限未就绪则先拉 profile */
function RequireAuth({ children }: { children: ReactNode }) {
  const hasToken = useAuthStore((s) => s.hasToken);
  const ready = useAuthStore((s) => s.ready);
  const loadProfile = useAuthStore((s) => s.loadProfile);
  const reset = useAuthStore((s) => s.reset);
  const location = useLocation();

  useEffect(() => {
    if (hasToken && !ready) {
      loadProfile().catch(() => reset());
    }
  }, [hasToken, ready, loadProfile, reset]);

  if (!hasToken) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (!ready) return <FullscreenLoading />;
  return <>{children}</>;
}

export function AppRoutes() {
  const routes = useAuthStore((s) => s.routes);
  const ready = useAuthStore((s) => s.ready);

  const dynamicRoutes = useMemo(() => buildRouteObjects(routes), [routes]);
  const landing = useMemo(() => firstAccessiblePath(routes), [routes]);

  const element = useRoutes([
    { path: '/login', element: <RedirectIfAuthed><Login /></RedirectIfAuthed> },
    { path: '/403', element: <Forbidden /> },
    {
      path: '/',
      element: (
        <RequireAuth>
          <BasicLayout />
        </RequireAuth>
      ),
      children: [
        // 路由未就绪时先停在加载态，避免闪一下 404
        { index: true, element: ready ? <Navigate to={landing} replace /> : <FullscreenLoading /> },
        ...dynamicRoutes,
        { path: '*', element: <NotFound /> },
      ],
    },
  ]);

  return <Suspense fallback={<FullscreenLoading />}>{element}</Suspense>;
}
