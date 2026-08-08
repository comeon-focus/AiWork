import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Upload,
  message,
} from 'antd';
import type { UploadFile } from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons';
import { demandApi } from '@/api';
import type { DemandFileInput, DemandItem } from '@/api/types';
import { Auth } from '@/components/Auth';
import { MarkdownEditor } from '@/components/MarkdownEditor';
import { tokenStore } from '@/utils/token';

interface FormValues {
  title: string;
  summary?: string;
  content?: string;
  status?: string;
  docFiles?: UploadFile[];
}

/** 需求状态选项与展示色 */
const STATUS_OPTIONS: { label: string; value: string; color: string }[] = [
  { label: '待开始', value: '待开始', color: 'default' },
  { label: '开发中', value: '开发中', color: 'processing' },
  { label: '已完成', value: '已完成', color: 'success' },
  { label: '挂起中', value: '挂起中', color: 'warning' },
  { label: '无效需求', value: '无效需求', color: 'error' },
];

const STATUS_COLOR: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((o) => [o.value, o.color]),
);

/** 从 antd 文件列表提取提交用的附件 */
function toUploaded(list: UploadFile[] | undefined): DemandFileInput[] {
  return (list ?? [])
    .filter((f) => (f as unknown as { url?: string }).url)
    .map((f) => ({
      fileName: f.name,
      fileType: ((f as unknown as { fileType?: 'doc' | 'image' }).fileType ?? 'doc') as 'doc' | 'image',
      url: (f as unknown as { url: string }).url,
    }));
}

/** 文件上传成功后写回 fileList */
function onUploadChange(info: {
  file: UploadFile & { url?: string; fileType?: 'doc' | 'image' };
  response?: { data?: { fileName: string; fileType: 'doc' | 'image'; url: string }[] };
}) {
  if (info.file.status === 'done') {
    const resp = info.file.response?.data?.[0];
    if (resp) {
      info.file.url = resp.url;
      info.file.fileType = resp.fileType;
      info.file.name = resp.fileName;
    }
  }
}

export default function DemandPage() {
  const [data, setData] = useState<DemandItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DemandItem | null>(null);
  const [form] = Form.useForm<FormValues>();

  const load = useCallback(async (title?: string) => {
    setLoading(true);
    try {
      setData(await demandApi.list(title ? { title } : undefined));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openModal = (record?: DemandItem) => {
    if (record) {
      setEditing(record);
      form.setFieldsValue({
        title: record.title,
        summary: record.summary ?? undefined,
        content: record.content ?? undefined,
        status: record.status ?? '待开始',
        docFiles: (record.files ?? []).map(
          (f) => ({ uid: String(f.id), name: f.fileName, status: 'done', url: f.url, fileType: f.fileType }) as UploadFile,
        ),
      });
    } else {
      setEditing(null);
      form.setFieldsValue({ title: '', summary: undefined, content: undefined, status: '待开始', docFiles: [] });
    }
    setOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    const payload = {
      title: values.title,
      summary: values.summary ?? null,
      content: values.content ?? null,
      status: values.status ?? '待开始',
      files: toUploaded(values.docFiles),
    };
    if (editing) {
      await demandApi.update(editing.id, payload);
    } else {
      await demandApi.create(payload);
    }
    message.success(editing ? '修改成功' : '新增成功');
    setOpen(false);
    void load(keyword);
  };

  const remove = async (id: number) => {
    await demandApi.remove(id);
    message.success('删除成功');
    void load(keyword);
  };

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="需求列表"
        description="记录独立的需求条目；任务可在「任务列表」中关联一个或多个需求，此处「任务数量」即关联该需求的任务条数。"
      />

      <Card className="search-bar">
        <Space wrap>
          <Input
            placeholder="需求标题"
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
        title="需求列表"
        extra={
          <Auth perms="orchestration:demand:add">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
              新增需求
            </Button>
          </Auth>
        }
      >
        <Table<DemandItem>
          rowKey="id"
          loading={loading}
          dataSource={data}
          pagination={false}
          columns={[
            { title: '需求标题', dataIndex: 'title', width: 200 },
            {
              title: '状态',
              dataIndex: 'status',
              width: 120,
              render: (v: string) => <Tag color={STATUS_COLOR[v] ?? 'default'}>{v}</Tag>,
            },
            {
              title: '任务数量',
              dataIndex: 'taskCount',
              width: 120,
              render: (v: number) => <Tag color="blue">{v}</Tag>,
            },
            { title: '创建人', dataIndex: 'creatorName', width: 120, render: (v: string | null) => v || '-' },
            { title: '创建时间', dataIndex: 'createdAt', width: 180 },
            {
              title: '操作',
              width: 160,
              render: (_, record) => (
                <Space size={4}>
                  <Auth perms="orchestration:demand:edit">
                    <Button type="link" size="small" onClick={() => openModal(record)}>
                      编辑
                    </Button>
                  </Auth>
                  <Auth perms="orchestration:demand:remove">
                    <Popconfirm title="确认删除该需求？" onConfirm={() => remove(record.id)}>
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
        title={editing ? '编辑需求' : '新增需求'}
        onCancel={() => setOpen(false)}
        onOk={submit}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="title" label="需求标题" rules={[{ required: true, message: '请输入需求标题' }]}>
            <Input placeholder="如：登录页支持扫码登录" />
          </Form.Item>
          <Form.Item name="summary" label="需求摘要" rules={[{ required: true, message: '请输入需求摘要' }]}>
            <Input placeholder="一句话概括需求目标" maxLength={255} />
          </Form.Item>
          <Form.Item name="status" label="需求状态" rules={[{ required: true, message: '请选择需求状态' }]}>
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item name="content" label="需求描述">
            <MarkdownEditor />
          </Form.Item>
          <Form.Item
            name="docFiles"
            label="需求文档"
            valuePropName="fileList"
            getValueFromEvent={(e) => (Array.isArray(e) ? e : e?.fileList)}
          >
            <Upload
              name="files"
              multiple
              listType="text"
              action="/api/demands/upload"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
              headers={{ Authorization: `Bearer ${tokenStore.getAccess()}` }}
              onChange={(info) => onUploadChange(info as Parameters<typeof onUploadChange>[0])}
            >
              <Button icon={<UploadOutlined />}>上传需求文档</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
