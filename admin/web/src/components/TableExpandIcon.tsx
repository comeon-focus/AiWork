import type { MouseEvent as ReactMouseEvent } from 'react';
import { MinusSquareTwoTone, PlusSquareTwoTone } from '@ant-design/icons';

/**
 * 表格树形展开图标：未展开用 PlusSquareTwoTone，已展开用 MinusSquareTwoTone。
 * 叶子节点返回占位符以保持缩进对齐。
 */
export function tableExpandIcon<RecordType>(props: {
  expanded?: boolean;
  expandable?: boolean;
  record?: RecordType;
  onExpand?: (record: RecordType, e: ReactMouseEvent<HTMLElement>) => void;
  needIndentSpaced?: boolean;
}) {
  const { expanded, onExpand, record, needIndentSpaced } = props;
  // 无下级（叶子节点或 children 为空数组）不展示展开图标，仅保留占位以维持缩进对齐
  const children = (record as { children?: unknown[] } | undefined)?.children;
  const hasChildren = Array.isArray(children) && children.length > 0;
  if (needIndentSpaced || !hasChildren) return <span className="table-expand-spacer" />;
  const Icon = expanded ? MinusSquareTwoTone : PlusSquareTwoTone;
  return (
    <Icon
      onClick={(e) => onExpand?.(record as RecordType, e)}
      twoToneColor="#1677ff"
      style={{ fontSize: 16, marginRight: 8, cursor: 'pointer', transition: 'transform 0.2s ease' }}
    />
  );
}
