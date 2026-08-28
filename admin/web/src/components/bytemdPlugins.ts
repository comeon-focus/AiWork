import type { BytemdPlugin } from 'bytemd';

/**
 * ByteMD 默认高亮器对 ```text 这类语言标识支持不友好，
 * 把 lang 为 'text' 的代码块降级为无语言标识的纯代码块，
 * 保证编辑器与查看器都能正常展示。
 */
export function normalizeTextCodeBlock(): BytemdPlugin {
  return {
    remark: (processor) =>
      processor.use(() => (tree: any) => {
        function visit(node: any) {
          if (node?.type === 'code' && node.lang === 'text') {
            delete node.lang;
            delete node.meta;
          }
          if (Array.isArray(node?.children)) {
            for (const child of node.children) visit(child);
          }
        }
        visit(tree);
      }),
  };
}
