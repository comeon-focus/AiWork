import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { aiCompileLogApi } from '@/api';
import type { AiCompileLogItem, AiCompileStatus } from '@/api/types';
import { AI_COMPILE_STATUS, AI_COMPILE_STATUS_COLOR } from '@/api/types';
import { Auth } from '@/components/Auth';
import { SessionIdTag } from '@/components/SessionIdTag';
import { ChangedFilesTag, CompileLogDrawer, fmtDuration } from '@/components/CompileLogDrawer';

/** 列表在有任务编译中时的自动刷新间隔 */
const LIST_INTERVAL = 5000;

export default function CompileLogPage() {
  const [data, setData] = useState<AiCompileLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [statusFilter, setStatusFilter] = useState<AiCompileStatus | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [detail, setDetail] = useState<AiCompileLogItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = useCallback(
    async (next?: { page?: number; pageSize?: number }) => {
      setLoading(true);
      try {
        const p = next?.page ?? page;
        const ps = next?.pageSize ?? pageSize;
        const resp = await aiCompileLogApi.list({
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

  // 有记录处于编译中时自动刷新列表，反映 编译中 → 编译成功/编译失败
  const anyRunning = data.some((d) => d.status === '编译中');
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(() => void loadRef.current(), LIST_INTERVAL);
    return () => clearInterval(t);
  }, [anyRunning]);

  const remove = async (id: number) => {
    await aiCompileLogApi.remove(id);
    message.success('删除成功');
    void load();
  };

  const openDetail = (record: AiCompileLogItem) => {
    setDetail(record);
    setDrawerOpen(true);
  };

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="编译详情"
        description="每次点击 AICoding 生成一条记录，通过 Session ID 与 AI 任务关联，标题同任务标题。可查看实时编译日志与 git 实测代码改动。任务删除后记录保留，作为历史审计。"
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
            placeholder="编译状态"
            allowClear
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
            options={AI_COMPILE_STATUS.map((s) => ({ label: s, value: s }))}
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

      <Card className="page-card" title="编译记录">
        <Table<AiCompileLogItem>
          rowKey="id"
          loading={loading}
          dataSource={data}
          scroll={{ x: 1500 }}
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
            { title: '类型', dataIndex: 'taskType', width: 90 },
            {
              title: '编译状态',
              dataIndex: 'status',
              width: 110,
              render: (v: AiCompileStatus, record) =>
                v === '编译失败' && record.errorMsg ? (
                  <Tooltip title={record.errorMsg}>
                    <Tag color={AI_COMPILE_STATUS_COLOR[v]}>{v}</Tag>
                  </Tooltip>
                ) : (
                  <Tag color={AI_COMPILE_STATUS_COLOR[v]}>{v}</Tag>
                ),
            },
            {
              title: '改动文件',
              dataIndex: 'changedFiles',
              width: 110,
              render: (v: number | null) => <ChangedFilesTag n={v} />,
            },
            { title: '耗时', dataIndex: 'durationMs', width: 90, render: (v: number | null) => fmtDuration(v) },
            {
              title: 'Token(入/出)',
              width: 130,
              render: (_, r) => `${r.inputTokens} / ${r.outputTokens}`,
            },
            { title: '分支', dataIndex: 'branch', width: 140, render: (v: string | null) => v || '-' },
            { title: '触发人', dataIndex: 'creatorName', width: 100, render: (v: string | null) => v || '-' },
            { title: '开始时间', dataIndex: 'startedAt', width: 180, render: (v: string | null) => v || '-' },
            {
              title: '操作',
              width: 150,
              fixed: 'right',
              render: (_, record) => (
                <Space size={4}>
                  <Auth perms="orchestration:compileLog:list">
                    <Button type="link" size="small" onClick={() => openDetail(record)}>
                      查看详情
                    </Button>
                  </Auth>
                  <Auth perms="orchestration:compileLog:remove">
                    <Popconfirm title="确认删除该编译记录？" onConfirm={() => remove(record.id)}>
                      <Button type="link" size="small" danger disabled={record.status === '编译中'}>
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

      {detail && <CompileLogDrawer record={detail} open={drawerOpen} onClose={() => setDrawerOpen(false)} />}
    </>
  );
}
