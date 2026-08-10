import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Drawer,
  Flex,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import { FormatPainterOutlined, FullscreenExitOutlined, FullscreenOutlined, PlusOutlined } from '@ant-design/icons';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import prettier from 'prettier/standalone';
import babelPlugin from 'prettier/plugins/babel';
import estreePlugin from 'prettier/plugins/estree';
import { dataTaskApi } from '@/api';
import type { DataTaskInterfaceItem, DataTaskItem } from '@/api/types';
import { TASK_STATUS } from '@/api/types';
import { Auth } from '@/components/Auth';

interface Props {
  task: DataTaskItem | null;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

interface FormValues {
  description: string;
  method: string;
  path: string;
}

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];
const METHOD_COLOR: Record<string, string> = {
  GET: 'green',
  POST: 'blue',
  PUT: 'orange',
  DELETE: 'red',
  PATCH: 'purple',
  OPTIONS: 'default',
  HEAD: 'default',
};

export function TaskInterfaceDrawer({ task, open, onClose, onChanged }: Props) {
  const [data, setData] = useState<DataTaskInterfaceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DataTaskInterfaceItem | null>(null);
  const [form] = Form.useForm<FormValues>();
  const [codeFullscreen, setCodeFullscreen] = useState(false);
  const [code, setCode] = useState('');

  const locked = task?.status === TASK_STATUS.SUCCESS;

  const load = useCallback(
    async (p = page, ps = pageSize, kw = keyword) => {
      if (!task) return;
      setLoading(true);
      try {
        const res = await dataTaskApi.listInterfaces(task.id, { keyword: kw || undefined, page: p, pageSize: ps });
        setData(res.list);
        setTotal(res.total);
      } finally {
        setLoading(false);
      }
    },
    [task, page, pageSize, keyword],
  );

  useEffect(() => {
    if (open && task) {
      setKeyword('');
      setPage(1);
      void load(1, pageSize, '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task]);

  const formatCode = async () => {
    const value = code;
    if (!value.trim()) {
      message.warning('内容为空，无需格式化');
      return;
    }
    try {
      let source = value.trim();
      const wrapped = source.startsWith('{');
      if (wrapped) source = `(${source})`;
      let out = await prettier.format(source, { parser: 'babel', plugins: [babelPlugin, estreePlugin] });
      if (wrapped) out = out.trim().replace(/^\(/, '').replace(/\);?\s*$/, '');
      out = out.trim().replace(/;[ \t]*$/, '');
      setCode(out);
      message.success('已格式化');
    } catch (e) {
      message.error(`格式化失败：${(e as Error).message}`);
    }
  };

  const openModal = (record?: DataTaskInterfaceItem) => {
    setCodeFullscreen(false);
    if (record) {
      setEditing(record);
      setCode(record.responseData ?? '');
      form.setFieldsValue({ description: record.description, method: record.method, path: record.path });
    } else {
      setEditing(null);
      setCode('');
      form.resetFields();
      form.setFieldsValue({ method: 'GET' });
    }
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setCodeFullscreen(false);
  };

  const submit = async () => {
    if (!task) return;
    const values = await form.validateFields();
    const payload = {
      description: values.description,
      method: values.method,
      path: values.path,
      responseData: code || null,
    };
    if (editing) {
      await dataTaskApi.updateInterface(task.id, editing.id, payload);
    } else {
      await dataTaskApi.createInterface(task.id, payload);
    }
    message.success(editing ? '修改成功' : '新增成功');
    closeModal();
    void load();
    onChanged?.();
  };

  const remove = async (id: number) => {
    if (!task) return;
    await dataTaskApi.removeInterface(task.id, id);
    message.success('删除成功');
    void load();
    onChanged?.();
  };

  const columns = [
    { title: '描述', dataIndex: 'description' },
    {
      title: '方法',
      dataIndex: 'method',
      width: 100,
      render: (v: string) => <Tag color={METHOD_COLOR[v] ?? 'default'}>{v}</Tag>,
    },
    { title: '路径', dataIndex: 'path', ellipsis: true },
    {
      title: '已同步',
      dataIndex: 'synced',
      width: 90,
      render: (v: boolean) => (v ? <Tag color="green">已同步</Tag> : <Tag>未同步</Tag>),
    },
    {
      title: '操作',
      width: 160,
      render: (_: unknown, record: DataTaskInterfaceItem) => (
        <Space size={4}>
          <Auth perms="vspace:datatask:edit">
            <Button type="link" size="small" disabled={locked} onClick={() => openModal(record)}>
              编辑
            </Button>
          </Auth>
          <Auth perms="vspace:datatask:remove">
            <Popconfirm title="确认删除该接口？" onConfirm={() => remove(record.id)}>
              <Button type="link" size="small" danger disabled={locked}>
                删除
              </Button>
            </Popconfirm>
          </Auth>
        </Space>
      ),
    },
  ];

  return (
    <Drawer title={`接口管理 · ${task?.name ?? ''}`} width={960} open={open} onClose={onClose}>
      <Flex justify="space-between" align="center" gap={12} wrap style={{ marginBottom: 16 }}>
        <Space wrap>
          <span style={{ color: '#999' }}>
            关联项目：{task?.projectNames?.length ? task.projectNames.join('、') : '-'}
          </span>
        </Space>
        <Space wrap>
          <Input.Search
            allowClear
            enterButton
            placeholder="搜索描述 / 路径 / 方法"
            style={{ width: 300 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={(v) => {
              setPage(1);
              void load(1, pageSize, v);
            }}
          />
          <Auth perms="vspace:datatask:edit">
            <Button type="primary" icon={<PlusOutlined />} disabled={locked} onClick={() => openModal()}>
              新增接口
            </Button>
          </Auth>
        </Space>
      </Flex>

      <Table<DataTaskInterfaceItem>
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

      <Modal
        title={editing ? '编辑接口' : '新增接口'}
        open={modalOpen}
        width={720}
        onCancel={closeModal}
        onOk={submit}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="description" label="接口描述" rules={[{ required: true, message: '请输入接口描述' }]}>
            <Input placeholder="如：查询用户列表" maxLength={255} />
          </Form.Item>
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item name="method" label="请求方法" rules={[{ required: true }]} style={{ width: 160 }}>
              <Select options={METHODS.map((m) => ({ label: m, value: m }))} />
            </Form.Item>
            <Form.Item name="path" label="接口路径" rules={[{ required: true, message: '请输入接口路径' }]} style={{ flex: 1 }}>
              <Input placeholder="如：/api/users" />
            </Form.Item>
          </Space>
          <div className="field-label">响应数据</div>
          <div className={`code-wrap${codeFullscreen ? ' code-fullscreen' : ''}`}>
            <div className="code-toolbar">
              <Button size="small" icon={<FormatPainterOutlined />} onClick={formatCode}>
                格式化
              </Button>
              <Button
                size="small"
                icon={codeFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                onClick={() => setCodeFullscreen((v) => !v)}
              >
                {codeFullscreen ? '退出全屏' : '全屏'}
              </Button>
            </div>
            <CodeMirror
              className="code-editor"
              value={code}
              onChange={(val) => setCode(val)}
              height={codeFullscreen ? '100%' : '280px'}
              theme="light"
              extensions={[javascript({ jsx: false })]}
              basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true, autocompletion: false }}
              placeholder="支持 JSON；也可用 JS 对象字面量，箭头函数可读取请求参数 _req，例如：{ list: ({ _req }) => [{ id: _req.query.id }] }"
            />
          </div>
        </Form>
      </Modal>
    </Drawer>
  );
}
