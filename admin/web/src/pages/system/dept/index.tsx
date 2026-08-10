import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  TreeSelect,
  message,
} from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { deptApi, userApi } from '@/api';
import type { DeptItem, UserOption } from '@/api/types';
import { Auth } from '@/components/Auth';
import { tableExpandIcon } from '@/components/TableExpandIcon';

interface FormValues {
  parentId: number;
  name: string;
  orderNum: number;
  leader?: string;
  phone?: string;
  status: boolean;
}

/** 给 TreeSelect 用的选项，编辑时需要排除自己及子孙，避免把部门挂到自己下面 */
function toTreeSelectData(list: DeptItem[], excludeId?: number): DeptItem[] {
  return list
    .filter((item) => item.id !== excludeId)
    .map((item) => ({ ...item, children: item.children ? toTreeSelectData(item.children, excludeId) : [] }));
}

export default function DeptPage() {
  const [data, setData] = useState<DeptItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DeptItem | null>(null);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [form] = Form.useForm<FormValues>();

  const load = useCallback(async (name?: string) => {
    setLoading(true);
    try {
      setData(await deptApi.tree(name ? { name } : undefined));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void userApi.options().then(setUserOptions).catch(() => setUserOptions([]));
  }, [load]);

  const openModal = (record?: DeptItem, parentId?: number) => {
    setEditing(record ?? null);
    form.setFieldsValue(
      record
        ? {
            parentId: record.parentId,
            name: record.name,
            orderNum: record.orderNum,
            leader: record.leader ?? undefined,
            phone: record.phone ?? undefined,
            status: record.status === 1,
          }
        : { parentId: parentId ?? 0, name: '', orderNum: 1, leader: undefined, phone: undefined, status: true },
    );
    setOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    const payload = { ...values, status: values.status ? 1 : 0 };
    if (editing) {
      await deptApi.update(editing.id, payload);
    } else {
      await deptApi.create(payload);
    }
    message.success(editing ? '修改成功' : '新增成功');
    setOpen(false);
    void load(keyword);
  };

  const remove = async (id: number) => {
    await deptApi.remove(id);
    message.success('删除成功');
    void load(keyword);
  };

  return (
    <>
      <Card className="search-bar" styles={{ body: { paddingBottom: 16 } }}>
        <Space wrap>
          <Input
            placeholder="组织名称"
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
        title="组织架构"
        extra={
          <Auth perms="system:dept:add">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
              新增组织
            </Button>
          </Auth>
        }
      >
        <Table<DeptItem>
          rowKey="id"
          loading={loading}
          dataSource={data}
          pagination={false}
          expandable={{ defaultExpandAllRows: true, expandIcon: tableExpandIcon }}
          columns={[
            { title: '组织名称', dataIndex: 'name' },
            { title: '负责人', dataIndex: 'leader', render: (v) => v || '-' },
            { title: '电话', dataIndex: 'phone', render: (v) => v || '-' },
            { title: '排序', dataIndex: 'orderNum', width: 80 },
            {
              title: '状态',
              dataIndex: 'status',
              width: 90,
              render: (v: number) => <Tag color={v === 1 ? 'green' : 'red'}>{v === 1 ? '启用' : '停用'}</Tag>,
            },
            {
              title: '操作',
              width: 220,
              render: (_, record) => (
                <Space size={4}>
                  <Auth perms="system:dept:add">
                    <Button type="link" size="small" onClick={() => openModal(undefined, record.id)}>
                      新增下级
                    </Button>
                  </Auth>
                  <Auth perms="system:dept:edit">
                    <Button type="link" size="small" onClick={() => openModal(record)}>
                      编辑
                    </Button>
                  </Auth>
                  <Auth perms="system:dept:remove">
                    <Popconfirm title="确认删除该组织？" onConfirm={() => remove(record.id)}>
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
        title={editing ? '编辑组织' : '新增组织'}
        onCancel={() => setOpen(false)}
        onOk={submit}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="parentId" label="上级组织">
            <TreeSelect
              allowClear
              treeDefaultExpandAll
              placeholder="不选则为顶级组织"
              treeData={[
                { id: 0, parentId: -1, name: '顶级组织', ancestors: '', orderNum: 0, leader: null, phone: null, status: 1, children: toTreeSelectData(data, editing?.id) } as DeptItem,
              ]}
              fieldNames={{ label: 'name', value: 'id', children: 'children' }}
            />
          </Form.Item>
          <Form.Item name="name" label="组织名称" rules={[{ required: true, message: '请输入组织名称' }]}>
            <Input placeholder="请输入组织名称" />
          </Form.Item>
          <Form.Item name="leader" label="负责人">
            <Select
              allowClear
              showSearch
              placeholder="请从用户管理列表中选取"
              optionFilterProp="label"
              options={userOptions.map((u) => ({
                value: u.nickname,
                label: u.nickname ? `${u.nickname}（${u.username}）` : u.username,
              }))}
            />
          </Form.Item>
          <Form.Item name="phone" label="联系电话">
            <Input placeholder="请输入联系电话" />
          </Form.Item>
          <Form.Item name="orderNum" label="排序">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="status" label="状态" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
