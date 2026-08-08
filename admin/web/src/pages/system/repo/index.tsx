import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  message,
} from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { codeRepoApi } from '@/api';
import type { CodeRepoItem } from '@/api/types';
import { Auth } from '@/components/Auth';

interface FormValues {
  name: string;
  address?: string;
  remark?: string;
  sort: number;
  status: boolean;
}

export default function CodeRepoPage() {
  const [data, setData] = useState<CodeRepoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CodeRepoItem | null>(null);
  const [form] = Form.useForm<FormValues>();

  const load = useCallback(async (name?: string) => {
    setLoading(true);
    try {
      setData(await codeRepoApi.list(name ? { name } : undefined));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openModal = (record?: CodeRepoItem) => {
    if (record) {
      setEditing(record);
      form.setFieldsValue({
        name: record.name,
        address: record.address ?? undefined,
        remark: record.remark ?? undefined,
        sort: record.sort,
        status: record.status === 1,
      });
    } else {
      setEditing(null);
      form.setFieldsValue({ name: '', address: undefined, remark: undefined, sort: 1, status: true });
    }
    setOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    const payload = { ...values, status: values.status ? 1 : 0 };
    if (editing) {
      await codeRepoApi.update(editing.id, payload);
    } else {
      await codeRepoApi.create(payload);
    }
    message.success(editing ? '修改成功' : '新增成功');
    setOpen(false);
    void load(keyword);
  };

  const remove = async (id: number) => {
    await codeRepoApi.remove(id);
    message.success('删除成功');
    void load(keyword);
  };

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="代码库是可独立授权的数据资源"
        description="在「角色管理」中像分配菜单权限一样，把指定代码库授权给角色，角色即只能管理被分配到的代码库。菜单权限控制能否进入本页，代码库权限控制能看到哪些库。"
      />

      <Card className="search-bar">
        <Space wrap>
          <Input
            placeholder="代码库名称"
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
        title="代码库管理"
        extra={
          <Auth perms="system:repo:add">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
              新增代码库
            </Button>
          </Auth>
        }
      >
        <Table<CodeRepoItem>
          rowKey="id"
          loading={loading}
          dataSource={data}
          pagination={false}
          columns={[
            { title: '代码库名称', dataIndex: 'name', onCell: () => ({ className: 'repo-name-cell' }) },
            { title: '地址', dataIndex: 'address', render: (v: string | null) => v || '-' },
            { title: '备注', dataIndex: 'remark', width: 300, render: (v: string | null) => v || '-' },
            {
              title: '状态',
              dataIndex: 'status',
              width: 90,
              render: (v: number) => <Tag color={v === 1 ? 'green' : 'red'}>{v === 1 ? '启用' : '停用'}</Tag>,
            },
            {
              title: '操作',
              width: 200,
              render: (_, record) => (
                <Space size={4}>
                  <Auth perms="system:repo:edit">
                    <Button type="link" size="small" onClick={() => openModal(record)}>
                      编辑
                    </Button>
                  </Auth>
                  <Auth perms="system:repo:remove">
                    <Popconfirm title="确认删除该代码库？" onConfirm={() => remove(record.id)}>
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
        width={560}
        title={editing ? '编辑代码库' : '新增代码库'}
        onCancel={() => setOpen(false)}
        onOk={submit}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="代码库名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：前端主仓库" />
          </Form.Item>
          <Form.Item name="address" label="地址">
            <Input placeholder="如：git@git.example.com:frontend/main.git" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="选填" />
          </Form.Item>
          <Space size={32}>
            <Form.Item name="sort" label="排序">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="status" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </>
  );
}
