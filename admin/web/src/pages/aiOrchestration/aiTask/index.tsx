import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Drawer, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, message } from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { aiTaskApi, aiSubTaskApi, smartDocApi } from '@/api';
import type {
  AITaskItem,
  AITaskStatus,
  AiSubTaskItem,
  SmartDocItem,
} from '@/api/types';
import { AI_TASK_STATUS } from '@/api/types';
import { Auth } from '@/components/Auth';

interface FormValues {
  title: string;
  summary?: string;
  smartDocId?: number | null;
  branch?: string;
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
}: {
  parent: AITaskItem;
  docOptions: SmartDocItem[];
  open: boolean;
  onClose: () => void;
}) {
  const [list, setList] = useState<AiSubTaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AiSubTaskItem | null>(null);
  const [viewOnly, setViewOnly] = useState(false);
  const [form] = Form.useForm<SubFormValues>();
  /** 父任务已结束时，子任务内容禁止编辑 */
  const locked = parent.status === '已结束';

  const load = useCallback(async (title?: string) => {
    setLoading(true);
    try {
      setList(await aiSubTaskApi.list(parent.id, title ? { title } : undefined));
    } finally {
      setLoading(false);
    }
  }, [parent.id]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

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
    void load(keyword);
  };

  const changeStatus = async (id: number, status: AITaskStatus) => {
    await aiSubTaskApi.updateStatus(id, status);
    message.success('状态已更新');
    void load(keyword);
  };

  const remove = async (id: number) => {
    await aiSubTaskApi.remove(id);
    message.success('删除成功');
    void load(keyword);
  };

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
            onPressEnter={() => load(keyword)}
            style={{ width: 200 }}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={() => load(keyword)}>
            查询
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setKeyword('');
              void load();
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
        pagination={false}
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
            width: 140,
            render: (v: AITaskStatus, record) => (
              <Select<AITaskStatus>
                size="small"
                value={v}
                disabled={locked}
                style={{ width: '100%' }}
                options={AI_TASK_STATUS.map((s) => ({ label: s, value: s }))}
                onChange={(status) => changeStatus(record.id, status)}
              />
            ),
          },
          { title: '创建人', dataIndex: 'creatorName', width: 100, render: (v: string | null) => v || '-' },
          { title: '创建时间', dataIndex: 'createdAt', width: 170 },
          {
            title: '操作',
            width: 150,
            render: (_, record) => (
              <Space size={4}>
                <Auth perms="orchestration:aiTask:edit">
                  <Button
                    type="link"
                    size="small"
                    onClick={() => openModal(record, locked || record.status === '已结束')}
                  >
                    {locked || record.status === '已结束' ? '查看' : '编辑'}
                  </Button>
                </Auth>
                <Auth perms="orchestration:aiTask:remove">
                  <Popconfirm title="确认删除该子任务？" onConfirm={() => remove(record.id)}>
                    <Button type="link" size="small" danger disabled={locked}>
                      删除
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
    </>
  );
}

export default function AiTaskPage() {
  const [data, setData] = useState<AITaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AITaskItem | null>(null);
  const [viewOnly, setViewOnly] = useState(false);
  const [docOptions, setDocOptions] = useState<SmartDocItem[]>([]);
  const [subParent, setSubParent] = useState<AITaskItem | null>(null);
  const [subOpen, setSubOpen] = useState(false);
  const [form] = Form.useForm<FormValues>();

  const load = useCallback(async (title?: string) => {
    setLoading(true);
    try {
      setData(await aiTaskApi.list(title ? { title } : undefined));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void smartDocApi.list().then(setDocOptions).catch(() => setDocOptions([]));
  }, [load]);

  const openModal = (record?: AITaskItem, view = false) => {
    setViewOnly(view);
    if (record) {
      setEditing(record);
      form.setFieldsValue({
        title: record.title,
        summary: record.summary ?? undefined,
        smartDocId: record.smartDocId ?? null,
        branch: record.branch ?? undefined,
        status: record.status,
      });
    } else {
      setEditing(null);
      form.setFieldsValue({ title: '', summary: undefined, smartDocId: null, branch: undefined, status: '待开始' });
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
      status: values.status ?? '待开始',
    };
    if (editing) {
      await aiTaskApi.update(editing.id, payload);
    } else {
      await aiTaskApi.create(payload);
    }
    message.success(editing ? '修改成功' : '新增成功');
    setOpen(false);
    void load(keyword);
  };

  const changeStatus = async (id: number, status: AITaskStatus) => {
    await aiTaskApi.updateStatus(id, status);
    message.success('状态已更新');
    void load(keyword);
  };

  const remove = async (id: number) => {
    await aiTaskApi.remove(id);
    message.success('删除成功');
    void load(keyword);
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
            onPressEnter={() => load(keyword)}
            style={{ width: 200 }}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={() => load(keyword)}>
            查询
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setKeyword('');
              void load();
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
          pagination={false}
          columns={[
            { title: '任务标题', dataIndex: 'title', width: 200 },
            {
              title: 'Session ID',
              dataIndex: 'sessionId',
              width: 180,
              render: (v: string) => <Tag color="purple">{v}</Tag>,
            },
            {
              title: '关联智能文档',
              dataIndex: 'smartDoc',
              width: 220,
              render: (v: { id: number; title: string } | null | undefined) => (v?.title ? <Tag color="geekblue">{v.title}</Tag> : '-'),
            },
            { title: '代码分支', dataIndex: 'branch', width: 160, render: (v: string | null) => v || '-' },
            {
              title: '任务状态',
              dataIndex: 'status',
              width: 160,
              render: (v: AITaskStatus, record) => (
                <Select<AITaskStatus>
                  size="small"
                  value={v}
                  style={{ width: '100%' }}
                  options={AI_TASK_STATUS.map((s) => ({ label: s, value: s }))}
                  onChange={(status) => changeStatus(record.id, status)}
                />
              ),
            },
            { title: '创建人', dataIndex: 'creatorName', width: 120, render: (v: string | null) => v || '-' },
            { title: '创建时间', dataIndex: 'createdAt', width: 180 },
            {
              title: '操作',
              width: 230,
              render: (_, record) => (
                <Space size={4}>
                  <Auth perms="orchestration:aiTask:list">
                    <Button type="link" size="small" onClick={() => openSubModal(record)}>
                      子任务
                    </Button>
                  </Auth>
                  <Auth perms="orchestration:aiTask:edit">
                    <Button type="link" size="small" onClick={() => openModal(record, record.status === '已结束')}>
                      {record.status === '已结束' ? '查看' : '编辑'}
                    </Button>
                  </Auth>
                  <Auth perms="orchestration:aiTask:remove">
                    <Popconfirm title="确认删除该 AI 任务？" onConfirm={() => remove(record.id)}>
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

      {subParent && (
        <SubTaskModal
          parent={subParent}
          docOptions={docOptions}
          open={subOpen}
          onClose={() => setSubOpen(false)}
        />
      )}

      <Modal
        open={open}
        width={640}
        title={viewOnly ? '查看 AI 任务' : editing ? '编辑 AI 任务' : '新增 AI 任务'}
        onCancel={() => setOpen(false)}
        onOk={submit}
        okText={viewOnly ? '关闭' : '保存'}
        destroyOnHidden
        maskClosable={false}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="title" label="任务标题" rules={[{ required: true, message: '请输入任务标题' }]}>
            <Input placeholder="如：登录页扫码登录需求文档生成" disabled={viewOnly} />
          </Form.Item>
          {editing && (
            <Form.Item label="Session ID">
              <Input value={editing.sessionId} disabled />
            </Form.Item>
          )}
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
          <Form.Item name="branch" label="代码分支">
            <Input placeholder="如：feature/login-scan" maxLength={100} disabled={viewOnly} />
          </Form.Item>
          <Form.Item name="status" label="任务状态" rules={[{ required: true, message: '请选择任务状态' }]}>
            <Select options={AI_TASK_STATUS.map((s) => ({ label: s, value: s }))} disabled={viewOnly} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
