import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tree,
  message,
} from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { deptApi, roleApi, userApi, type UserQuery } from '@/api';
import type { DeptItem, RoleItem, UserItem } from '@/api/types';
import { Auth } from '@/components/Auth';
import { useAuthStore } from '@/store/useAuthStore';

interface FormValues {
  username: string;
  password?: string;
  nickname: string;
  deptId?: number;
  email?: string;
  phone?: string;
  gender: number;
  status: boolean;
  remark?: string;
  roleIds: number[];
}

export default function UserPage() {
  const [rows, setRows] = useState<UserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState<UserQuery>({ page: 1, pageSize: 10 });
  const [loading, setLoading] = useState(false);

  const [deptTree, setDeptTree] = useState<DeptItem[]>([]);
  const [roles, setRoles] = useState<Pick<RoleItem, 'id' | 'name' | 'roleKey'>[]>([]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserItem | null>(null);
  const [form] = Form.useForm<FormValues>();

  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwdTarget, setPwdTarget] = useState<UserItem | null>(null);
  const [pwdForm] = Form.useForm<{ password: string }>();

  const currentUser = useAuthStore((s) => s.user);

  const load = useCallback(async (q: UserQuery) => {
    setLoading(true);
    try {
      const res = await userApi.list(q);
      setRows(res.list);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(query);
  }, [load, query]);

  useEffect(() => {
    void (async () => {
      const [depts, roleList] = await Promise.all([deptApi.tree(), roleApi.all()]);
      setDeptTree(depts);
      setRoles(roleList);
    })();
  }, []);

  const openModal = async (record?: UserItem) => {
    if (record) {
      const detail = await userApi.detail(record.id);
      setEditing(detail);
      form.setFieldsValue({
        username: detail.username,
        nickname: detail.nickname,
        deptId: detail.deptId ?? undefined,
        email: detail.email ?? undefined,
        phone: detail.phone ?? undefined,
        gender: detail.gender,
        status: detail.status === 1,
        remark: detail.remark ?? undefined,
        roleIds: detail.roleIds ?? [],
      });
    } else {
      setEditing(null);
      form.setFieldsValue({
        username: '',
        password: '',
        nickname: '',
        deptId: undefined,
        email: undefined,
        phone: undefined,
        gender: 0,
        status: true,
        remark: undefined,
        roleIds: [],
      });
    }
    setOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    const payload = { ...values, status: values.status ? 1 : 0 };
    if (editing) {
      await userApi.update(editing.id, payload);
    } else {
      await userApi.create(payload as typeof payload & { password: string });
    }
    message.success(editing ? '修改成功' : '新增成功');
    setOpen(false);
    void load(query);
  };

  const remove = async (id: number) => {
    await userApi.remove(id);
    message.success('删除成功');
    void load(query);
  };

  const submitPwd = async () => {
    const { password } = await pwdForm.validateFields();
    await userApi.resetPassword(pwdTarget!.id, password);
    message.success('密码已重置，该用户需重新登录');
    setPwdOpen(false);
  };

  return (
    <>
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="这份列表已被数据权限过滤"
        description={`你是 ${currentUser?.nickname}。后端按你所属角色的数据范围在 SQL 层注入了过滤条件，换个账号登录看到的行数会不同。直接按 id 请求详情同样受限，不存在越权入口。`}
      />

      <Row gutter={16}>
        <Col xs={24} md={6}>
          <Card className="page-card" title="部门" style={{ marginBottom: 16 }}>
            <Tree
              defaultExpandAll
              treeData={deptTree as unknown as never}
              fieldNames={{ title: 'name', key: 'id', children: 'children' }}
              onSelect={(keys) =>
                setQuery((q) => ({ ...q, deptId: keys[0] as number | undefined, page: 1 }))
              }
            />
            <Button
              size="small"
              style={{ marginTop: 12 }}
              onClick={() => setQuery((q) => ({ ...q, deptId: undefined, page: 1 }))}
            >
              清除部门筛选
            </Button>
          </Card>
        </Col>

        <Col xs={24} md={18}>
          <Card className="search-bar">
            <Space wrap>
              <Input
                placeholder="账号"
                allowClear
                style={{ width: 160 }}
                onChange={(e) => setQuery((q) => ({ ...q, username: e.target.value || undefined }))}
                onPressEnter={() => setQuery((q) => ({ ...q, page: 1 }))}
              />
              <Input
                placeholder="昵称"
                allowClear
                style={{ width: 160 }}
                onChange={(e) => setQuery((q) => ({ ...q, nickname: e.target.value || undefined }))}
                onPressEnter={() => setQuery((q) => ({ ...q, page: 1 }))}
              />
              <Select
                placeholder="状态"
                allowClear
                style={{ width: 120 }}
                options={[
                  { label: '启用', value: 1 },
                  { label: '停用', value: 0 },
                ]}
                onChange={(v) => setQuery((q) => ({ ...q, status: v, page: 1 }))}
              />
              <Button type="primary" icon={<SearchOutlined />} onClick={() => setQuery((q) => ({ ...q, page: 1 }))}>
                查询
              </Button>
              <Button icon={<ReloadOutlined />} onClick={() => setQuery({ page: 1, pageSize: 10 })}>
                重置
              </Button>
            </Space>
          </Card>

          <Card
            className="page-card"
            title={`用户管理（当前可见 ${total} 人）`}
            extra={
              <Auth perms="system:user:add">
                <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
                  新增用户
                </Button>
              </Auth>
            }
          >
            <Table<UserItem>
              rowKey="id"
              loading={loading}
              dataSource={rows}
              scroll={{ x: 900 }}
              pagination={{
                current: query.page,
                pageSize: query.pageSize,
                total,
                showSizeChanger: true,
                showTotal: (t) => `共 ${t} 条`,
                onChange: (page, pageSize) => setQuery((q) => ({ ...q, page, pageSize })),
              }}
              columns={[
                { title: '账号', dataIndex: 'username', width: 120 },
                { title: '昵称', dataIndex: 'nickname', width: 120 },
                { title: '部门', width: 120, render: (_, r) => r.dept?.name ?? '-' },
                {
                  title: '角色',
                  width: 160,
                  render: (_, r) => (
                    <Space size={4} wrap>
                      {(r.roles ?? []).map((role) => (
                        <Tag key={role.id} color="blue">
                          {role.name}
                        </Tag>
                      ))}
                    </Space>
                  ),
                },
                { title: '手机号', dataIndex: 'phone', width: 130, render: (v) => v || '-' },
                {
                  title: '状态',
                  dataIndex: 'status',
                  width: 90,
                  render: (v: number) => <Tag color={v === 1 ? 'green' : 'red'}>{v === 1 ? '启用' : '停用'}</Tag>,
                },
                { title: '最后登录', dataIndex: 'lastLoginAt', width: 170, render: (v) => v || '-' },
                {
                  title: '操作',
                  width: 200,
                  fixed: 'right',
                  render: (_, record) => (
                    <Space size={4}>
                      <Auth perms="system:user:edit">
                        <Button type="link" size="small" onClick={() => openModal(record)}>
                          编辑
                        </Button>
                      </Auth>
                      <Auth perms="system:user:resetPwd">
                        <Button
                          type="link"
                          size="small"
                          onClick={() => {
                            setPwdTarget(record);
                            pwdForm.resetFields();
                            setPwdOpen(true);
                          }}
                        >
                          重置密码
                        </Button>
                      </Auth>
                      <Auth perms="system:user:remove">
                        <Popconfirm title="确认删除该用户？" onConfirm={() => remove(record.id)}>
                          <Button type="link" size="small" danger disabled={record.id === currentUser?.id}>
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
        </Col>
      </Row>

      <Modal
        open={open}
        width={640}
        title={editing ? `编辑用户：${editing.username}` : '新增用户'}
        onCancel={() => setOpen(false)}
        onOk={submit}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="username"
                label="账号"
                rules={[
                  { required: true, message: '请输入账号' },
                  { pattern: /^[a-zA-Z0-9_]+$/, message: '只能包含字母、数字、下划线' },
                ]}
              >
                <Input disabled={!!editing} placeholder="登录账号" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="nickname" label="昵称" rules={[{ required: true, message: '请输入昵称' }]}>
                <Input placeholder="显示名称" />
              </Form.Item>
            </Col>
          </Row>

          {!editing && (
            <Form.Item
              name="password"
              label="初始密码"
              rules={[
                { required: true, message: '请输入初始密码' },
                { min: 8, message: '至少 8 位' },
                { pattern: /^(?=.*[A-Za-z])(?=.*\d).+$/, message: '需同时包含字母和数字' },
              ]}
            >
              <Input.Password placeholder="至少 8 位，含字母和数字" />
            </Form.Item>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="deptId" label="所属部门" tooltip="部门决定该用户在数据权限中的归属">
                <Select
                  allowClear
                  placeholder="请选择部门"
                  options={flattenDepts(deptTree).map((d) => ({ label: d.label, value: d.id }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="roleIds" label="角色" tooltip="多角色时权限取并集">
                <Select
                  mode="multiple"
                  allowClear
                  placeholder="请选择角色"
                  options={roles.map((r) => ({ label: `${r.name}（${r.roleKey}）`, value: r.id }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="email" label="邮箱" rules={[{ type: 'email', message: '邮箱格式不正确' }]}>
                <Input placeholder="选填" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="手机号">
                <Input placeholder="选填" />
              </Form.Item>
            </Col>
          </Row>

          <Space size={32}>
            <Form.Item name="gender" label="性别">
              <Radio.Group
                options={[
                  { label: '未知', value: 0 },
                  { label: '男', value: 1 },
                  { label: '女', value: 2 },
                ]}
                optionType="button"
              />
            </Form.Item>
            <Form.Item name="status" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>

          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="选填" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={pwdOpen}
        title={`重置密码：${pwdTarget?.username ?? ''}`}
        onCancel={() => setPwdOpen(false)}
        onOk={submitPwd}
        destroyOnHidden
      >
        <Form form={pwdForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="password"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 8, message: '至少 8 位' },
              { pattern: /^(?=.*[A-Za-z])(?=.*\d).+$/, message: '需同时包含字母和数字' },
            ]}
          >
            <Input.Password placeholder="至少 8 位，含字母和数字" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

/** 部门树拍平成带缩进的下拉选项 */
function flattenDepts(nodes: DeptItem[], depth = 0): { id: number; label: string }[] {
  return nodes.flatMap((node) => [
    { id: node.id, label: `${'　'.repeat(depth)}${node.name}` },
    ...flattenDepts(node.children ?? [], depth + 1),
  ]);
}
