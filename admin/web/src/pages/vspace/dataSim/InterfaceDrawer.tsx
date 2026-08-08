import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Drawer, Flex, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Tooltip, Upload, message } from 'antd';
import { CopyOutlined, FormatPainterOutlined, FullscreenExitOutlined, FullscreenOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import prettier from 'prettier/standalone';
import babelPlugin from 'prettier/plugins/babel';
import estreePlugin from 'prettier/plugins/estree';
import { dataSimInterfaceApi } from '@/api';
import type { DataSimInterfaceItem, DataSimProjectItem } from '@/api/types';
import { Auth } from '@/components/Auth';

interface Props {
  project: DataSimProjectItem | null;
  open: boolean;
  onClose: () => void;
}

interface FormValues {
  description: string;
  method: string;
  path: string;
  responseData?: string | null;
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

export function InterfaceDrawer({ project, open, onClose }: Props) {
  const [data, setData] = useState<DataSimInterfaceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DataSimInterfaceItem | null>(null);
  const [form] = Form.useForm<FormValues>();
  const [codeFullscreen, setCodeFullscreen] = useState(false);
  const [code, setCode] = useState('');

  const importFile = async (file: File) => {
    try {
      const text = await file.text();
      const arr = JSON.parse(text);
      if (!Array.isArray(arr)) throw new Error('JSON 根节点必须是数组');
      // responseData 可能是字符串（推荐）也可能是对象/数组，统一归一化：
      // 字符串原样保留；对象/数组序列化为 JSON 字符串；其余置空。
      const normalizeResponseData = (v: unknown): string | null => {
        if (v == null) return null;
        if (typeof v === 'string') return v;
        return JSON.stringify(v);
      };
      // 从多个候选字段中取第一个非空值（兼容各 API 文档导出格式：
      // description 可能叫 title / summary / name；path 可能叫 url / uri）
      const pick = (it: Record<string, unknown>, keys: string[]): string => {
        for (const k of keys) {
          const v = it[k];
          if (v != null && String(v).trim() !== '') return String(v).trim();
        }
        return '';
      };
      const items = (arr as Record<string, unknown>[])
        .map((it) => {
          const path = pick(it, ['path', 'url', 'uri']);
          // description 缺失时用 path 兜底，保证有值；只要有 path 即可导入
          const description = pick(it, ['description', 'title', 'summary', 'name']) || path;
          return {
            description,
            method: String(it.method ?? 'GET').toUpperCase(),
            path,
            responseData: normalizeResponseData(it.responseData),
          };
        })
        .filter((it) => it.path);
      if (items.length === 0) {
        message.warning('未解析到有效接口（需包含 description 与 path）');
        return;
      }
      // 分片导入：避免单次请求体过大 / 超过单批条数上限 / 触发前端超时。
      // 每片单独调用导入接口，最后汇总新增 / 更新 / 失败数量与失败明细。
      const CHUNK_SIZE = 1000;
      let imported = 0;
      let updated = 0;
      let failed = 0;
      const errors: { index: number; reason: string }[] = [];
      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        const res = await dataSimInterfaceApi.import(project!.projectId, chunk);
        imported += res.imported;
        updated += res.updated;
        failed += res.failed;
        for (const e of res.errors) errors.push({ index: i + e.index, reason: e.reason });
      }
      message.success(`导入完成：新增 ${imported} 条，更新 ${updated} 条，失败 ${failed} 条`);
      if (errors.length > 0) {
        Modal.warning({
          title: `有 ${errors.length} 条未成功导入`,
          width: 600,
          content: (
            <div style={{ maxHeight: 320, overflow: 'auto' }}>
              {errors.map((e) => (
                <div key={e.index} style={{ marginBottom: 6, fontSize: 13 }}>
                  <Tag color="red">第 {e.index} 条</Tag>
                  <span>{e.reason}</span>
                </div>
              ))}
            </div>
          ),
        });
      }
      setPage(1);
      void load(1, pageSize);
    } catch (e) {
      message.error(`导入失败：${(e as Error).message}`);
    }
  };

  const formatCode = async () => {
    const value = code;
    if (!value.trim()) {
      message.warning('内容为空，无需格式化');
      return;
    }
    try {
      let source = value.trim();
      // 顶层对象字面量会被 prettier 解析为代码块，需包一层括号
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

  const load = useCallback(
    async (p = page, ps = pageSize, kw = keyword) => {
      if (!project) return;
      setLoading(true);
      try {
        const res = await dataSimInterfaceApi.list(project.projectId, {
          keyword: kw || undefined,
          page: p,
          pageSize: ps,
        });
        setData(res.list);
        setTotal(res.total);
      } finally {
        setLoading(false);
      }
  }, [project, page, pageSize, keyword]);

  // 仅在抽屉打开时重置到第 1 页并加载；不把 load 放入依赖，
  // 否则 load 随 page 变化重建会再次触发本 effect，导致翻页被立即重置回第 1 页。
  useEffect(() => {
    if (open) {
      setKeyword('');
      setPage(1);
      void load(1, pageSize, '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project]);

  const openModal = (record?: DataSimInterfaceItem) => {
    setCodeFullscreen(false);
    if (record) {
      setEditing(record);
      setCode(record.responseData ?? '');
      form.setFieldsValue({
        description: record.description,
        method: record.method,
        path: record.path,
      });
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
    const values = await form.validateFields();
    const payload = {
      projectId: project!.projectId,
      description: values.description,
      method: values.method,
      path: values.path,
      responseData: code || null,
    };
    if (editing) {
      await dataSimInterfaceApi.update(editing.id, payload);
    } else {
      await dataSimInterfaceApi.create(payload);
    }
    message.success(editing ? '修改成功' : '新增成功');
    closeModal();
    void load();
  };

  const remove = async (id: number) => {
    await dataSimInterfaceApi.remove(id);
    message.success('删除成功');
    void load();
  };

  const buildLink = (record: DataSimInterfaceItem) =>
    `${window.location.origin}/mock/${project?.projectId ?? ''}${record.path}`;

  const copyLink = async (record: DataSimInterfaceItem) => {
    const link = buildLink(record);
    try {
      await navigator.clipboard.writeText(link);
      message.success('已复制接口链接');
    } catch {
      message.error('复制失败，请手动复制');
    }
  };

  return (
    <Drawer title={`接口管理 · ${project?.name ?? ''}`} width={960} open={open} onClose={onClose}>
      <Flex justify="space-between" align="center" gap={12} wrap style={{ marginBottom: 16 }}>
        <Space wrap>
          <Auth perms="vspace:datasim:add">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
              新增接口
            </Button>
          </Auth>
          <span style={{ color: '#999' }}>项目ID：{project?.projectId}</span>
        </Space>
        <Space wrap>
          <Input.Search
            allowClear
            enterButton
            placeholder="搜索描述 / 路径 / 方法"
            style={{ width: 300 }}
            value={keyword}
            onChange={(e) => {
              const v = e.target.value;
              setKeyword(v);
              if (searchTimer.current) clearTimeout(searchTimer.current);
              // 清空时立即查询；输入时防抖后查询，输入即筛
              if (v === '') {
                setPage(1);
                void load(1, pageSize, '');
                return;
              }
              searchTimer.current = setTimeout(() => {
                setPage(1);
                void load(1, pageSize, v);
              }, 300);
            }}
            onSearch={(v) => {
              if (searchTimer.current) clearTimeout(searchTimer.current);
              setKeyword(v);
              setPage(1);
              void load(1, pageSize, v);
            }}
          />
          <Auth perms="vspace:datasim:add">
            <Upload
              accept=".json,application/json"
              showUploadList={false}
              beforeUpload={(file) => {
                void importFile(file);
                return false;
              }}
            >
              <Button icon={<UploadOutlined />}>导入 JSON</Button>
            </Upload>
          </Auth>
        </Space>
      </Flex>

      <Table<DataSimInterfaceItem>
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
        columns={[
          { title: '描述', dataIndex: 'description' },
          {
            title: '方法',
            dataIndex: 'method',
            width: 100,
            render: (v: string) => <Tag color={METHOD_COLOR[v] ?? 'default'}>{v}</Tag>,
          },
          { title: '路径', dataIndex: 'path', ellipsis: true },
          {
            title: '操作',
            width: 220,
            render: (_, record) => (
              <Space size={4}>
                <Button type="link" size="small" icon={<CopyOutlined />} onClick={() => copyLink(record)} title="复制接口链接">
                  复制链接
                </Button>
                <Auth perms="vspace:datasim:edit">
                  <Button type="link" size="small" onClick={() => openModal(record)}>
                    编辑
                  </Button>
                </Auth>
                <Auth perms="vspace:datasim:remove">
                  <Popconfirm title="确认删除该接口？" onConfirm={() => remove(record.id)}>
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
          {editing && (
            <Space size={16} style={{ display: 'flex' }}>
              <Form.Item label="创建人" style={{ width: 220 }}>
                <Input value={editing.createdBy ?? '-'} disabled />
              </Form.Item>
              <Form.Item label="更新人" style={{ width: 220 }}>
                <Input value={editing.updatedBy ?? '-'} disabled />
              </Form.Item>
            </Space>
          )}
          <div className="field-label">
            响应数据
            <Tooltip
              styles={{ body: { maxWidth: 520 } }}
              title={
                <div>
                  <div style={{ marginBottom: 8 }}>
                    示例（动态 JS 对象：箭头函数可读取请求上下文 <code>_req</code>，通过 <code>_req.query</code> /{' '}
                    <code>_req.params</code> / <code>_req.body</code> 等可按参数返回不同结构）：
                  </div>
                  <pre className="code-sample">{`{
  code: 0,
  a: 1,
  b: ({ _req }) => _req.query.id,
  list: ({ _req }) => Array.from({ length: Number(_req.query.size || 3) }, (_, i) => ({ id: i, name: 'item' + i })),
}`}</pre>
                </div>
              }
            >
              <span style={{ marginLeft: 6, color: '#1677ff', cursor: 'help', fontWeight: 700 }}>?</span>
            </Tooltip>
          </div>
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
