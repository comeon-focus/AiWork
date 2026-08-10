import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined, SyncOutlined } from '@ant-design/icons';
import { dataTaskApi, dataSimApi } from '@/api';
import type { DataSimProjectItem, DataTaskItem, TaskUserItem } from '@/api/types';
import { TASK_STATUS } from '@/api/types';
import { Auth } from '@/components/Auth';
import { TaskInterfaceDrawer } from './TaskInterfaceDrawer';

const STATUS_TEXT: Record<number, string> = {
  [TASK_STATUS.IN_PROGRESS]: '进行中',
  [TASK_STATUS.SUCCESS]: '成功',
  [TASK_STATUS.FAILED]: '失败',
};
const STATUS_COLOR: Record<number, string> = {
  [TASK_STATUS.IN_PROGRESS]: 'blue',
  [TASK_STATUS.SUCCESS]: 'green',
  [TASK_STATUS.FAILED]: 'red',
};

interface FormValues {
  name: string;
  userIds?: number[];
  projectIds: string[];
  interfaceCount: number;
}

export default function DataTaskPage() {
  const [data, setData] = useState<DataTaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<number | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DataTaskItem | null>(null);
  const [form] = Form.useForm<FormValues>();

  const [userOptions, setUserOptions] = useState<TaskUserItem[]>([]);
  const [projectOptions, setProjectOptions] = useState<DataSimProjectItem[]>([]);

  const [statusOpen, setStatusOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<DataTaskItem | null>(null);
  const [statusValue, setStatusValue] = useState<number>(TASK_STATUS.IN_PROGRESS);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentTask, setCurrentTask] = useState<DataTaskItem | null>(null);

  const load = useCallback(
    async (p = page, ps = pageSize, kw = keyword, st = statusFilter) => {
      setLoading(true);
      try {
        const res = await dataTaskApi.list({
          keyword: kw || undefined,
          status: st,
          page: p,
          pageSize: ps,
        });
        setData(res.list);
        setTotal(res.total);
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, keyword, statusFilter],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const loadOptions = useCallback(async () => {
    try {
      const [users, projects] = await Promise.all([dataTaskApi.listUsers(), dataSimApi.list()]);
      setUserOptions(users);
      setProjectOptions(projects);
    } catch {
      /* 选项加载失败不影响主列表 */
    }
  }, []);

  const openModal = async (record?: DataTaskItem) => {
    await loadOptions();
    if (record) {
      setEditing(record);
      form.setFieldsValue({
        name: record.name,
        userIds: record.users.map((u) => u.id),
        projectIds: record.projectIds,
        interfaceCount: record.interfaceCount,
      });
    } else {
      setEditing(null);
      form.resetFields();
    }
    setOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    const payload = {
      name: values.name,
      projectIds: values.projectIds,
      interfaceCount: values.interfaceCount,
      userIds: values.userIds ?? [],
    };
    if (editing) {
      await dataTaskApi.update(editing.id, payload);
    } else {
      await dataTaskApi.create(payload);
    }
    message.success(editing ? '修改成功' : '新增成功');
    setOpen(false);
    void load();
  };

  const remove = async (id: number) => {
    await dataTaskApi.remove(id);
    message.success('删除成功');
    void load();
  };

  const openStatusModal = (record: DataTaskItem) => {
    setStatusTarget(record);
    setStatusValue(record.status);
    setStatusOpen(true);
  };

  const submitStatus = async () => {
    if (!statusTarget) return;
    if (statusValue === TASK_STATUS.SUCCESS && statusTarget.progress < 100) {
      message.warning(`完成度未到 100%（已创建 ${statusTarget.createdCount}/${statusTarget.interfaceCount}），不能改为成功`);
      return;
    }
    await dataTaskApi.changeStatus(statusTarget.id, statusValue);
    message.success('状态已更新');
    setStatusOpen(false);
    void load();
  };

  const sync = async (record: DataTaskItem) => {
    if (!record.projectIds?.length) {
      message.warning('该任务尚未关联任何项目，请先在编辑中关联项目后再同步');
      return;
    }
    const res = await dataTaskApi.sync(record.id);
    message.success(`同步完成：新增 ${res.imported} 条，更新 ${res.updated} 条`);
    void load();
  };

  const openDrawer = (record: DataTaskItem) => {
    setCurrentTask(record);
    setDrawerOpen(true);
  };

  const columns = [
    { title: '任务名称', dataIndex: 'name', width: 180 },
    {
      title: '责任人',
      dataIndex: 'users',
      render: (users: TaskUserItem[]) =>
        users.length ? (
          <Space size={4} wrap>
            {users.map((u) => (
              <Tag key={u.id}>{u.nickname}</Tag>
            ))}
          </Space>
        ) : (
          '-'
        ),
    },
    {
      title: '关联项目',
      dataIndex: 'projectNames',
      width: 200,
      render: (names: string[]) =>
        names?.length ? (
          <Space size={4} wrap>
            {names.map((n, i) => (
              <Tag key={i}>{n}</Tag>
            ))}
          </Space>
        ) : (
          '-'
        ),
    },
    { title: '接口数量', dataIndex: 'interfaceCount', width: 120 },
    {
      title: '完成进度',
      width: 200,
      render: (_: unknown, r: DataTaskItem) => (
        <div>
          <Progress
            percent={r.progress}
            size="small"
            status={r.status === TASK_STATUS.FAILED ? 'exception' : 'active'}
          />
          <span style={{ fontSize: 12, color: '#999' }}>
            已建 {r.createdCount} / 目标 {r.interfaceCount}
          </span>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (v: number) => <Tag color={STATUS_COLOR[v]}>{STATUS_TEXT[v]}</Tag>,
    },
    {
      title: '操作',
      width: 320,
      render: (_: unknown, record: DataTaskItem) => {
        const locked = record.status === TASK_STATUS.SUCCESS;
        return (
          <Space size={4}>
            <Auth perms="vspace:datatask:edit">
              <Button type="link" size="small" onClick={() => openStatusModal(record)}>
                修改状态
              </Button>
            </Auth>
            <Auth perms="vspace:datatask:edit">
              <Popconfirm title="确认同步该任务的接口到关联项目？" onConfirm={() => sync(record)}>
                <Button type="link" size="small" icon={<SyncOutlined />} disabled={locked}>
                  一键同步
                </Button>
              </Popconfirm>
            </Auth>
            <Button type="link" size="small" onClick={() => openDrawer(record)}>
              接口列表
            </Button>
            <Auth perms="vspace:datatask:edit">
              <Button type="link" size="small" disabled={locked} onClick={() => openModal(record)}>
                编辑
              </Button>
            </Auth>
            <Auth perms="vspace:datatask:remove">
              <Popconfirm title="确认删除该任务？" onConfirm={() => remove(record.id)}>
                <Button type="link" size="small" danger disabled={locked}>
                  删除
                </Button>
              </Popconfirm>
            </Auth>
          </Space>
        );
      },
    },
  ];

  return (
    <>
      <Card className="search-bar">
        <Space wrap>
          <Input
            placeholder="任务名称"
            allowClear
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={() => load(1, pageSize)}
            style={{ width: 200 }}
          />
          <Select
            allowClear
            placeholder="状态"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
            options={[
              { label: '全部状态', value: undefined },
              ...Object.values(TASK_STATUS).map((s) => ({ label: STATUS_TEXT[s], value: s })),
            ]}
            style={{ width: 140 }}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={() => load(1, pageSize)}>
            查询
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setKeyword('');
              setStatusFilter(undefined);
              void load(1, pageSize);
            }}
          >
            重置
          </Button>
        </Space>
      </Card>

      <Card
        className="page-card"
        title="数据任务"
        extra={
          <Auth perms="vspace:datatask:add">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
              新增任务
            </Button>
          </Auth>
        }
      >
        <Table<DataTaskItem>
          rowKey="id"
          loading={loading}
          dataSource={data}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
              void load(p, ps);
            },
          }}
          columns={columns}
        />
      </Card>

      <Modal
        open={open}
        width={640}
        title={editing ? '编辑任务' : '新增任务'}
        onCancel={() => setOpen(false)}
        onOk={submit}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="任务名称" rules={[{ required: true, message: '请输入任务名称' }]}>
            <Input placeholder="如：订单中心接口补齐" maxLength={100} />
          </Form.Item>
          <Form.Item name="userIds" label="责任人">
            <Select
              mode="multiple"
              allowClear
              placeholder="选择责任人（可多选）"
              options={userOptions.map((u) => ({ label: u.nickname, value: u.id }))}
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item
            name="projectIds"
            label="关联项目"
            rules={[{ required: true, message: '请至少关联一个项目' }]}
          >
            <Select
              mode="multiple"
              showSearch
              placeholder="选择数据模拟项目（可多选）"
              options={projectOptions.map((p) => ({ label: p.name, value: p.projectId }))}
              optionFilterProp="label"
              maxTagCount="responsive"
            />
          </Form.Item>
          <Form.Item
            name="interfaceCount"
            label="接口数量"
            rules={[{ required: true, message: '请输入接口数量' }]}
          >
            <InputNumber min={1} max={100000} style={{ width: '100%' }} placeholder="目标创建接口数" />
          </Form.Item>
          {editing && (
            <Form.Item label="创建人">
              <Input value={editing.createdBy || '-'} disabled />
            </Form.Item>
          )}
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
          当前任务：<b>{statusTarget?.name}</b>（进度 {statusTarget?.progress}%）
        </div>
        <Select
          style={{ width: '100%' }}
          value={statusValue}
          onChange={(v) => setStatusValue(v)}
          options={[
            { label: '进行中', value: TASK_STATUS.IN_PROGRESS },
            { label: '成功', value: TASK_STATUS.SUCCESS },
            { label: '失败', value: TASK_STATUS.FAILED },
          ]}
        />
        <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
          状态改为「成功」需完成度达到 100%；改为成功后任务将锁定不可再修改。
        </div>
      </Modal>

      <TaskInterfaceDrawer
        task={currentTask}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onChanged={() => load()}
      />
    </>
  );
}
