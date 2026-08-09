import { useCallback, useEffect, useRef, useState } from 'react';
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
  message,
} from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { aiCompileLogApi } from '@/api';
import type { AiCompileLogItem, AiCompileLogTail, AiCompileStatus } from '@/api/types';
import { AI_COMPILE_STATUS, AI_COMPILE_STATUS_COLOR } from '@/api/types';
import { Auth } from '@/components/Auth';

/** 编译中时的日志轮询间隔，与后端 1s 刷盘配合，最坏可见延迟约 2.5s */
const TAIL_INTERVAL = 1500;
/** 列表在有任务编译中时的自动刷新间隔 */
const LIST_INTERVAL = 5000;

function fmtDuration(ms: number | null) {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`;
}

/** git 实测改动：0 改动高亮成红色，这是「假成功」最直接的信号 */
function ChangedFilesTag({ n }: { n: number | null }) {
  if (n == null) return <span style={{ color: '#999' }}>未校验</span>;
  return <Tag color={n > 0 ? 'green' : 'red'}>{n} 个文件</Tag>;
}

/** 实时日志抽屉：增量拉取，编译结束后自动停止轮询 */
function LogDrawer({ record, open, onClose }: { record: AiCompileLogItem; open: boolean; onClose: () => void }) {
  const [text, setText] = useState('');
  const [tail, setTail] = useState<AiCompileLogTail | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const boxRef = useRef<HTMLPreElement>(null);
  const offsetRef = useRef(0);
  // 用 ref 保存定时器，卸载/结束时能确定性地停掉，避免抽屉关闭后仍在打接口
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aliveRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    aliveRef.current = true;
    offsetRef.current = 0;
    setText('');
    setTail(null);

    // 递归 setTimeout 而非 setInterval：保证上一次请求返回后才发下一次，慢网络下不会堆积
    const poll = async () => {
      if (!aliveRef.current) return;
      try {
        const r = await aiCompileLogApi.tail(record.id, offsetRef.current);
        if (!aliveRef.current) return;
        // reset 表示服务端认为 offset 已失效（记录被替换），必须整体重来
        if (r.reset) {
          setText(r.chunk);
        } else if (r.chunk) {
          setText((prev) => prev + r.chunk);
        }
        offsetRef.current = r.nextOffset;
        setTail(r);
        // 还有积压就立刻续拉，把大段日志一次性追平
        if (r.hasMore) {
          timerRef.current = setTimeout(() => void poll(), 0);
          return;
        }
        if (!r.running) return;
      } catch {
        // 单次失败不终止轮询（错误已由 request.ts 统一提示），下个周期重试
      }
      if (aliveRef.current) timerRef.current = setTimeout(() => void poll(), TAIL_INTERVAL);
    };
    void poll();

    return () => {
      aliveRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [open, record.id]);

  // 贴底：仅在用户没有主动上滚时才自动跟随
  useEffect(() => {
    if (autoScroll && boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [text, autoScroll]);

  const onScroll = () => {
    const el = boxRef.current;
    if (!el) return;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  };

  const status = tail?.status ?? record.status;
  const changedFiles = tail?.changedFiles ?? record.changedFiles;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={1000}
      title={
        <Space>
          <span>编译详情 · {record.title}</span>
          <Tag color={AI_COMPILE_STATUS_COLOR[status]}>{status}</Tag>
        </Space>
      }
      destroyOnHidden
      styles={{ body: { display: 'flex', flexDirection: 'column', gap: 12, height: '100%' } }}
    >
      {status === '编译失败' && (tail?.errorMsg ?? record.errorMsg) && (
        <Alert type="error" showIcon message="失败原因" description={tail?.errorMsg ?? record.errorMsg} />
      )}
      {status === '编译成功' && changedFiles === 0 && (
        <Alert
          type="warning"
          showIcon
          message="本次运行未产生任何代码改动"
          description="codebuddy 返回成功但 git 检测到零改动，请核对智能文档内容是否明确要求了代码修改。"
        />
      )}
      {tail?.truncated && <Alert type="warning" showIcon message="日志超出上限已截断，后续输出未记录" />}

      <Descriptions size="small" column={4} bordered items={[
        { label: 'Session ID', children: <Tag color="purple">{record.sessionId}</Tag> },
        { label: '类型', children: record.taskType },
        { label: '分支', children: record.branch || '-' },
        { label: '模型', children: record.model || '默认' },
        { label: '耗时', children: fmtDuration(tail?.durationMs ?? record.durationMs) },
        { label: '轮次', children: tail?.numTurns ?? record.numTurns ?? '-' },
        { label: 'Token', children: `${tail?.inputTokens ?? record.inputTokens} / ${tail?.outputTokens ?? record.outputTokens}` },
        { label: '工具调用', children: tail?.toolCalls ?? record.toolCalls },
        { label: '改动文件', children: <ChangedFilesTag n={changedFiles} /> },
        { label: '新增提交', children: tail?.commitsAhead ?? record.commitsAhead ?? '-' },
        { label: '日志行数', children: tail?.lineCount ?? record.lineCount },
        { label: '完成时间', children: tail?.finishedAt ?? record.finishedAt ?? '-' },
      ]} />

      {(tail?.changedDetail ?? null) && (
        <Card size="small" title="git 实测改动">
          <pre style={{ margin: 0, maxHeight: 160, overflow: 'auto', fontSize: 12 }}>{tail?.changedDetail}</pre>
        </Card>
      )}

      <div style={{ flex: 1, minHeight: 240, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <b>实时日志{tail?.running ? '（编译中，每 1.5 秒刷新）' : ''}</b>
          {!autoScroll && (
            <Button size="small" onClick={() => setAutoScroll(true)}>
              回到底部
            </Button>
          )}
        </div>
        <pre ref={boxRef} className="compile-log" onScroll={onScroll}>
          {text}
        </pre>
      </div>
    </Drawer>
  );
}

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
              width: 180,
              render: (v: string) => <Tag color="purple">{v}</Tag>,
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

      {detail && <LogDrawer record={detail} open={drawerOpen} onClose={() => setDrawerOpen(false)} />}
    </>
  );
}
