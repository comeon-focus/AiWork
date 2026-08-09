import { Tag, Typography } from 'antd';

/**
 * Session ID 展示单元：紫色 Tag + 一键复制。
 * AI 任务与编译详情靠 Session ID 互相关联，复制后可直接粘到对方列表的搜索框里。
 */
export function SessionIdTag({ value }: { value?: string | null }) {
  if (!value) return <>-</>;
  return (
    <Typography.Text copyable={{ text: value, tooltips: ['复制 Session ID', '已复制'] }}>
      <Tag color="purple" style={{ marginInlineEnd: 4 }}>
        {value}
      </Tag>
    </Typography.Text>
  );
}
