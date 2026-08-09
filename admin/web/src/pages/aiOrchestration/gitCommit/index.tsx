import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { aiGitCommitApi } from '@/api';
import type { AiGitCommitItem, AiGitCommitStatus } from '@/api/types';
import { AI_GIT_COMMIT_STATUS, AI_GIT_COMMIT_STATUS_COLOR } from '@/api/types';
import { Auth } from '@/components/Auth';
import { SessionIdTag } from '@/components/SessionIdTag';

/** 提交详情抽屉：列表不下发改动明细，打开时按 id 再拉一次完整记录 */
function CommitDrawer({ record, open, onClose }: { record: AiGitCommitItem; open: boolean; onClose: () => void }) {
  const [detail, setDetail] = useState<AiGitCommitItem>(record);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setDetail(record);
    setLoading(true);
    void (async () => {
      try {
        const r = await aiGitCommitApi.detail(record.id);
        if (alive) setDetail(r);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, record]);

  const failed = detail.status === '提交失败';

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={860}
      loading={loading}
      title={
        <Space>
          <span>提交详情 · {detail.title}</span>
          <Tag color={AI_GIT_COMMIT_STATUS_COLOR[detail.status]}>{detail.status}</Tag>
        </Space>
      }
      destroyOnHidden
      styles={{ body: { display: 'flex', flexDirection: 'column', gap: 12 } }}
    >
      {failed && detail.errorMsg && <Alert type="error" showIcon message="失败原因" description={detail.errorMsg} />}
      {/* 本地提交成功但推送失败：hash 已存在，必须提醒别重复点，否则会堆出一串空提交 */}
      {failed && detail.commitHash && (
        <Alert
          type="warning"
          showIcon
          message="本地提交已生成，仅推送远端失败"
          description="改动已 commit 到本地代码库，重新点击「提交代码」只会推送这次提交，不会重复提交同一批改动。"
        />
      )}
      {!failed && detail.changedFiles === 0 && (
        <Alert type="warning" showIcon message="本次提交未包含任何文件改动" />
      )}

      <Descriptions
        size="small"
        column={2}
        bordered
        items={[
          { label: 'Session ID', children: <SessionIdTag value={detail.sessionId} /> },
          { label: '任务 ID', children: detail.taskId },
          { label: '分支', children: detail.branch || '-' },
          {
            label: 'Commit',
            children: detail.commitHash ? (
              <Typography.Text copyable code>
                {detail.commitHash}
              </Typography.Text>
            ) : (
              '-'
            ),
          },
          {
            label: '改动文件',
            children:
              detail.changedFiles == null ? '-' : <Tag color={detail.changedFiles > 0 ? 'green' : 'red'}>{detail.changedFiles} 个文件</Tag>,
          },
          { label: '提交人', children: detail.creatorName || '-' },
          { label: '提交时间', children: detail.createdAt || '-', span: 2 },
        ]}
      />

      <Card size="small" title="commit 注释">
        <Typography.Text copyable={{ text: detail.commitMessage }} style={{ wordBreak: 'break-all' }}>
          {detail.commitMessage}
        </Typography.Text>
      </Card>

      <Card size="small" title="改动明细">
        {detail.changedDetail ? (
          <pre style={{ margin: 0, maxHeight: 320, overflow: 'auto', fontSize: 12 }}>{detail.changedDetail}</pre>
        ) : (
          <span style={{ color: '#999' }}>无</span>
        )}
      </Card>
    </Drawer>
  );
}

export default function GitCommitPage() {
  const [data, setData] = useState<AiGitCommitItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [statusFilter, setStatusFilter] = useState<AiGitCommitStatus | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [detail, setDetail] = useState<AiGitCommitItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = useCallback(
    async (next?: { page?: number; pageSize?: number }) => {
      setLoading(true);
      try {
        const p = next?.page ?? page;
        const ps = next?.pageSize ?? pageSize;
        const resp = await aiGitCommitApi.list({
          ...(keyword ? { title: keyword } : {}),
          ...(sessionId ? { sessionId } : {}),
          ...(statusFilter ? { status: statusFilter } : {}),
          page: p,
          pageSize: ps,
        });
        setData(resp.list);
        setTotal(resp.total);
        setPage(p);
        setPageSize(ps);
      } finally {
        setLoading(false);
      }
    },
    [keyword, sessionId, statusFilter, page, pageSize],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (id: number) => {
    await aiGitCommitApi.remove(id);
    message.success('删除成功');
    void load();
  };

  const openDetail = (record: AiGitCommitItem) => {
    setDetail(record);
    setDrawerOpen(true);
  };

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="GIT提交记录"
        description="AI 任务每点击一次「提交代码」生成一条记录，成功与失败都会留痕，标题与 Session ID 取自所属 AI 任务。点击「查看」可看到本次的 commit 注释、改动明细或失败原因。"
      />

      <Card className="search-bar">
        <Space wrap>
          <Input
            placeholder="任务标题"
            allowClear
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={() => load({ page: 1 })}
            style={{ width: 200 }}
          />
          <Input
            placeholder="Session ID"
            allowClear
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            onPressEnter={() => load({ page: 1 })}
            style={{ width: 200 }}
          />
          <Select
            placeholder="提交状态"
            allowClear
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
            options={AI_GIT_COMMIT_STATUS.map((s) => ({ label: s, value: s }))}
            style={{ width: 140 }}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={() => load({ page: 1 })}>
            查询
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setKeyword('');
              setSessionId('');
              setStatusFilter(undefined);
              void load({ page: 1 });
            }}
          >
            重置
          </Button>
        </Space>
      </Card>

      <Card className="page-card" title="代码提交列表">
        <Table<AiGitCommitItem>
          rowKey="id"
          loading={loading}
          dataSource={data}
          scroll={{ x: 1400 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => load({ page: p, pageSize: ps }),
          }}
          columns={[
            { title: '标题', dataIndex: 'title', width: 220, fixed: 'left' },
            {
              title: 'Session ID',
              dataIndex: 'sessionId',
              width: 200,
              render: (v: string) => <SessionIdTag value={v} />,
            },
            {
              title: '提交状态',
              dataIndex: 'status',
              width: 110,
              render: (v: AiGitCommitStatus, record) =>
                v === '提交失败' && record.errorMsg ? (
                  <Tooltip title={record.errorMsg}>
                    <Tag color={AI_GIT_COMMIT_STATUS_COLOR[v]}>{v}</Tag>
                  </Tooltip>
                ) : (
                  <Tag color={AI_GIT_COMMIT_STATUS_COLOR[v]}>{v}</Tag>
                ),
            },
            {
              title: '改动文件',
              dataIndex: 'changedFiles',
              width: 110,
              render: (v: number | null) =>
                v == null ? <span style={{ color: '#999' }}>-</span> : <Tag color={v > 0 ? 'green' : 'red'}>{v} 个文件</Tag>,
            },
            { title: '分支', dataIndex: 'branch', width: 160, render: (v: string | null) => v || '-' },
            {
              title: 'Commit',
              dataIndex: 'commitHash',
              width: 120,
              render: (v: string | null) => (v ? <Typography.Text code>{v}</Typography.Text> : '-'),
            },
            { title: '提交人', dataIndex: 'creatorName', width: 100, render: (v: string | null) => v || '-' },
            { title: '提交时间', dataIndex: 'createdAt', width: 180, render: (v: string | null) => v || '-' },
            {
              title: '操作',
              width: 130,
              fixed: 'right',
              render: (_, record) => (
                <Space size={4}>
                  <Auth perms="orchestration:gitCommit:list">
                    <Button type="link" size="small" onClick={() => openDetail(record)}>
                      查看
                    </Button>
                  </Auth>
                  <Auth perms="orchestration:gitCommit:remove">
                    <Popconfirm title="确认删除该提交记录？" onConfirm={() => remove(record.id)}>
                      <Button type="link" size="small" danger>
                        删除
                      </Button>
                    </Popconfirm>
                  </Auth>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      {detail && <CommitDrawer record={detail} open={drawerOpen} onClose={() => setDrawerOpen(false)} />}
    </>
  );
}
