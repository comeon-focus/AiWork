export interface TreeNode {
  id: number;
  parentId: number;
  children?: TreeNode[];
}

/**
 * 扁平列表转树。父节点缺失（如被停用或无权访问）的节点会被提升为根，
 * 避免因中间节点不可见导致整棵子树丢失。
 */
export function buildTree<T extends { id: number; parentId: number }>(
  list: T[],
  rootId = 0,
): (T & { children: (T & { children: unknown[] })[] })[] {
  type Node = T & { children: Node[] };
  const map = new Map<number, Node>();
  const nodes: Node[] = list.map((item) => ({ ...item, children: [] }) as Node);
  nodes.forEach((n) => map.set(n.id, n));

  const roots: Node[] = [];
  for (const node of nodes) {
    const parent = map.get(node.parentId);
    if (node.parentId === rootId || !parent) {
      roots.push(node);
    } else {
      parent.children.push(node);
    }
  }
  return roots as (T & { children: (T & { children: unknown[] })[] })[];
}

/** 收集某节点的全部子孙 id（含自身） */
export function collectDescendantIds<T extends { id: number; parentId: number }>(
  list: T[],
  rootId: number,
): number[] {
  const childrenMap = new Map<number, number[]>();
  for (const item of list) {
    const arr = childrenMap.get(item.parentId) ?? [];
    arr.push(item.id);
    childrenMap.set(item.parentId, arr);
  }
  const result: number[] = [];
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    result.push(cur);
    stack.push(...(childrenMap.get(cur) ?? []));
  }
  return result;
}
