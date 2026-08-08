import { createElement } from 'react';
import * as AntdIcons from '@ant-design/icons';
import type { ComponentType } from 'react';

const iconMap = AntdIcons as unknown as Record<string, ComponentType>;

/** 菜单里存的是图标名字符串，这里按名取 antd 图标组件 */
export function DynamicIcon({ name }: { name?: string | null }) {
  if (!name) return null;
  const Comp = iconMap[name];
  if (!Comp) return null;
  return createElement(Comp);
}
