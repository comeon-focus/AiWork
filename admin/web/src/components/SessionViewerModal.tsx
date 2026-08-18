import { useEffect, useState } from 'react';
import { Alert, Button, Empty, Modal, Spin, Tag, Typography } from 'antd';
import type { TaskSessionView, SessionCompileLog } from '@/api/types';

const { Paragraph, Text } = Typography;

/** 按角色给消息上色 */
function roleColor(role: string): string {
  switch (role) {
    case 'user':
      return 'blue';
    case 'assistant':
      return 'green';
    case 'tool':
    case 'system':
      return 'gold';
    default:
      return 'default';
  }
}

function CompileLogSummary({ log }: { log: SessionCompileLog }) {
  const statusColor =
    log.status === '编译成功' ? 'success' : log.status === '编译失败' ? 'error' : 'default';
  return (
    <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
      <div style={{ marginBottom: 8 }}>
        <Text strong>最近一次编译</Text>{' '}
        <Tag color={statusColor}>{log.status}</Tag>
        {log.model ? <Tag color="purple">{log.model}</Tag> : null}
        {log.changedFiles != null ? (
          <span style={{ fontSize: 12, color: '#666' }}>改动文件 {log.changedFiles} 个</span>
        ) : null}
        {log.commitsAhead != null ? (
          <span style={{ fontSize: 12, color: '#666', marginLeft: 8 }}>领先 {log.commitsAhead} 个提交</span>
        ) : null}
      </div>
      {log.changedDetail ? (
        <pre
          style={{
            maxHeight: 240,
            overflow: 'auto',
            background: '#fafafa',
            border: '1px solid #f0f0f0',
            borderRadius: 6,
            padding: 12,
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            margin: 0,
          }}
        >
          {log.changedDetail}
        </pre>
      ) : (
        <Text type="secondary" style={{ fontSize: 12 }}>
          无改动明细
        </Text>
      )}
    </div>
  );
}

/** AICoding 会话查看器：展示 codebuddy 对话记录 + 最近一次编译改动摘要（只读） */
export function SessionViewerModal({
  open,
  title,
  load,
  onClose,
}: {
  open: boolean;
  title: string;
  load: () => Promise<TaskSessionView>;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TaskSessionView | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setData(null);
    load()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [open, load]);

  const hasContent = data && (data.exists || data.compileLog);

  return (
    <Modal
      open={open}
      title={title}
      width={920}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>
          关闭
        </Button>,
      ]}
      destroyOnHidden
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Spin />
        </div>
      ) : !hasContent ? (
        <Empty description="未找到该任务的 AICoding 会话记录" />
      ) : (
        <div>
          {data && !data.exists && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="会话文件已不在（可能工作区已被回收），仅展示数据库中的编译记录"
            />
          )}
          <div style={{ maxHeight: 520, overflow: 'auto', paddingRight: 4 }}>
            {data?.messages.map((m, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <Tag color={roleColor(m.role)}>{m.role}</Tag>
                <Paragraph style={{ whiteSpace: 'pre-wrap', margin: '4px 0' }}>{m.text}</Paragraph>
              </div>
            ))}
          </div>
          {data?.compileLog && <CompileLogSummary log={data.compileLog} />}
        </div>
      )}
    </Modal>
  );
}
