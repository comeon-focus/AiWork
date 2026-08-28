import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, message } from 'antd';
import { ReloadOutlined, SearchOutlined, EyeOutlined } from '@ant-design/icons';
import { smartDocApi, codeRepoApi } from '@/api';
import type { CodeRepoItem, SmartDocItem } from '@/api/types';
import { Auth } from '@/components/Auth';
import { MarkdownEditor } from '@/components/MarkdownEditor';
import { MarkdownViewer } from '@/components/MarkdownViewer';

interface FormValues {
  title: string;
  summary?: string;
  content?: string;
  repoId?: number | null;
}

export default function SmartDocPage() {
  const [data, setData] = useState<SmartDocItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SmartDocItem | null>(null);
  const [viewing, setViewing] = useState<SmartDocItem | null>(null);
  const [repoOptions, setRepoOptions] = useState<CodeRepoItem[]>([]);
  const [form] = Form.useForm<FormValues>();

  const load = useCallback(async (title?: string) => {
    setLoading(true);
    try {
      setData(await smartDocApi.list(title ? { title } : undefined));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void codeRepoApi.list().then(setRepoOptions).catch(() => setRepoOptions([]));
  }, [load]);

  const fetchDetail = async (record: SmartDocItem) => {
    // 列表接口排除 content，查看/编辑前按 id 重新取一次，保证拿到完整正文
    return smartDocApi.detail(record.id);
  };

  const openModal = async (record: SmartDocItem) => {
    const detail = await fetchDetail(record);
    setEditing(detail);
    form.setFieldsValue({
      title: detail.title,
      summary: detail.summary ?? undefined,
      content: detail.content ?? undefined,
      repoId: detail.repoId ?? null,
    });
    setOpen(true);
  };

  const openViewer = async (record: SmartDocItem) => {
    const detail = await fetchDetail(record);
    setViewing(detail);
  };

  const submit = async () => {
    const values = await form.validateFields();
    if (!editing) return;
    await smartDocApi.update(editing.id, {
      title: values.title,
      summary: values.summary ?? null,
      content: values.content ?? null,
      repoId: values.repoId ?? null,
    });
    message.success('修改成功');
    setOpen(false);
    void load(keyword);
  };

  const remove = async (id: number) => {
    await smartDocApi.remove(id);
    message.success('删除成功');
    void load(keyword);
  };

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="智能文档"
        description="在「任务列表」点击 AI优化 后，由本机 CodeBuddy 结合需求描述与需求文档生成的 Markdown 需求文档，每次优化生成一条记录，可再次编辑。"
      />

      <Card className="search-bar">
        <Space wrap>
          <Input
            placeholder="标题"
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

      <Card className="page-card" title="智能文档">
        <Table<SmartDocItem>
          rowKey="id"
          loading={loading}
          dataSource={data}
          pagination={false}
          columns={[
            { title: '标题', dataIndex: 'title', width: 200 },
            { title: '需求摘要', dataIndex: 'summary', ellipsis: true, render: (v: string | null) => v || '-' },
            {
              title: '输入token',
              dataIndex: 'inputTokens',
              width: 110,
              render: (v: number) => <Tag color="blue">{v ?? 0}</Tag>,
            },
            {
              title: '输出token',
              dataIndex: 'outputTokens',
              width: 110,
              render: (v: number) => <Tag color="green">{v ?? 0}</Tag>,
            },
            { title: '创建人', dataIndex: 'creatorName', width: 120, render: (v: string | null) => v || '-' },
            {
              title: '关联代码库',
              dataIndex: 'codeRepo',
              width: 160,
              render: (v: { id: number; name: string } | null | undefined) => v?.name ?? '-',
            },
            { title: '创建时间', dataIndex: 'createdAt', width: 180 },
            {
              title: '操作',
              width: 160,
              render: (_, record) => (
                <Space size={4}>
                  <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openViewer(record)}>
                    查看
                  </Button>
                  <Auth perms="orchestration:smartDoc:edit">
                    <Button type="link" size="small" onClick={() => openModal(record)}>
                      编辑
                    </Button>
                  </Auth>
                  <Auth perms="orchestration:smartDoc:remove">
                    <Popconfirm title="确认删除该智能文档？" onConfirm={() => remove(record.id)}>
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
        width={860}
        title="编辑智能文档"
        onCancel={() => setOpen(false)}
        onOk={submit}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="summary" label="需求摘要">
            <Input.TextArea rows={2} maxLength={2000} />
          </Form.Item>
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item label="输入token" style={{ flex: 1 }}>
              <Input value={editing?.inputTokens ?? 0} disabled />
            </Form.Item>
            <Form.Item label="输出token" style={{ flex: 1 }}>
              <Input value={editing?.outputTokens ?? 0} disabled />
            </Form.Item>
          </Space>
          <Form.Item name="repoId" label="关联代码库">
            <Select
              allowClear
              placeholder="可关联一个代码库"
              showSearch
              optionFilterProp="label"
              options={repoOptions.map((r) => ({ label: r.name, value: r.id }))}
            />
          </Form.Item>
          <Form.Item name="content" label="智能需求描述">
            <MarkdownEditor />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={!!viewing}
        width={1000}
        title={viewing?.title}
        onCancel={() => setViewing(null)}
        footer={null}
        destroyOnHidden
      >
        <div style={{ marginTop: 16, maxHeight: '70vh', overflow: 'auto' }}>
          <MarkdownViewer value={viewing?.content ?? ''} />
        </div>
      </Modal>
    </>
  );
}
