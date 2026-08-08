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
  Radio,
  Space,
  Switch,
  Table,
  Tag,
  TreeSelect,
  message,
} from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { menuApi } from '@/api';
import type { MenuItem, MenuType } from '@/api/types';
import { Auth } from '@/components/Auth';
import { DynamicIcon } from '@/components/DynamicIcon';
import { tableExpandIcon } from '@/components/TableExpandIcon';

const TYPE_LABEL: Record<MenuType, { text: string; color: string }> = {
  CATALOG: { text: '目录', color: 'blue' },
  MENU: { text: '页面', color: 'green' },
  BUTTON: { text: '按钮', color: 'orange' },
};

interface FormValues {
  parentId: number;
  name: string;
  type: MenuType;
  path?: string;
  component?: string;
  perms?: string;
  icon?: string;
  sort: number;
  visible: boolean;
  status: boolean;
  keepAlive: boolean;
}

/** 按钮节点不能当作父级，所以选择上级时要过滤掉 */
function toParentOptions(list: MenuItem[], excludeId?: number): MenuItem[] {
  return list
    .filter((m) => m.type !== 'BUTTON' && m.id !== excludeId)
    .map((m) => ({ ...m, children: m.children ? toParentOptions(m.children, excludeId) : [] }));
}

export default function MenuPage() {
  const [data, setData] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [form] = Form.useForm<FormValues>();
  const type = Form.useWatch('type', form);

  const load = useCallback(async (name?: string) => {
    setLoading(true);
    try {
      setData(await menuApi.tree(name ? { name } : undefined));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openModal = (record?: MenuItem, parentId?: number) => {
    setEditing(record ?? null);
    form.setFieldsValue(
      record
        ? {
            parentId: record.parentId,
            name: record.name,
            type: record.type,
            path: record.path ?? undefined,
            component: record.component ?? undefined,
            perms: record.perms ?? undefined,
            icon: record.icon ?? undefined,
            sort: record.sort,
            visible: record.visible === 1,
            status: record.status === 1,
            keepAlive: record.keepAlive === 1,
          }
        : {
            parentId: parentId ?? 0,
            name: '',
            type: parentId ? 'MENU' : 'CATALOG',
            sort: 1,
            visible: true,
            status: true,
            keepAlive: false,
          },
    );
    setOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      visible: values.visible ? 1 : 0,
      status: values.status ? 1 : 0,
      keepAlive: values.keepAlive ? 1 : 0,
    };
    if (editing) {
      await menuApi.update(editing.id, payload);
    } else {
      await menuApi.create(payload);
    }
    message.success(editing ? '修改成功' : '新增成功');
    setOpen(false);
    void load(keyword);
  };

  const remove = async (id: number) => {
    await menuApi.remove(id);
    message.success('删除成功');
    void load(keyword);
  };

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="菜单树就是权限清单"
        description="目录/页面节点构成「页面权限」（决定能进哪些页面），按钮节点的权限标识构成「操作权限」（决定能点哪些按钮、能调哪些接口）。新增功能时只需在这里配置一次。"
      />

      <Card className="search-bar">
        <Space wrap>
          <Input
            placeholder="菜单名称"
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
        title="菜单权限管理"
        extra={
          <Auth perms="system:menu:add">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
              新增菜单
            </Button>
          </Auth>
        }
      >
        <Table<MenuItem>
          rowKey="id"
          loading={loading}
          dataSource={data}
          pagination={false}
          expandable={{ defaultExpandAllRows: true, expandIcon: tableExpandIcon }}
          columns={[
            {
              title: '名称',
              dataIndex: 'name',
              onCell: () => ({ className: 'menu-name-cell' }),
              render: (v: string, r) => (
                <Space size={6}>
                  <DynamicIcon name={r.icon} />
                  <span>{v}</span>
                </Space>
              ),
            },
            {
              title: '类型',
              dataIndex: 'type',
              width: 90,
              render: (v: MenuType) => <Tag color={TYPE_LABEL[v].color}>{TYPE_LABEL[v].text}</Tag>,
            },
            { title: '路由地址', dataIndex: 'path', render: (v) => v || '-' },
            { title: '组件路径', dataIndex: 'component', render: (v) => v || '-' },
            {
              title: '权限标识',
              dataIndex: 'perms',
              render: (v: string | null) => (v ? <Tag>{v}</Tag> : '-'),
            },
            { title: '排序', dataIndex: 'sort', width: 70 },
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
                  {record.type !== 'BUTTON' && (
                    <Auth perms="system:menu:add">
                      <Button type="link" size="small" onClick={() => openModal(undefined, record.id)}>
                        新增下级
                      </Button>
                    </Auth>
                  )}
                  <Auth perms="system:menu:edit">
                    <Button type="link" size="small" onClick={() => openModal(record)}>
                      编辑
                    </Button>
                  </Auth>
                  <Auth perms="system:menu:remove">
                    <Popconfirm title="确认删除该节点？" onConfirm={() => remove(record.id)}>
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
        title={editing ? '编辑菜单' : '新增菜单'}
        onCancel={() => setOpen(false)}
        onOk={submit}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="type" label="节点类型" rules={[{ required: true }]}>
            <Radio.Group
              options={[
                { label: '目录', value: 'CATALOG' },
                { label: '页面', value: 'MENU' },
                { label: '按钮', value: 'BUTTON' },
              ]}
              optionType="button"
            />
          </Form.Item>

          <Form.Item name="parentId" label="上级节点">
            <TreeSelect
              treeDefaultExpandAll
              placeholder="不选则为顶级"
              treeData={[
                {
                  id: 0,
                  name: '顶级节点',
                  children: toParentOptions(data, editing?.id),
                } as unknown as MenuItem,
              ]}
              fieldNames={{ label: 'name', value: 'id', children: 'children' }}
            />
          </Form.Item>

          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：用户管理 / 新增用户" />
          </Form.Item>

          {type !== 'BUTTON' && (
            <>
              <Form.Item name="path" label="路由地址" rules={[{ required: true, message: '请输入路由地址' }]}>
                <Input placeholder="如：/system/user" />
              </Form.Item>
              <Form.Item name="icon" label="图标名" tooltip="填写 @ant-design/icons 的组件名，如 UserOutlined">
                <Input placeholder="如：UserOutlined" />
              </Form.Item>
            </>
          )}

          {type === 'MENU' && (
            <Form.Item
              name="component"
              label="组件路径"
              rules={[{ required: true, message: '请输入组件路径' }]}
              tooltip="相对 src/pages，不带扩展名，如 system/user/index"
            >
              <Input placeholder="如：system/user/index" />
            </Form.Item>
          )}

          <Form.Item
            name="perms"
            label="权限标识"
            rules={type === 'BUTTON' ? [{ required: true, message: '按钮必须填写权限标识' }] : []}
            tooltip="后端 requirePerms 校验用的字符串，如 system:user:add"
          >
            <Input placeholder="如：system:user:add" />
          </Form.Item>

          <Space size={32}>
            <Form.Item name="sort" label="排序">
              <InputNumber min={0} />
            </Form.Item>
            {type !== 'BUTTON' && (
              <Form.Item name="visible" label="侧边栏显示" valuePropName="checked">
                <Switch />
              </Form.Item>
            )}
            <Form.Item name="status" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
            {type === 'MENU' && (
              <Form.Item name="keepAlive" label="缓存页面" valuePropName="checked">
                <Switch />
              </Form.Item>
            )}
          </Space>
        </Form>
      </Modal>
    </>
  );
}
