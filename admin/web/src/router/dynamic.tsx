import { lazy, type ComponentType } from 'react';
import type { RouteObject } from 'react-router-dom';
import type { RouteItem } from '@/api/types';

/** 预扫描 pages 下所有页面，后端下发的 component 字段据此映射到真实组件 */
const modules = import.meta.glob('../pages/**/*.tsx');

function resolveComponent(component: string | null): ComponentType | null {
  if (!component) return null;
  const key = `../pages/${component}.tsx`;
  const loader = modules[key];
  if (!loader) {
    console.warn(`[router] 后端配置的组件不存在: src/pages/${component}.tsx`);
    return null;
  }
  return lazy(loader as () => Promise<{ default: ComponentType }>);
}

/** 菜单树拍平成一级路由：侧边栏保持层级，路由本身不需要嵌套 */
export function flattenMenus(nodes: RouteItem[]): RouteItem[] {
  const result: RouteItem[] = [];
  const walk = (list: RouteItem[]) => {
    for (const node of list) {
      result.push(node);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(nodes);
  return result;
}

/** 把后端菜单树转换为 react-router 的路由配置 */
export function buildRouteObjects(tree: RouteItem[]): RouteObject[] {
  const routes: RouteObject[] = [];
  for (const node of flattenMenus(tree)) {
    if (!node.component || !node.path) continue;
    const Component = resolveComponent(node.component);
    if (!Component) continue;
    routes.push({ path: node.path, element: <Component /> });
  }
  return routes;
}

/** 登录后默认落地页：第一个可访问的页面 */
export function firstAccessiblePath(tree: RouteItem[]): string {
  const found = flattenMenus(tree).find((n) => n.component && n.path && !n.meta.hidden);
  return found?.path ?? '/403';
}
