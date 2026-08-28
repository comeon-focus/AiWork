import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import { EyeOutlined, FullscreenExitOutlined, FullscreenOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { aiGitCommitApi } from '@/api';
import type { AiGitCommitItem, AiGitCommitStatus } from '@/api/types';
import { AI_GIT_COMMIT_STATUS, AI_GIT_COMMIT_STATUS_COLOR } from '@/api/types';
import { Auth } from '@/components/Auth';
import { SessionIdTag } from '@/components/SessionIdTag';

interface ChangedFile {
  status: string;
  path: string;
  diff: string | null;
}

/** 解析改动明细：每行「状态 路径」，重命名取目标路径。
 * 兼容两种存储格式：
 * - 原始 porcelain：" M path" / "M  path" / "MM path"，第 3 列（索引 2）固定为分隔空格
 * - 旧数据被 trim 过："M path"，状态后第一个空格即为分隔
 */
function parseChangedDetail(detail: string | null | undefined, diffs: Record<string, string> | null): ChangedFile[] {
  if (!detail) return [];
  return detail
    .split('\n')
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .map((line) => {
      // 标准 porcelain：第 3 个字符是空格，且第 2 个字符不是空格（否则是 "M  path"，应走 else 分支按第一个空格切分）
      let status: string;
      let pathPart: string;
      if (line.length > 2 && line[2] === ' ' && line[1] !== ' ') {
        status = line.slice(0, 2).trim();
        pathPart = line.slice(3);
      } else {
        const sep = line.indexOf(' ');
        status = sep > 0 ? line.slice(0, sep).trim() : line.trim();
        pathPart = sep > 0 ? line.slice(sep + 1).trimStart() : '';
      }
      const arrow = pathPart.indexOf(' -> ');
      const path = arrow >= 0 ? pathPart.slice(arrow + 4) : pathPart;
      return { status, path, diff: diffs?.[path] ?? null };
    });
}

/** 按 git diff 语义给每行加背景色，方便定位增删改 */
function DiffRenderer({ diff, maxHeight = 520 }: { diff: string; maxHeight?: number | string }) {
  if (!diff) return null;
  // 非标准 git diff（如提示文案）仍按原样展示
  if (!diff.startsWith('diff --git') && !diff.includes('\ndiff --git')) {
    return (
      <pre
        style={{
          margin: 0,
          maxHeight,
          overflow: 'auto',
          fontSize: 12,
          background: '#f6f8fa',
          padding: 12,
          borderRadius: 4,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {diff}
      </pre>
    );
  }

  const lines = diff.split('\n');
  return (
    <div
      style={{
        maxHeight,
        overflow: 'auto',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 12,
        background: '#f6f8fa',
        borderRadius: 4,
        padding: '8px 0',
      }}
    >
      {lines.map((line, i) => {
        let background = 'transparent';
        let color = '#24292f';
        if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) {
          background = '#eaeef2';
          color = '#57606a';
        } else if (line.startsWith('@@')) {
          background = '#ddf4ff';
          color = '#0550ae';
        } else if (line.startsWith('+') && !line.startsWith('+++ ')) {
          background = '#dafbe1';
          color = '#1a7f37';
        } else if (line.startsWith('-') && !line.startsWith('--- ')) {
          background = '#ffebe9';
          color = '#cf222e';
        }
        return (
          <div key={i} style={{ whiteSpace: 'pre', padding: '1px 12px', background, color }}>
            {line || '\u00A0'}
          </div>
        );
      })}
    </div>
  );
}

/** git status 简写转可读标签 */
function statusLabel(status: string): string {
  const map: Record<string, string> = {
    M: '修改',
    A: '新增',
    D: '删除',
    R: '重命名',
    C: '复制',
    '??': '未跟踪',
  };
  return map[status] || status || '未知';
}

function statusColor(status: string): string {
  if (status === 'A') return 'green';
  if (status === 'D') return 'red';
  if (status === 'M') return 'blue';
  if (status === 'R') return 'purple';
  return 'default';
}

/** 提交详情抽屉：列表不下发改动明细，打开时按 id 再拉一次完整记录 */
function CommitDrawer({ record, open, onClose }: { record: AiGitCommitItem; open: boolean; onClose: () => void }) {
  const [detail, setDetail] = useState<AiGitCommitItem>(record);
  const [loading, setLoading] = useState(false);
  const [diffModal, setDiffModal] = useState<{ open: boolean; title: string; diff: string; fullscreen: boolean }>({
    open: false,
    title: '',
    diff: '',
    fullscreen: false,
  });

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

  const fileDiffs = (() => {
    try {
      return detail.changedFileDiffs ? (JSON.parse(detail.changedFileDiffs) as Record<string, string>) : null;
    } catch {
      return null;
    }
  })();
  const changedFiles = parseChangedDetail(detail.changedDetail, fileDiffs);

  const openDiff = (file: ChangedFile) => {
    setDiffModal({
      open: true,
      title: `文件改动 · ${file.path}`,
      diff: file.diff || '（暂无该文件 diff 明细）',
      fullscreen: false,
    });
  };

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

      <Card size="small" title="改动文件">
        {changedFiles.length > 0 ? (
          <Table<ChangedFile>
            rowKey="path"
            size="small"
            pagination={false}
            dataSource={changedFiles}
            columns={[
              {
                title: '状态',
                dataIndex: 'status',
                width: 80,
                render: (v: string) => <Tag color={statusColor(v)}>{statusLabel(v)}</Tag>,
              },
              { title: '文件路径', dataIndex: 'path', ellipsis: true },
              {
                title: '操作',
                width: 110,
                render: (_, file) => (
                  <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openDiff(file)}>
                    查看明细
                  </Button>
                ),
              },
            ]}
          />
        ) : (
          <span style={{ color: '#999' }}>无</span>
        )}
      </Card>

      <Modal
        open={diffModal.open}
        title={diffModal.title}
        width={diffModal.fullscreen ? '100vw' : 900}
        styles={
          diffModal.fullscreen
            ? { content: { height: '100vh', maxHeight: '100vh', borderRadius: 0 }, body: { height: 'calc(100vh - 110px)' } }
            : undefined
        }
        style={diffModal.fullscreen ? { top: 0, paddingBottom: 0 } : undefined}
        onCancel={() => setDiffModal((m) => ({ ...m, open: false }))}
        footer={[
          <Button
            key="fullscreen"
            icon={diffModal.fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            onClick={() => setDiffModal((m) => ({ ...m, fullscreen: !m.fullscreen }))}
          >
            {diffModal.fullscreen ? '退出全屏' : '全屏'}
          </Button>,
          <Button key="close" onClick={() => setDiffModal((m) => ({ ...m, open: false }))}>
            关闭
          </Button>,
        ]}
        destroyOnHidden
      >
        <DiffRenderer diff={diffModal.diff} maxHeight={diffModal.fullscreen ? 'calc(100vh - 130px)' : 520} />
      </Modal>
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
