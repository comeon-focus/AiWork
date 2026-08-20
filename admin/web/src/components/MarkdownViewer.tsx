import { useMemo, useRef } from 'react';
import { Viewer } from '@bytemd/react';
import gfm from '@bytemd/plugin-gfm';
import type { BytemdPlugin } from 'bytemd';
import 'bytemd/dist/index.css';

interface TocItem {
  level: number;
  text: string;
  id: string;
}

interface Props {
  value?: string;
  showToc?: boolean;
}

function stripHeadingMarkdown(raw: string): string {
  return (
    raw
      // 图片 ![alt](url) -> alt
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      // 链接 [text](url) -> text
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      // 行内代码
      .replace(/`([^`]+)`/g, '$1')
      // 加粗 / 斜体
      .replace(/(\*\*|__|\*|_)/g, '')
      // 删除线
      .replace(/~~([^~]+)~~/g, '$1')
      // HTML 标签
      .replace(/<[^>]+>/g, '')
      .trim()
  );
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'heading';
}

function extractToc(value: string): TocItem[] {
  const items: TocItem[] = [];
  const lines = value.split('\n');
  let inCodeBlock = false;
  const slugCount = new Map<string, number>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (!match) continue;

    const level = match[1].length;
    const text = stripHeadingMarkdown(match[2]);
    if (!text) continue;

    const base = slugify(text);
    const count = slugCount.get(base) ?? 0;
    slugCount.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count}`;

    items.push({ level, text, id });
  }

  return items;
}

function headingAnchorPlugin(items: TocItem[]): BytemdPlugin {
  return {
    rehype: (processor) =>
      processor.use(() => (tree: any) => {
        let index = 0;
        function visit(node: any) {
          if (node?.type === 'element' && /^h[1-6]$/.test(node.tagName)) {
            const item = items[index];
            if (item) {
              node.properties = { ...node.properties, id: item.id };
              index++;
            }
          }
          if (Array.isArray(node?.children)) {
            for (const child of node.children) visit(child);
          }
        }
        visit(tree);
      }),
  };
}

/** 只读 Markdown 渲染器，支持 GFM 表格、任务列表等；showToc 开启左侧目录 */
export function MarkdownViewer({ value, showToc = true }: Props) {
  const raw = value ?? '';
  const toc = useMemo(() => extractToc(raw), [raw]);
  const plugins = useMemo(() => [gfm(), headingAnchorPlugin(toc)], [toc]);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTocClick = (id: string) => {
    const el = document.getElementById(id);
    if (el && containerRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (!showToc || toc.length === 0) {
    return <Viewer value={raw} plugins={[gfm()]} />;
  }

  return (
    <div ref={containerRef} className="markdown-viewer-with-toc">
      <nav className="markdown-toc">
        <div className="markdown-toc-title">目录</div>
        <ul className="markdown-toc-list">
          {toc.map((item) => (
            <li
              key={item.id}
              className={`markdown-toc-item markdown-toc-level-${item.level}`}
              style={{ paddingLeft: (item.level - 1) * 12 }}
            >
              <button type="button" onClick={() => handleTocClick(item.id)}>
                {item.text}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="markdown-viewer-body">
        <Viewer value={raw} plugins={plugins} />
      </div>
    </div>
  );
}

export default MarkdownViewer;
