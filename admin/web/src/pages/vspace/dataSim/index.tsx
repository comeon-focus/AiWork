import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  message,
} from 'antd';
import { CopyOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { dataSimApi } from '@/api';
import type { DataSimProjectItem } from '@/api/types';
import { Auth } from '@/components/Auth';
import { InterfaceDrawer } from './InterfaceDrawer';

interface FormValues {
  name: string;
}

export default function DataSimPage() {
  const [data, setData] = useState<DataSimProjectItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DataSimProjectItem | null>(null);
  const [detail, setDetail] = useState<DataSimProjectItem | null>(null);
  const [interfaceProject, setInterfaceProject] = useState<DataSimProjectItem | null>(null);
  const [interfaceOpen, setInterfaceOpen] = useState(false);
  const [form] = Form.useForm<FormValues>();

  const load = useCallback(async (name?: string) => {
    setLoading(true);
    try {
      setData(await dataSimApi.list(name ? { name } : undefined));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openModal = (record?: DataSimProjectItem) => {
    if (record) {
      setEditing(record);
      form.setFieldsValue({ name: record.name });
    } else {
      setEditing(null);
      form.setFieldsValue({ name: '' });
    }
    setOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    if (editing) {
      await dataSimApi.update(editing.id, { name: values.name });
    } else {
      await dataSimApi.create({ name: values.name });
    }
    message.success(editing ? '修改成功' : '新增成功');
    setOpen(false);
    void load(keyword);
  };

  const remove = async (id: number) => {
    await dataSimApi.remove(id);
    message.success('删除成功');
    void load(keyword);
  };

  const copyProjectId = async (projectId: string) => {
    try {
      await navigator.clipboard.writeText(projectId);
      message.success('已复制项目ID');
    } catch {
      message.error('复制失败，请手动复制');
    }
  };

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="数据模拟"
        description="虚拟空间下的项目列表。projectId 由系统创建时自动生成唯一值，不可编辑；创建人 / 更新人由当前账号自动记录。"
      />

      <Card className="search-bar">
        <Space wrap>
          <Input
            placeholder="项目名称"
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
        title="项目列表"
        extra={
          <Auth perms="vspace:datasim:add">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
              新增项目
            </Button>
          </Auth>
        }
      >
        <Table<DataSimProjectItem>
          rowKey="id"
          loading={loading}
          dataSource={data}
          pagination={{
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            defaultPageSize: 10,
          }}
          columns={[
            { title: '项目名称', dataIndex: 'name', width: 250 },
            {
              title: '项目ID',
              dataIndex: 'projectId',
              width: 240,
              render: (v: string) => (
                <Space size={4}>
                  <span style={{ fontFamily: 'monospace' }}>{v}</span>
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => copyProjectId(v)}
                    title="复制项目ID"
                  />
                </Space>
              ),
            },
            { title: '创建人', dataIndex: 'createdBy', width: 120, render: (v: string | null) => v || '-' },
            { title: '更新人', dataIndex: 'updatedBy', width: 120, render: (v: string | null) => v || '-' },
            {
              title: '操作',
              width: 260,
              render: (_, record) => (
                <Space size={4}>
                  <Button type="link" size="small" onClick={() => { setInterfaceProject(record); setInterfaceOpen(true); }}>
                    接口列表
                  </Button>
                  <Button type="link" size="small" onClick={() => setDetail(record)}>
                    查看详情
                  </Button>
                  <Auth perms="vspace:datasim:edit">
                    <Button type="link" size="small" onClick={() => openModal(record)}>
                      编辑
                    </Button>
                  </Auth>
                  <Auth perms="vspace:datasim:remove">
                    <Popconfirm title="确认删除该项目？" onConfirm={() => remove(record.id)}>
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

      <Modal
        open={open}
        width={640}
        title={editing ? '编辑项目' : '新增项目'}
        onCancel={() => setOpen(false)}
        onOk={submit}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="项目ID" tooltip="由系统创建时自动生成，不可编辑">
            <Input value={editing?.projectId} disabled placeholder="保存后自动生成" style={{ fontFamily: 'monospace' }} />
          </Form.Item>
          <Form.Item name="name" label="项目名称" rules={[{ required: true, message: '请输入项目名称' }]}>
            <Input placeholder="如：用户中心压测场景" maxLength={100} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title="项目详情"
        width={480}
        open={detail !== null}
        onClose={() => setDetail(null)}
      >
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="项目名称">{detail?.name}</Descriptions.Item>
          <Descriptions.Item label="项目ID">
            <Space size={4}>
              <span style={{ fontFamily: 'monospace' }}>{detail?.projectId}</span>
              <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => detail && copyProjectId(detail.projectId)} title="复制项目ID" />
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="创建人">{detail?.createdBy || '-'}</Descriptions.Item>
          <Descriptions.Item label="更新人">{detail?.updatedBy || '-'}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{detail?.createdAt}</Descriptions.Item>
          <Descriptions.Item label="更新时间">{detail?.updatedAt}</Descriptions.Item>
        </Descriptions>
      </Drawer>

      <InterfaceDrawer project={interfaceProject} open={interfaceOpen} onClose={() => setInterfaceOpen(false)} />
    </>
  );
}
