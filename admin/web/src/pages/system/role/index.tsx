import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
  Tree,
  message,
} from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { deptApi, menuApi, roleApi, codeRepoApi } from '@/api';
import type { CodeRepoItem, DataScope, DeptItem, MenuItem, RoleItem } from '@/api/types';
import { Auth } from '@/components/Auth';

const SCOPE_OPTIONS: { label: string; value: DataScope; desc: string }[] = [
  { label: '全部数据', value: 'ALL', desc: '不受部门限制，可见所有行' },
  { label: '本部门及以下', value: 'DEPT_AND_CHILD', desc: '本部门连同所有子部门' },
  { label: '仅本部门', value: 'DEPT', desc: '只看自己所在部门' },
  { label: '仅本人', value: 'SELF', desc: '只看自己创建/归属的数据' },
  { label: '自定义部门', value: 'CUSTOM', desc: '手动指定可见的部门集合' },
];

const SCOPE_TEXT = Object.fromEntries(SCOPE_OPTIONS.map((o) => [o.value, o.label])) as Record<DataScope, string>;

interface FormValues {
  name: string;
  roleKey: string;
  sort: number;
  status: boolean;
  remark?: string;
  dataScope: DataScope;
}

/** 收集所有「有子节点」的 id，回显时要排除它们，否则会被 antd 自动级联勾满 */
function collectParentIds(nodes: MenuItem[], acc = new Set<number>()): Set<number> {
  for (const n of nodes) {
    if (n.children?.length) {
      acc.add(n.id);
      collectParentIds(n.children, acc);
    }
  }
  return acc;
}

export default function RolePage() {
  const [rows, setRows] = useState<RoleItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');

  const [menuTree, setMenuTree] = useState<MenuItem[]>([]);
  const [deptTree, setDeptTree] = useState<DeptItem[]>([]);
  const [repoList, setRepoList] = useState<CodeRepoItem[]>([]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RoleItem | null>(null);
  const [checkedMenus, setCheckedMenus] = useState<number[]>([]);
  const [halfCheckedMenus, setHalfCheckedMenus] = useState<number[]>([]);
  const [checkedDepts, setCheckedDepts] = useState<number[]>([]);
  const [checkedRepos, setCheckedRepos] = useState<number[]>([]);
  const [form] = Form.useForm<FormValues>();
  const dataScope = Form.useWatch('dataScope', form);

  const parentIds = useMemo(() => collectParentIds(menuTree), [menuTree]);

  const load = useCallback(async (p = 1, size = 10, name?: string) => {
    setLoading(true);
    try {
      const res = await roleApi.list({ page: p, pageSize: size, name: name || undefined });
      setRows(res.list);
      setTotal(res.total);
      setPage(res.page);
      setPageSize(res.pageSize);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openModal = async (record?: RoleItem) => {
    const [menus, depts, repos] = await Promise.all([menuApi.tree(), deptApi.tree(), codeRepoApi.list()]);
    setMenuTree(menus);
    setDeptTree(depts);
    setRepoList(repos);

    if (record) {
      const detail = await roleApi.detail(record.id);
      setEditing(detail);
      const parents = collectParentIds(menus);
      // 只回显叶子节点，父节点的选中/半选状态由 antd 自行推导
      setCheckedMenus((detail.menuIds ?? []).filter((id) => !parents.has(id)));
      setCheckedDepts(detail.deptIds ?? []);
      setCheckedRepos(detail.repoIds ?? []);
      form.setFieldsValue({
        name: detail.name,
        roleKey: detail.roleKey,
        sort: detail.sort,
        status: detail.status === 1,
        remark: detail.remark ?? undefined,
        dataScope: detail.dataScope,
      });
    } else {
      setEditing(null);
      setCheckedMenus([]);
      setHalfCheckedMenus([]);
      setCheckedDepts([]);
      setCheckedRepos([]);
      form.setFieldsValue({ name: '', roleKey: '', sort: 1, status: true, remark: undefined, dataScope: 'SELF' });
    }
    setOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    // 半选的父节点也要提交，否则目录不会下发给前端，页面就进不去
    const menuIds = [...new Set([...checkedMenus, ...halfCheckedMenus])];
    const payload = {
      ...values,
      status: values.status ? 1 : 0,
      menuIds,
      deptIds: values.dataScope === 'CUSTOM' ? checkedDepts : [],
      repoIds: checkedRepos,
    };
    if (editing) {
      await roleApi.update(editing.id, payload);
    } else {
      await roleApi.create(payload);
    }
    message.success(editing ? '修改成功' : '新增成功');
    setOpen(false);
    void load(page, pageSize, keyword);
  };

  const remove = async (id: number) => {
    await roleApi.remove(id);
    message.success('删除成功');
    void load(page, pageSize, keyword);
  };

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="角色是权限的唯一载体"
        description="勾选菜单树 = 分配页面权限与操作权限；数据权限则决定该角色能看到哪些行。用户通过绑定角色获得权限，不给用户单独配权限，避免同一份权限在多处重复维护。"
      />

      <Card className="search-bar">
        <Space wrap>
          <Input
            placeholder="角色名称"
            allowClear
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={() => load(1, pageSize, keyword)}
            style={{ width: 200 }}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={() => load(1, pageSize, keyword)}>
            查询
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setKeyword('');
              void load(1, pageSize);
            }}
          >
            重置
          </Button>
        </Space>
      </Card>

      <Card
        className="page-card"
        title="角色管理"
        extra={
          <Auth perms="system:role:add">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
              新增角色
            </Button>
          </Auth>
        }
      >
        <Table<RoleItem>
          rowKey="id"
          loading={loading}
          dataSource={rows}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, s) => load(p, s, keyword),
          }}
          columns={[
            { title: '角色名称', dataIndex: 'name' },
            { title: '角色标识', dataIndex: 'roleKey', render: (v: string) => <Tag>{v}</Tag> },
            {
              title: '数据权限',
              dataIndex: 'dataScope',
              render: (v: DataScope) => <Tag color="purple">{SCOPE_TEXT[v]}</Tag>,
            },
            { title: '排序', dataIndex: 'sort', width: 70 },
            {
              title: '状态',
              dataIndex: 'status',
              width: 90,
              render: (v: number) => <Tag color={v === 1 ? 'green' : 'red'}>{v === 1 ? '启用' : '停用'}</Tag>,
            },
            { title: '备注', dataIndex: 'remark', render: (v) => v || '-' },
            {
              title: '操作',
              width: 160,
              render: (_, record) =>
                record.roleKey === 'admin' ? (
                  <Tag color="gold">内置角色</Tag>
                ) : (
                  <Space size={4}>
                    <Auth perms="system:role:edit">
                      <Button type="link" size="small" onClick={() => openModal(record)}>
                        编辑/授权
                      </Button>
                    </Auth>
                    <Auth perms="system:role:remove">
                      <Popconfirm title="确认删除该角色？" onConfirm={() => remove(record.id)}>
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
        width={760}
        title={editing ? `编辑角色：${editing.name}` : '新增角色'}
        onCancel={() => setOpen(false)}
        onOk={submit}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item name="name" label="角色名称" rules={[{ required: true, message: '请输入角色名称' }]} style={{ flex: 1 }}>
              <Input placeholder="如：部门主管" />
            </Form.Item>
            <Form.Item
              name="roleKey"
              label="角色标识"
              rules={[
                { required: true, message: '请输入角色标识' },
                { pattern: /^[a-zA-Z][a-zA-Z0-9_:-]*$/, message: '字母开头，可含数字与 _ : -' },
              ]}
              style={{ flex: 1 }}
            >
              <Input placeholder="如：manager" />
            </Form.Item>
            <Form.Item name="sort" label="排序">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="status" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>

          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="选填" />
          </Form.Item>

          <Form.Item
            name="dataScope"
            label="数据权限"
            tooltip="决定该角色能查询到哪些行，由后端在 SQL 层强制注入"
            rules={[{ required: true }]}
          >
            <Select
              options={SCOPE_OPTIONS.map((o) => ({
                label: `${o.label} —— ${o.desc}`,
                value: o.value,
              }))}
            />
          </Form.Item>

          {dataScope === 'CUSTOM' && (
            <Form.Item label="可见部门">
              <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 6, padding: 8 }}>
                <Tree
                  checkable
                  defaultExpandAll
                  checkStrictly
                  treeData={deptTree as unknown as never}
                  fieldNames={{ title: 'name', key: 'id', children: 'children' }}
                  checkedKeys={{ checked: checkedDepts, halfChecked: [] }}
                  onCheck={(keys) => {
                    const checked = Array.isArray(keys) ? keys : keys.checked;
                    setCheckedDepts(checked as number[]);
                  }}
                />
              </div>
            </Form.Item>
          )}

          <Form.Item label="菜单权限（页面 + 操作按钮）">
            <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 6, padding: 8 }}>
              <Tree
                checkable
                defaultExpandAll
                treeData={menuTree as unknown as never}
                fieldNames={{ title: 'name', key: 'id', children: 'children' }}
                checkedKeys={checkedMenus}
                onCheck={(keys, info) => {
                  setCheckedMenus((Array.isArray(keys) ? keys : keys.checked) as number[]);
                  setHalfCheckedMenus((info.halfCheckedKeys ?? []) as number[]);
                }}
              />
            </div>
            <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>
              共 {parentIds.size} 个父节点。勾选子项时父级目录会自动作为半选一并保存，确保页面可达。
            </div>
          </Form.Item>

          <Form.Item label="代码库权限（可管理的代码库）">
            <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 6, padding: 8 }}>
              <Tree
                checkable
                defaultExpandAll
                treeData={repoList as unknown as never}
                fieldNames={{ title: 'name', key: 'id', children: 'children' }}
                checkedKeys={checkedRepos}
                onCheck={(keys) => {
                  setCheckedRepos((Array.isArray(keys) ? keys : keys.checked) as number[]);
                }}
              />
            </div>
            <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>
              共 {repoList.length} 个代码库。未勾选的角色将无法在「代码库管理」中看到对应库。
            </div>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
