import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Drawer, Form, Input, Modal, Popconfirm, Select, Space, Steps, Table, Tag, Tooltip, message } from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { aiTaskApi, aiSubTaskApi, smartDocApi } from '@/api';
import type {
  AITaskItem,
  AITaskStatus,
  AiSubTaskItem,
  SmartDocItem,
  AicodingStatus,
} from '@/api/types';
import { AI_TASK_STATUS, AI_CODING_STATUS_COLOR } from '@/api/types';
import { Auth } from '@/components/Auth';
import { SessionIdTag } from '@/components/SessionIdTag';

/** AI 任务状态对应 Tag 颜色 */
const AI_TASK_STATUS_COLOR: Record<AITaskStatus, string> = {
  待开始: 'default',
  进行中: 'processing',
  已结束: 'success',
};

/** Coding 状态 Tag：编译失败时 hover 展示失败原因 */
function CodingStatusTag({ status, error }: { status: AicodingStatus; error?: string | null }) {
  const tag = <Tag color={AI_CODING_STATUS_COLOR[status] ?? 'default'}>{status}</Tag>;
  if (status === '编译失败' && error) {
    return <Tooltip title={error}>{tag}</Tooltip>;
  }
  return tag;
}

interface FormValues {
  title: string;
  summary?: string;
  smartDocId?: number | null;
  branch?: string;
  /** 选用的 AI 模型；空字符串表示使用系统默认模型 */
  model?: string;
  status?: AITaskStatus;
}

interface SubFormValues {
  title: string;
  summary?: string;
  smartDocId?: number | null;
  sessionId?: string;
  branch?: string;
  status?: AITaskStatus;
}

/** AI 子任务管理弹窗：在某一 AI 任务下维护子任务，字段与 AI 任务一致 */
function SubTaskModal({
  parent,
  docOptions,
  open,
  onClose,
  onChanged,
}: {
  parent: AITaskItem;
  docOptions: SmartDocItem[];
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [list, setList] = useState<AiSubTaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AiSubTaskItem | null>(null);
  const [viewOnly, setViewOnly] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<AiSubTaskItem | null>(null);
  const [statusValue, setStatusValue] = useState<AITaskStatus>('待开始');
  const [form] = Form.useForm<SubFormValues>();
  /** 父任务已结束时，子任务内容禁止编辑 */
  const locked = parent.status === '已结束';

  const load = useCallback(
    async (next?: { title?: string; page?: number; pageSize?: number }, opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const p = next?.page ?? page;
        const ps = next?.pageSize ?? pageSize;
        const resp = await aiSubTaskApi.list(parent.id, {
          ...(next?.title !== undefined ? { title: next.title } : {}),
          page: p,
          pageSize: ps,
        });
        setList(resp.list);
        setTotal(resp.total);
        setPage(p);
        setPageSize(ps);
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [parent.id, page, pageSize],
  );

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // AICoding 异步进行中：自动轮询子任务列表以反映 编译中 → 暂无/编译成功/编译失败
  const anySubCoding = list.some((s) => s.codingStatus === '编译中') || parent.codingStatus === '编译中';
  useEffect(() => {
    if (!anySubCoding) return;
    // 轮询用静默刷新，避免每 5s 弹出整表 loading
    const t = setInterval(() => void load(undefined, { silent: true }), 5000);
    return () => clearInterval(t);
  }, [anySubCoding, load]);

  const openModal = (record?: AiSubTaskItem, view = false) => {
    setViewOnly(view);
    if (record) {
      setEditing(record);
      form.setFieldsValue({
        title: record.title,
        summary: record.summary ?? undefined,
        smartDocId: record.smartDocId ?? null,
        sessionId: parent.sessionId,
        branch: parent.branch ?? undefined,
        status: record.status,
      });
    } else {
      setEditing(null);
      form.setFieldsValue({
        title: '',
        summary: undefined,
        smartDocId: null,
        sessionId: parent.sessionId,
        branch: parent.branch ?? undefined,
        status: '待开始',
      });
    }
    setModalOpen(true);
  };

  const submit = async () => {
    if (viewOnly) {
      setModalOpen(false);
      return;
    }
    const values = await form.validateFields();
    const payload = {
      parentId: parent.id,
      title: values.title,
      summary: values.summary ?? null,
      sessionId: values.sessionId ?? parent.sessionId ?? null,
      smartDocId: values.smartDocId ?? null,
      branch: values.branch ?? null,
      status: values.status ?? '待开始',
    };
    if (editing) {
      await aiSubTaskApi.update(editing.id, payload);
    } else {
      await aiSubTaskApi.create(payload);
    }
    message.success(editing ? '修改成功' : '新增成功');
    setModalOpen(false);
    void load({ page: 1 });
  };

  const openStatusModal = (record: AiSubTaskItem) => {
    setStatusTarget(record);
    setStatusValue(record.status);
    setStatusOpen(true);
  };

  const submitStatus = async () => {
    if (!statusTarget) return;
    await aiSubTaskApi.updateStatus(statusTarget.id, statusValue);
    message.success('状态已更新');
    setStatusOpen(false);
    void load();
  };

  const remove = async (id: number) => {
    await aiSubTaskApi.remove(id);
    message.success('删除成功');
    void load();
  };

  const startSubAicoding = async (id: number) => {
    await aiSubTaskApi.aicoding(id);
    message.success('AICoding 已启动，正在根据智能文档修改代码');
    void load();
    // 子任务启动后，父任务 codingActive 立即生效：通知父页面刷新列表，使父任务按钮即时置灰
    onChanged?.();
  };

  // 整个任务锁：父任务或任一子任务正在 AICoding；子任务按钮据此禁用
  const taskLocked = parent.codingStatus === '编译中' || list.some((s) => s.codingStatus === '编译中');

  return (
    <>
      <Drawer
        open={open}
        width={960}
        title={`子任务管理 · ${parent.title}`}
        onClose={onClose}
        destroyOnHidden
      >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Space wrap>
          <Input
            placeholder="子任务标题"
            allowClear
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={() => load({ title: keyword, page: 1 })}
            style={{ width: 200 }}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={() => load({ title: keyword, page: 1 })}>
            查询
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setKeyword('');
              void load({ page: 1 });
            }}
          >
            重置
          </Button>
        </Space>
        <Auth perms="orchestration:aiTask:add">
          <Button type="primary" icon={<PlusOutlined />} disabled={locked} onClick={() => openModal()}>
            新增子任务
          </Button>
        </Auth>
      </div>

      <Table<AiSubTaskItem>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={list}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => load({ page: p, pageSize: ps }),
        }}
        columns={[
          { title: '任务标题', dataIndex: 'title', width: 180 },
          {
            title: '关联智能文档',
            dataIndex: 'smartDoc',
            width: 180,
            render: (v: { id: number; title: string } | null | undefined) => (v?.title ? <Tag color="geekblue">{v.title}</Tag> : '-'),
          },
          {
            title: '任务状态',
            dataIndex: 'status',
            width: 120,
            render: (v: AITaskStatus) => <Tag color={AI_TASK_STATUS_COLOR[v] ?? 'default'}>{v}</Tag>,
          },
          {
            title: 'Coding 状态',
            dataIndex: 'codingStatus',
            width: 120,
            render: (v: AicodingStatus, record: AiSubTaskItem) => <CodingStatusTag status={v} error={record.codingError} />,
          },
          { title: '创建人', dataIndex: 'creatorName', width: 100, render: (v: string | null) => v || '-' },
          { title: '创建时间', dataIndex: 'createdAt', width: 170 },
          {
            title: '操作',
            width: 220,
            render: (_, record) => (
              <Space size={4}>
                <Auth perms="orchestration:aiTask:edit">
                  <Button
                    type="link"
                    size="small"
                    disabled={locked || record.codingStatus === '编译中'}
                    onClick={() => openStatusModal(record)}
                  >
                    修改状态
                  </Button>
                </Auth>
                <Auth perms="orchestration:aiTask:edit">
                  <Button
                    type="link"
                    size="small"
                    disabled={locked || record.codingStatus === '编译中'}
                    onClick={() => openModal(record, locked || record.codingStatus === '编译中' || record.status === '已结束')}
                  >
                    {locked || record.codingStatus === '编译中' || record.status === '已结束' ? '查看' : '编辑'}
                  </Button>
                </Auth>
                <Auth perms="orchestration:aiTask:remove">
                  <Popconfirm title="确认删除该子任务？" onConfirm={() => remove(record.id)}>
                    <Button type="link" size="small" danger disabled={locked || record.codingStatus === '编译中'}>
                      删除
                    </Button>
                  </Popconfirm>
                </Auth>
                <Auth perms="orchestration:aiTask:edit">
                  <Popconfirm
                    title="启动 AICoding？将根据关联智能文档在代码库中进行修改"
                    onConfirm={() => startSubAicoding(record.id)}
                  >
                    <Button
                      type="link"
                      size="small"
                      disabled={record.codingStatus === '编译中' || taskLocked || parent.status === '已结束'}
                    >
                      AICoding
                    </Button>
                  </Popconfirm>
                </Auth>
              </Space>
            ),
          },
        ]}
      />
      </Drawer>

      <Modal
        open={modalOpen}
        width={640}
        title={viewOnly ? '查看 AI 子任务' : editing ? '编辑 AI 子任务' : '新增 AI 子任务'}
        onCancel={() => setModalOpen(false)}
        onOk={submit}
        okText={viewOnly ? '关闭' : '保存'}
        destroyOnHidden
        maskClosable={false}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="title" label="任务标题" rules={[{ required: true, message: '请输入任务标题' }]}>
            <Input placeholder="如：子任务-生成接口文档" disabled={viewOnly} />
          </Form.Item>
          <Form.Item name="summary" label="任务摘要" rules={[{ required: true, message: '请输入任务摘要' }]}>
            <Input placeholder="一句话概括任务目标" maxLength={255} disabled={viewOnly} />
          </Form.Item>
          <Form.Item name="smartDocId" label="关联智能文档">
            <Select
              allowClear
              placeholder="可关联一条智能文档"
              showSearch
              disabled={viewOnly}
              optionFilterProp="label"
              options={docOptions.map((d) => ({ label: d.title, value: d.id }))}
            />
          </Form.Item>
          <Form.Item name="sessionId" label="Session ID" extra="自动继承父任务 Session ID，不可修改">
            <Input placeholder="继承自父任务" disabled />
          </Form.Item>
          <Form.Item name="branch" label="代码分支" extra="自动继承父任务代码分支，不可修改">
            <Input placeholder="继承自父任务" maxLength={100} disabled />
          </Form.Item>
          <Form.Item name="status" label="任务状态" rules={[{ required: true, message: '请选择任务状态' }]}>
            <Select options={AI_TASK_STATUS.map((s) => ({ label: s, value: s }))} disabled={viewOnly} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={statusOpen}
        title="修改任务状态"
        onCancel={() => setStatusOpen(false)}
        onOk={submitStatus}
        destroyOnHidden
      >
        <div style={{ marginBottom: 12 }}>
          当前子任务：<b>{statusTarget?.title}</b>
        </div>
        <Select
          style={{ width: '100%' }}
          value={statusValue}
          onChange={(v) => setStatusValue(v)}
          options={AI_TASK_STATUS.map((s) => ({ label: s, value: s }))}
        />
        <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
          状态改为「已结束」后子任务将锁定，不可再修改。
        </div>
      </Modal>
    </>
  );
}

export default function AiTaskPage() {
  const [data, setData] = useState<AITaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [statusFilter, setStatusFilter] = useState<AITaskStatus | undefined>();
  const [docFilter, setDocFilter] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AITaskItem | null>(null);
  const [viewOnly, setViewOnly] = useState(false);
  const [docOptions, setDocOptions] = useState<SmartDocItem[]>([]);
  /** 可选 AI 模型列表（白名单），用于新增/编辑表单的下拉选项 */
  const [modelList, setModelList] = useState<string[]>([]);
  const [subParent, setSubParent] = useState<AITaskItem | null>(null);
  const [subOpen, setSubOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<AITaskItem | null>(null);
  const [statusValue, setStatusValue] = useState<AITaskStatus>('待开始');
  const [form] = Form.useForm<FormValues>();
  /** 创建任务时（拉取代码库 + 切换分支 + 写库）的加载与进度状态 */
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  /** 正在提交代码的任务 id */
  const [committingId, setCommittingId] = useState<number | null>(null);

  const load = useCallback(
    async (next?: { page?: number; pageSize?: number }, opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const p = next?.page ?? page;
        const ps = next?.pageSize ?? pageSize;
        const resp = await aiTaskApi.list({
          ...(keyword ? { title: keyword } : {}),
          ...(sessionId ? { sessionId } : {}),
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(docFilter ? { smartDocId: docFilter } : {}),
          page: p,
          pageSize: ps,
        });
        setData(resp.list);
        setTotal(resp.total);
        setPage(p);
        setPageSize(ps);
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [keyword, sessionId, statusFilter, docFilter, page, pageSize],
  );

  useEffect(() => {
    void load();
    void smartDocApi.list().then(setDocOptions).catch(() => setDocOptions([]));
    void aiTaskApi.models().then((r) => setModelList(r.models)).catch(() => setModelList([]));
  }, [load]);

  // AICoding 异步进行中：自动轮询以反映 编译中 → 暂无/编译成功/编译失败
  const anyParentCoding = data.some((d) => d.codingStatus === '编译中' || d.codingActive);
  useEffect(() => {
    if (!anyParentCoding) return;
    // 轮询用静默刷新，避免每 5s 弹出整表 loading
    const t = setInterval(() => void load(undefined, { silent: true }), 5000);
    return () => clearInterval(t);
  }, [anyParentCoding, load]);

  const openModal = (record?: AITaskItem, view = false) => {
    setViewOnly(view);
    setCreating(false);
    setCreateError(null);
    if (record) {
      setEditing(record);
      form.setFieldsValue({
        title: record.title,
        summary: record.summary ?? undefined,
        smartDocId: record.smartDocId ?? null,
        branch: record.branch ?? undefined,
        model: record.model ?? '',
        status: record.status,
      });
    } else {
      setEditing(null);
      form.setFieldsValue({ title: '', summary: undefined, smartDocId: null, branch: undefined, model: '', status: '待开始' });
    }
    setOpen(true);
  };

  const submit = async () => {
    if (viewOnly) {
      setOpen(false);
      return;
    }
    const values = await form.validateFields();
    const payload = {
      title: values.title,
      summary: values.summary ?? null,
      smartDocId: values.smartDocId ?? null,
      branch: values.branch ?? null,
      model: values.model ? values.model : null,
      status: values.status ?? '待开始',
    };
    if (editing) {
      await aiTaskApi.update(editing.id, payload);
      message.success('修改成功');
      setOpen(false);
      void load();
    } else {
      // 创建任务：拉取代码库 + 切换分支 + 写库，期间锁定表单并实时展示进度
      setCreating(true);
      setCreateError(null);
      try {
        await aiTaskApi.create(payload);
        message.success('创建成功，代码库已拉取并切换至指定分支');
        setOpen(false);
        void load();
      } catch (e) {
        setCreateError((e as Error).message);
      } finally {
        setCreating(false);
      }
    }
  };

  /** 创建进度步骤（拉取代码库 → 切换/创建分支 → 写库）。实时反映当前阶段与失败原因。 */
  const createSteps = (): ('wait' | 'process' | 'finish' | 'error')[] => {
    if (creating) return ['process', 'wait', 'wait'];
    if (createError) {
      if (createError.includes('代码库拉取失败')) return ['error', 'wait', 'wait'];
      if (createError.includes('代码分支切换失败') || createError.includes('远程分支创建失败'))
        return ['finish', 'error', 'wait'];
      return ['finish', 'finish', 'error'];
    }
    return ['finish', 'finish', 'finish'];
  };

  const openStatusModal = (record: AITaskItem) => {
    setStatusTarget(record);
    setStatusValue(record.status);
    setStatusOpen(true);
  };

  const submitStatus = async () => {
    if (!statusTarget) return;
    await aiTaskApi.updateStatus(statusTarget.id, statusValue);
    message.success('状态已更新');
    setStatusOpen(false);
    void load();
  };

  const remove = async (id: number) => {
    await aiTaskApi.remove(id);
    message.success('删除成功');
    void load();
  };

  const startAicoding = async (id: number) => {
    await aiTaskApi.aicoding(id);
    message.success('AICoding 已启动，正在根据智能文档修改代码');
    void load();
  };

  /** 提交代码：commit + push 要走网络，用 id 标记按钮 loading，避免重复点击 */
  const commitCode = async (id: number) => {
    setCommittingId(id);
    try {
      const r = await aiTaskApi.commit(id);
      message.success(`已提交 ${r.changedFiles} 个文件并推送到 ${r.branch}（${r.commitHash}）`);
      void load();
    } finally {
      setCommittingId(null);
    }
  };

  const openSubModal = (record: AITaskItem) => {
    setSubParent(record);
    setSubOpen(true);
  };

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="AI 任务"
        description="智能编排下的任务条目：可关联一条「需求空间 / 智能文档」中的智能文档，并指定对应的代码分支。"
      />

      <Card className="search-bar">
        <Space wrap>
          <Input
            placeholder="任务标题"
            allowClear
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={() => load()}
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
            placeholder="任务状态"
            allowClear
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
            options={AI_TASK_STATUS.map((s) => ({ label: s, value: s }))}
            style={{ width: 140 }}
          />
          <Select
            placeholder="智能文档"
            allowClear
            showSearch
            optionFilterProp="label"
            value={docFilter}
            onChange={(v) => setDocFilter(v)}
            options={docOptions.map((d) => ({ label: d.title, value: d.id }))}
            style={{ width: 200 }}
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
              setDocFilter(undefined);
              void load({ page: 1 });
            }}
          >
            重置
          </Button>
        </Space>
      </Card>

      <Card
        className="page-card"
        title="AI任务列表"
        extra={
          <Auth perms="orchestration:aiTask:add">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
              新增任务
            </Button>
          </Auth>
        }
      >
        <Table<AITaskItem>
          rowKey="id"
          loading={loading}
          dataSource={data}
          scroll={{ x: 1600 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => load({ page: p, pageSize: ps }),
          }}
          columns={[
            { title: '任务标题', dataIndex: 'title', width: 200, fixed: 'left' },
            {
              title: 'Session ID',
              dataIndex: 'sessionId',
              width: 200,
              fixed: 'left',
              render: (v: string) => <SessionIdTag value={v} />,
            },
            {
              title: 'Coding 状态',
              dataIndex: 'codingStatus',
              width: 120,
              fixed: 'left',
              render: (v: AicodingStatus, record: AITaskItem) => <CodingStatusTag status={v} error={record.codingError} />,
            },
            {
              title: '关联智能文档',
              dataIndex: 'smartDoc',
              width: 220,
              render: (v: { id: number; title: string } | null | undefined) => (v?.title ? <Tag color="geekblue">{v.title}</Tag> : '-'),
            },
            { title: '代码分支', dataIndex: 'branch', width: 160, render: (v: string | null) => v || '-' },
            {
              title: 'AI 模型',
              dataIndex: 'model',
              width: 160,
              render: (v: string | null) => (v ? <Tag color="purple">{v}</Tag> : <span style={{ color: '#999' }}>默认模型</span>),
            },
            {
              title: '任务状态',
              dataIndex: 'status',
              width: 120,
              render: (v: AITaskStatus) => <Tag color={AI_TASK_STATUS_COLOR[v] ?? 'default'}>{v}</Tag>,
            },
            { title: '创建人', dataIndex: 'creatorName', width: 120, render: (v: string | null) => v || '-' },
            { title: '创建时间', dataIndex: 'createdAt', width: 180 },
            {
              title: '操作',
              width: 280,
              fixed: 'right',
              render: (_, record) => (
                <div style={{ display: 'flex', flexDirection: 'column', rowGap: 4 }}>
                  <Space size={4} wrap>
                    <Auth perms="orchestration:aiTask:list">
                      <Button type="link" size="small" onClick={() => openSubModal(record)}>
                        子任务
                      </Button>
                    </Auth>
                    <Auth perms="orchestration:aiTask:edit">
                      <Button
                        type="link"
                        size="small"
                        disabled={record.codingStatus === '编译中' || record.codingActive}
                        onClick={() => openStatusModal(record)}
                      >
                        修改状态
                      </Button>
                    </Auth>
                    <Auth perms="orchestration:aiTask:edit">
                      <Button type="link" size="small" onClick={() => openModal(record, record.status === '已结束')}>
                        {record.status === '已结束' ? '查看' : '编辑'}
                      </Button>
                    </Auth>
                  </Space>
                  <Space size={4} wrap>
                    <Auth perms="orchestration:aiTask:remove">
                      <Popconfirm title="确认删除该 AI 任务？" onConfirm={() => remove(record.id)}>
                        <Button type="link" size="small" danger>
                          删除
                        </Button>
                      </Popconfirm>
                    </Auth>
                    <Auth perms="orchestration:aiTask:edit">
                      <Popconfirm
                        title="启动 AICoding？将根据关联智能文档在代码库中进行修改"
                        onConfirm={() => startAicoding(record.id)}
                      >
                        <Button
                          type="link"
                          size="small"
                          disabled={record.codingStatus === '编译中' || record.codingActive || record.status === '已结束'}
                        >
                          AICoding
                        </Button>
                      </Popconfirm>
                    </Auth>
                    <Auth perms="orchestration:aiTask:commit">
                      <Popconfirm
                        title="提交代码"
                        description={`将先提交该任务代码库下的全部改动，再拉取并推送到远端分支「${record.branch || '当前分支'}」`}
                        onConfirm={() => commitCode(record.id)}
                      >
                        <Button
                          type="link"
                          size="small"
                          loading={committingId === record.id}
                          disabled={
                            record.codingStatus === '编译中' ||
                            record.codingActive ||
                            record.status === '已结束' ||
                            !record.hasWorkspace
                          }
                        >
                          提交代码
                        </Button>
                      </Popconfirm>
                    </Auth>
                  </Space>
                </div>
              ),
            },
          ]}
        />
      </Card>

      {subParent && (
        <SubTaskModal
          parent={subParent}
          docOptions={docOptions}
          open={subOpen}
          onClose={() => setSubOpen(false)}
          onChanged={load}
        />
      )}

      <Modal
        open={open}
        width={640}
        title={viewOnly ? '查看 AI 任务' : editing ? '编辑 AI 任务' : '新增 AI 任务'}
        onCancel={() => setOpen(false)}
        onOk={submit}
        okText={viewOnly ? '关闭' : '保存'}
        okButtonProps={{ loading: creating }}
        cancelButtonProps={{ disabled: creating }}
        closable={!creating}
        destroyOnHidden
        maskClosable={false}
      >
        {creating || createError ? (
          <Alert
            type={createError ? 'error' : 'info'}
            showIcon
            style={{ marginBottom: 16 }}
            message={createError ? '创建失败' : '正在创建 AI 任务'}
            description={
              <Steps
                direction="vertical"
                size="small"
                items={[
                  {
                    title: '拉取代码库',
                    status: createSteps()[0],
                    description:
                      createError && createError.includes('代码库拉取失败')
                        ? createError
                        : creating
                          ? '正在克隆关联智能文档指向的代码库…'
                          : '已完成',
                  },
                  {
                    title: '切换代码分支',
                    status: createSteps()[1],
                    description:
                      createError && (createError.includes('代码分支切换失败') || createError.includes('远程分支创建失败'))
                        ? createError
                        : creating
                          ? '等待代码库拉取完成，分支不存在则创建远程分支…'
                          : '已完成',
                  },
                  {
                    title: '写入任务记录',
                    status: createSteps()[2],
                    description: createError && !createError.includes('代码库拉取失败') && !createError.includes('代码分支切换失败') ? createError : creating ? '等待前序步骤完成…' : '已完成',
                  },
                ]}
              />
            }
          />
        ) : null}
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="title" label="任务标题" rules={[{ required: true, message: '请输入任务标题' }]}>
            <Input placeholder="如：登录页扫码登录需求文档生成" disabled={viewOnly || creating} />
          </Form.Item>
          {editing && (
            <Form.Item label="Session ID">
              <Input value={editing.sessionId} disabled />
            </Form.Item>
          )}
          <Form.Item name="summary" label="任务摘要" rules={[{ required: true, message: '请输入任务摘要' }]}>
            <Input placeholder="一句话概括任务目标" maxLength={255} disabled={viewOnly || creating} />
          </Form.Item>
          <Form.Item
            name="smartDocId"
            label="关联智能文档"
            extra={editing ? '编辑任务时不可修改关联智能文档' : undefined}
          >
            <Select
              allowClear
              placeholder="可关联一条智能文档"
              showSearch
              disabled={viewOnly || creating || !!editing}
              optionFilterProp="label"
              options={docOptions.map((d) => ({ label: d.title, value: d.id }))}
            />
          </Form.Item>
          <Form.Item
            name="branch"
            label="代码分支"
            extra={editing ? '编辑任务时不可修改代码分支' : undefined}
          >
            <Input placeholder="如：feature/login-scan" maxLength={100} disabled={viewOnly || creating || !!editing} />
          </Form.Item>
          <Form.Item
            name="model"
            label="AI 模型"
            extra="不选择则使用系统默认模型；所选模型将用于该任务的 AICoding 执行。"
          >
            <Select
              allowClear
              placeholder="默认模型（系统配置）"
              disabled={viewOnly || creating}
              options={[
                { label: '默认模型（系统配置）', value: '' },
                ...modelList.map((m) => ({ label: m, value: m })),
              ]}
            />
          </Form.Item>
          <Form.Item name="status" label="任务状态" rules={[{ required: true, message: '请选择任务状态' }]}>
            <Select options={AI_TASK_STATUS.map((s) => ({ label: s, value: s }))} disabled={viewOnly || creating} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={statusOpen}
        title="修改任务状态"
        onCancel={() => setStatusOpen(false)}
        onOk={submitStatus}
        destroyOnHidden
      >
        <div style={{ marginBottom: 12 }}>
          当前任务：<b>{statusTarget?.title}</b>
        </div>
        <Select
          style={{ width: '100%' }}
          value={statusValue}
          onChange={(v) => setStatusValue(v)}
          options={AI_TASK_STATUS.map((s) => ({ label: s, value: s }))}
        />
        <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
          状态改为「已结束」后任务将锁定，编辑按钮变为查看，且不可再修改。
        </div>
      </Modal>
    </>
  );
}
