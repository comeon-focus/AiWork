import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Tree,
  message,
} from 'antd';
import {
  CaretRightOutlined,
  HolderOutlined,
  PauseOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { aiCompileLogApi, taskQueueApi } from '@/api';
import type {
  AiCompileLogItem,
  AiTaskOptionNode,
  TaskQueueItemRow,
  TaskQueueItemStatus,
  TaskQueueRow,
  TaskQueueStatus,
} from '@/api/types';
import {
  TASK_QUEUE_ITEM_STATUS_COLOR,
  TASK_QUEUE_STATUS,
  TASK_QUEUE_STATUS_COLOR,
} from '@/api/types';
import { Auth } from '@/components/Auth';
import { CompileLogDrawer, fmtDuration } from '@/components/CompileLogDrawer';

/** 有队列在执行时的列表自动刷新间隔 */
const LIST_INTERVAL = 5000;
/** 详情抽屉在队列执行中时的刷新间隔，比列表更快以便看到逐项推进 */
const DETAIL_INTERVAL = 3000;

/** 选中的关联任务，key 唯一标识「父任务」或「某个子任务」 */
interface PickedTask {
  key: string;
  taskId: number;
  subTaskId: number | null;
  title: string;
  taskType: '父任务' | '子任务';
  /** 编辑既有队列时带上的条目 id 与执行状态，新增时为空 */
  itemId?: number;
  itemStatus?: TaskQueueItemStatus;
}

const parentKey = (id: number) => `p-${id}`;
const subKey = (parentId: number, id: number) => `s-${parentId}-${id}`;

/* ── 可拖拽排序的任务行 ─────────────────────────── */

function SortableTaskRow({
  item,
  index,
  extra,
  onRemove,
}: {
  item: { key: string; title: string; taskType: '父任务' | '子任务' };
  index: number;
  extra?: React.ReactNode;
  onRemove?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.key,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        // 拖拽中的行浮起来，避免和下方行视觉粘连
        zIndex: isDragging ? 1 : undefined,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        marginBottom: 4,
        border: '1px solid #f0f0f0',
        borderRadius: 4,
        background: isDragging ? '#e6f4ff' : '#fff',
      }}
    >
      <span {...attributes} {...listeners} style={{ cursor: 'grab', color: '#999' }}>
        <HolderOutlined />
      </span>
      <span style={{ width: 24, color: '#999' }}>{index + 1}</span>
      <Tag color={item.taskType === '父任务' ? 'blue' : 'geekblue'}>{item.taskType}</Tag>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.title}
      </span>
      {extra}
      {onRemove && (
        <Button type="link" size="small" danger onClick={onRemove}>
          移除
        </Button>
      )}
    </div>
  );
}

function SortableList({
  items,
  renderExtra,
  onRemove,
  onSort,
}: {
  items: { key: string; title: string; taskType: '父任务' | '子任务' }[];
  renderExtra?: (key: string) => React.ReactNode;
  onRemove?: (key: string) => void;
  onSort: (keys: string[]) => void;
}) {
  // 需要拖动 5px 才判定为拖拽，否则「移除」按钮点不动
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.key === active.id);
    const to = items.findIndex((i) => i.key === over.id);
    if (from < 0 || to < 0) return;
    onSort(arrayMove(items, from, to).map((i) => i.key));
  };

  if (!items.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请从左侧勾选要执行的 AI 任务" />;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={items.map((i) => i.key)} strategy={verticalListSortingStrategy}>
        {items.map((it, idx) => (
          <SortableTaskRow
            key={it.key}
            item={it}
            index={idx}
            extra={renderExtra?.(it.key)}
            onRemove={onRemove ? () => onRemove(it.key) : undefined}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}

/* ── 新增 / 编辑弹窗 ────────────────────────────── */

function QueueFormModal({
  record,
  open,
  onClose,
  onOk,
}: {
  record: TaskQueueRow | null;
  open: boolean;
  onClose: () => void;
  onOk: () => void;
}) {
  const [form] = Form.useForm<{ name: string; remark?: string }>();
  const [options, setOptions] = useState<AiTaskOptionNode[]>([]);
  const [picked, setPicked] = useState<PickedTask[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // 暂停中的队列只允许调整未执行任务的顺序，其余字段全部锁定
  const pausedOnly = record?.status === '暂停中';
  // 已执行的队列只允许改名称/备注
  const nameOnly = record?.status === '已执行';

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({ name: record?.name ?? '', remark: record?.remark ?? '' });
    setLoading(true);
    void (async () => {
      try {
        const opts = await taskQueueApi.taskOptions(record?.id);
        setOptions(opts);
        if (record) {
          // 编辑态：详情接口才带 items 明细
          const d = await taskQueueApi.detail(record.id);
          const items = [...(d.items ?? [])].sort((a, b) => a.orderNum - b.orderNum);
          setPicked(
            items.map((i) => ({
              key: i.subTaskId ? subKey(i.taskId, i.subTaskId) : parentKey(i.taskId),
              taskId: i.taskId,
              subTaskId: i.subTaskId,
              title: i.title,
              taskType: i.taskType,
              itemId: i.id,
              itemStatus: i.status,
            })),
          );
        } else {
          setPicked([]);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [open, record, form]);

  /** 已完成/失败的项顺序已定型，暂停态下不参与重排 */
  const settled = useMemo(
    () => picked.filter((p) => p.itemStatus && p.itemStatus !== '待执行'),
    [picked],
  );
  const pending = useMemo(
    () => picked.filter((p) => !p.itemStatus || p.itemStatus === '待执行'),
    [picked],
  );
  /** 暂停态下只把未执行项交给拖拽列表，已定型项单独只读展示 */
  const sortableItems = pausedOnly ? pending : picked;

  const treeData = useMemo(
    () =>
      options.map((p) => ({
        key: parentKey(p.id),
        title: (
          <Space size={4}>
            <span>{p.title}</span>
            {p.codingStatus === '编译中' && <Tag color="processing">编译中</Tag>}
          </Space>
        ),
        children: (p.children ?? []).map((c) => ({
          key: subKey(p.id, c.id),
          title: (
            <Space size={4}>
              <span>{c.title}</span>
              {c.codingStatus === '编译中' && <Tag color="processing">编译中</Tag>}
            </Space>
          ),
        })),
      })),
    [options],
  );

  /** 勾选变化 → 保留已有顺序，新增的追加到末尾 */
  const onCheck = (keys: React.Key[]) => {
    const keySet = new Set(keys.map(String));
    const kept = picked.filter((p) => keySet.has(p.key));
    const keptSet = new Set(kept.map((p) => p.key));
    const added: PickedTask[] = [];
    for (const p of options) {
      if (keySet.has(parentKey(p.id)) && !keptSet.has(parentKey(p.id))) {
        added.push({ key: parentKey(p.id), taskId: p.id, subTaskId: null, title: p.title, taskType: '父任务' });
      }
      for (const c of p.children ?? []) {
        if (keySet.has(subKey(p.id, c.id)) && !keptSet.has(subKey(p.id, c.id))) {
          added.push({
            key: subKey(p.id, c.id),
            taskId: p.id,
            subTaskId: c.id,
            title: c.title,
            taskType: '子任务',
          });
        }
      }
    }
    setPicked([...kept, ...added]);
  };

  const onSort = (keys: string[]) => {
    const map = new Map(picked.map((p) => [p.key, p]));
    const sorted = keys.map((k) => map.get(k)!).filter(Boolean);
    // 暂停态：已定型项固定在前，重排结果只影响未执行部分
    setPicked(pausedOnly ? [...settled, ...sorted] : sorted);
  };

  const submit = async () => {
    const values = await form.validateFields();
    if (!pausedOnly && !nameOnly && !picked.length) {
      message.warning('请至少关联一个 AI 任务');
      return;
    }
    setSaving(true);
    try {
      if (pausedOnly) {
        // 暂停中：只提交未执行项的新顺序，itemId 来自加载详情时的快照
        const itemIds = pending.map((p) => p.itemId).filter((x): x is number => x != null);
        await taskQueueApi.reorder(record!.id, itemIds);
        message.success('顺序已更新');
      } else {
        const body = {
          name: values.name,
          remark: values.remark || null,
          items: picked.map((p) => ({ taskId: p.taskId, subTaskId: p.subTaskId })),
        };
        if (record) {
          await taskQueueApi.update(record.id, body);
          message.success('修改成功');
        } else {
          await taskQueueApi.create(body);
          message.success('新增成功');
        }
      }
      onOk();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={record ? `编辑任务队列 · ${record.name}` : '新增任务队列'}
      width={900}
      onCancel={onClose}
      onOk={submit}
      confirmLoading={saving}
      destroyOnHidden
    >
      {pausedOnly && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="队列处于暂停中，仅可调整未执行任务的执行顺序，其它内容不可修改"
        />
      )}
      {nameOnly && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="队列已执行完成，仅可修改名称与备注"
        />
      )}
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="队列名称" rules={[{ required: true, message: '请输入队列名称' }]}>
          <Input placeholder="请输入队列名称" maxLength={100} disabled={pausedOnly} />
        </Form.Item>
        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={2} maxLength={255} placeholder="选填" disabled={pausedOnly} />
        </Form.Item>
      </Form>

      <div style={{ display: 'flex', gap: 16 }}>
        <Card
          size="small"
          title="可关联的 AI 任务"
          style={{ flex: 1 }}
          styles={{ body: { maxHeight: 340, overflow: 'auto' } }}
          loading={loading}
        >
          {/* checkStrictly：父子勾选互不联动，子任务是独立的执行单元 */}
          <Tree
            checkable
            checkStrictly
            selectable={false}
            disabled={pausedOnly || nameOnly}
            treeData={treeData}
            checkedKeys={picked.map((p) => p.key)}
            onCheck={(keys) => onCheck(Array.isArray(keys) ? keys : keys.checked)}
          />
        </Card>
        <Card
          size="small"
          title={`执行顺序（${picked.length}）· 可拖动调整`}
          style={{ flex: 1 }}
          styles={{ body: { maxHeight: 340, overflow: 'auto' } }}
        >
          {/* 暂停态下已定型的项只读展示，不进入拖拽区 */}
          {pausedOnly &&
            settled.map((s, i) => (
              <div
                key={s.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  marginBottom: 4,
                  border: '1px solid #f0f0f0',
                  borderRadius: 4,
                  background: '#fafafa',
                  color: '#999',
                }}
              >
                <span style={{ width: 24 }}>{i + 1}</span>
                <Tag color={TASK_QUEUE_ITEM_STATUS_COLOR[s.itemStatus!]}>{s.itemStatus}</Tag>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.title}
                </span>
              </div>
            ))}
          <SortableList
            items={sortableItems}
            onSort={onSort}
            onRemove={
              pausedOnly || nameOnly
                ? undefined
                : (key) => setPicked((prev) => prev.filter((p) => p.key !== key))
            }
          />
        </Card>
      </div>
    </Modal>
  );
}

/* ── 详情抽屉 ───────────────────────────────────── */

function QueueDetailDrawer({
  queueId,
  open,
  onClose,
}: {
  queueId: number;
  open: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<TaskQueueRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<AiCompileLogItem | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await taskQueueApi.detail(queueId));
    } finally {
      setLoading(false);
    }
  }, [queueId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // 执行中时自动刷新，实时反映逐项推进
  const running = data?.status === '执行中';
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!open || !running) return;
    const t = setInterval(() => void loadRef.current(), DETAIL_INTERVAL);
    return () => clearInterval(t);
  }, [open, running]);

  const openLog = async (compileLogId: number) => {
    const detail = await aiCompileLogApi.detail(compileLogId);
    setLog(detail);
    setLogOpen(true);
  };

  const items = useMemo(
    () => [...(data?.items ?? [])].sort((a, b) => a.orderNum - b.orderNum),
    [data],
  );

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        width={1000}
        title={
          <Space>
            <span>队列详情 · {data?.name ?? ''}</span>
            {data && <Tag color={TASK_QUEUE_STATUS_COLOR[data.status]}>{data.status}</Tag>}
            {data?.pauseRequested && <Tag color="warning">暂停中（等待当前任务结束）</Tag>}
          </Space>
        }
        destroyOnHidden
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>
            刷新
          </Button>
        }
      >
        <Descriptions
          size="small"
          column={3}
          bordered
          style={{ marginBottom: 16 }}
          items={[
            { label: '执行进度', children: `${data?.finishedItems ?? 0} / ${data?.totalItems ?? 0}` },
            { label: '成功', children: <Tag color="success">{data?.doneItems ?? 0}</Tag> },
            { label: '失败', children: <Tag color="error">{data?.failedItems ?? 0}</Tag> },
            { label: '创建人', children: data?.creatorName || '-' },
            { label: '开始时间', children: data?.startedAt || '-' },
            { label: '完成时间', children: data?.finishedAt || '-' },
            { label: '备注', span: 3, children: data?.remark || '-' },
          ]}
        />

        <Table<TaskQueueItemRow>
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={items}
          pagination={false}
          columns={[
            { title: '#', width: 50, render: (_, __, i) => i + 1 },
            { title: '任务标题', dataIndex: 'title', ellipsis: true },
            {
              title: '类型',
              dataIndex: 'taskType',
              width: 80,
              render: (v: string) => <Tag color={v === '父任务' ? 'blue' : 'geekblue'}>{v}</Tag>,
            },
            {
              title: '执行状态',
              dataIndex: 'status',
              width: 100,
              render: (v: TaskQueueItemStatus, r) =>
                v === '失败' && r.errorMsg ? (
                  <Tooltip title={r.errorMsg}>
                    <Tag color={TASK_QUEUE_ITEM_STATUS_COLOR[v]}>{v}</Tag>
                  </Tooltip>
                ) : (
                  <Tag color={TASK_QUEUE_ITEM_STATUS_COLOR[v]}>{v}</Tag>
                ),
            },
            {
              title: '耗时',
              width: 90,
              render: (_, r) =>
                r.startedAt && r.finishedAt
                  ? fmtDuration(new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime())
                  : '-',
            },
            { title: '开始时间', dataIndex: 'startedAt', width: 170, render: (v: string | null) => v || '-' },
            {
              title: '操作',
              width: 110,
              render: (_, r) =>
                r.compileLogId ? (
                  <Button type="link" size="small" onClick={() => void openLog(r.compileLogId!)}>
                    编译详情
                  </Button>
                ) : (
                  <span style={{ color: '#999' }}>-</span>
                ),
            },
          ]}
        />
      </Drawer>

      {log && <CompileLogDrawer record={log} open={logOpen} onClose={() => setLogOpen(false)} />}
    </>
  );
}

/* ── 列表页 ─────────────────────────────────────── */

export default function TaskQueuePage() {
  const [data, setData] = useState<TaskQueueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskQueueStatus | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TaskQueueRow | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const load = useCallback(
    async (next?: { page?: number; pageSize?: number }) => {
      setLoading(true);
      try {
        const p = next?.page ?? page;
        const ps = next?.pageSize ?? pageSize;
        const resp = await taskQueueApi.list({
          ...(keyword ? { name: keyword } : {}),
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
    [keyword, statusFilter, page, pageSize],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // 有队列执行中时自动刷新，进度条能跟着走
  const anyRunning = data.some((d) => d.status === '执行中');
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(() => void loadRef.current(), LIST_INTERVAL);
    return () => clearInterval(t);
  }, [anyRunning]);

  const start = async (r: TaskQueueRow) => {
    // 失败原因由 request.ts 统一弹出，这里只需成功后刷新
    await taskQueueApi.start(r.id);
    message.success('队列已开始执行');
    void load();
  };

  const pause = async (r: TaskQueueRow) => {
    await taskQueueApi.pause(r.id);
    message.success('已提交暂停，当前任务完成后队列将暂停');
    void load();
  };

  const remove = async (id: number) => {
    await taskQueueApi.remove(id);
    message.success('删除成功');
    void load();
  };

  const openDetail = (r: TaskQueueRow) => {
    setDetailId(r.id);
    setDetailOpen(true);
  };

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="任务队列"
        description="把多个 AI 任务（含子任务）编成一个队列，点击「一键执行」后按顺序逐个 AICoding。全系统同一时刻只允许一个队列执行；若有任务正在编译中会拒绝启动。执行中的任务失败会记录在详情里并继续执行下一个。"
      />

      <Card className="search-bar">
        <Space wrap>
          <Input
            placeholder="队列名称"
            allowClear
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={() => load({ page: 1 })}
            style={{ width: 200 }}
          />
          <Select
            placeholder="状态"
            allowClear
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
            options={TASK_QUEUE_STATUS.map((s) => ({ label: s, value: s }))}
            style={{ width: 140 }}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={() => load({ page: 1 })}>
            查询
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setKeyword('');
              setStatusFilter(undefined);
              void load({ page: 1 });
            }}
          >
            重置
          </Button>
        </Space>
      </Card>

      <Card
        className="page-card"
        title="任务队列"
        extra={
          <Auth perms="orchestration:taskQueue:add">
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              新增队列
            </Button>
          </Auth>
        }
      >
        <Table<TaskQueueRow>
          rowKey="id"
          loading={loading}
          dataSource={data}
          scroll={{ x: 1220 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => load({ page: p, pageSize: ps }),
          }}
          columns={[
            { title: '队列名称', dataIndex: 'name', width: 200, fixed: 'left', ellipsis: true },
            {
              title: '状态',
              dataIndex: 'status',
              width: 130,
              render: (v: TaskQueueStatus, r) => (
                <Space size={4}>
                  <Tag color={TASK_QUEUE_STATUS_COLOR[v]}>{v}</Tag>
                  {r.pauseRequested && (
                    <Tooltip title="已提交暂停请求，当前任务执行完后暂停">
                      <Tag color="warning">暂停中</Tag>
                    </Tooltip>
                  )}
                </Space>
              ),
            },
            {
              title: '执行进度',
              width: 140,
              // 三行居中：数量 / 进度条 / 百分比
              render: (_, r) => {
                const percent = r.totalItems ? Math.round((r.finishedItems / r.totalItems) * 100) : 0;
                return (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ marginBottom: 2 }}>
                      {r.finishedItems}/{r.totalItems}
                    </div>
                    <Progress
                      percent={percent}
                      size="small"
                      showInfo={false}
                      status={r.failedItems > 0 ? 'exception' : r.status === '执行中' ? 'active' : undefined}
                    />
                    <div style={{ fontSize: 12, color: '#999' }}>{percent}%</div>
                  </div>
                );
              },
            },
            { title: '关联任务数', dataIndex: 'totalItems', width: 110 },
            { title: '创建人', dataIndex: 'creatorName', width: 100, render: (v: string | null) => v || '-' },
            { title: '创建时间', dataIndex: 'createdAt', width: 180 },
            {
              title: '操作',
              width: 360,
              fixed: 'right',
              render: (_, r) => (
                <Space size={4}>
                  <Auth perms="orchestration:taskQueue:execute">
                    <Button
                      type="link"
                      size="small"
                      icon={<CaretRightOutlined />}
                      // 执行中与已执行完成的队列不可再启动；暂停中可从暂停处继续
                      disabled={r.status === '执行中' || r.status === '已执行'}
                      onClick={() => void start(r)}
                    >
                      一键执行
                    </Button>
                  </Auth>
                  <Auth perms="orchestration:taskQueue:execute">
                    <Button
                      type="link"
                      size="small"
                      icon={<PauseOutlined />}
                      // 只有真正执行中且尚未提交过暂停请求时才可点
                      disabled={r.status !== '执行中' || r.pauseRequested}
                      onClick={() => void pause(r)}
                    >
                      暂停
                    </Button>
                  </Auth>
                  <Button type="link" size="small" onClick={() => openDetail(r)}>
                    查看详情
                  </Button>
                  <Auth perms="orchestration:taskQueue:edit">
                    <Button
                      type="link"
                      size="small"
                      disabled={r.status === '执行中'}
                      onClick={() => {
                        setEditing(r);
                        setModalOpen(true);
                      }}
                    >
                      编辑
                    </Button>
                  </Auth>
                  <Auth perms="orchestration:taskQueue:remove">
                    <Popconfirm title="确认删除该任务队列？" onConfirm={() => remove(r.id)}>
                      <Button type="link" size="small" danger disabled={r.status === '执行中'}>
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

      <QueueFormModal
        record={editing}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onOk={() => void load()}
      />

      {detailId != null && (
        <QueueDetailDrawer queueId={detailId} open={detailOpen} onClose={() => setDetailOpen(false)} />
      )}
    </>
  );
}
