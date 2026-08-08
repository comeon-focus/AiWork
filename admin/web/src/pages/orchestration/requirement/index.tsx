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
import { PlusOutlined, ReloadOutlined, RobotOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { requirementApi, codeRepoApi } from '@/api';
import type { CodeRepoItem, DemandOption, RequirementFileInput, RequirementItem } from '@/api/types';
import { Auth } from '@/components/Auth';
import { MarkdownEditor } from '@/components/MarkdownEditor';
import { tokenStore } from '@/utils/token';

interface FormValues {
  title: string;
  summary?: string;
  content?: string;
  demandIds?: number[];
  repoId?: number | null;
  docFiles?: UploadFile[];
}

/** 从 antd 文件列表提取提交用的附件（按所属分组标记 kind） */
function toUploaded(list: UploadFile[] | undefined, kind: 'requirement' | 'design'): RequirementFileInput[] {
  return (list ?? [])
    .filter((f) => (f as unknown as { url?: string }).url)
    .map((f) => ({
      fileName: f.name,
      fileType: ((f as unknown as { fileType?: 'doc' | 'image' }).fileType ?? 'doc') as 'doc' | 'image',
      kind,
      url: (f as unknown as { url: string }).url,
    }));
}

/** 文件上传成功后的回调：把后端返回的 url / 类型写回 fileList，供提交与预览使用 */
function onUploadChange(info: { file: UploadFile & { url?: string; fileType?: 'doc' | 'image' }; response?: { data?: { fileName: string; fileType: 'doc' | 'image'; url: string }[] } }) {
  if (info.file.status === 'done') {
    const resp = info.file.response?.data?.[0];
    if (resp) {
      info.file.url = resp.url;
      info.file.fileType = resp.fileType;
      info.file.name = resp.fileName;
    }
  }
}

export default function RequirementPage() {
  const [data, setData] = useState<RequirementItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RequirementItem | null>(null);
  const [aiId, setAiId] = useState<number | null>(null);
  const [demandOptions, setDemandOptions] = useState<DemandOption[]>([]);
  const [repoOptions, setRepoOptions] = useState<CodeRepoItem[]>([]);
  const [form] = Form.useForm<FormValues>();
  const navigate = useNavigate();

  const load = useCallback(async (title?: string) => {
    setLoading(true);
    try {
      setData(await requirementApi.list(title ? { title } : undefined));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void requirementApi.demandOptions().then(setDemandOptions).catch(() => setDemandOptions([]));
    void codeRepoApi.list().then(setRepoOptions).catch(() => setRepoOptions([]));
  }, [load]);

  const openModal = (record?: RequirementItem) => {
    if (record) {
      setEditing(record);
      form.setFieldsValue({
        title: record.title,
        summary: record.summary ?? undefined,
        content: record.content ?? undefined,
        demandIds: record.demands?.map((d) => d.id),
        repoId: record.repoId ?? null,
        docFiles: (record.files ?? [])
          .filter((f) => f.kind === 'requirement')
          .map((f) => ({ uid: String(f.id), name: f.fileName, status: 'done', url: f.url, fileType: f.fileType }) as UploadFile),
      });
    } else {
      setEditing(null);
      form.setFieldsValue({ title: '', summary: undefined, content: undefined, demandIds: [], repoId: null, docFiles: [] });
    }
    setOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    const payload = {
      title: values.title,
      summary: values.summary ?? null,
      content: values.content ?? null,
      demandIds: values.demandIds ?? [],
      repoId: values.repoId ?? null,
      files: toUploaded(values.docFiles, 'requirement'),
    };
    if (editing) {
      await requirementApi.update(editing.id, payload);
    } else {
      await requirementApi.create(payload);
    }
    message.success(editing ? '修改成功' : '新增成功');
    setOpen(false);
    void load(keyword);
  };

  const remove = async (id: number) => {
    await requirementApi.remove(id);
    message.success('删除成功');
    void load(keyword);
  };

  // 交给本机 CodeBuddy 润色，耗时较长；成功后引导用户去「智能文档」查看
  const aiOptimize = async (record: RequirementItem) => {
    setAiId(record.id);
    const hide = message.loading('AI 正在理解并润色需求，请稍候…', 0);
    try {
      const doc = await requirementApi.aiOptimize(record.id);
      hide();
      Modal.success({
        title: 'AI 优化完成',
        content: `已生成智能文档「${doc.title}」，本次消耗输入 ${doc.inputTokens} token、输出 ${doc.outputTokens} token。`,
        okText: '去查看',
        onOk: () => navigate('/orchestration/smart-doc'),
      });
    } catch {
      hide();
    } finally {
      setAiId(null);
    }
  };

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="需求记录"
        description="填写需求标题与摘要，「需求描述」支持 Markdown 并可在编辑区插入图片 / 文档；另可上传「需求文档」作为附件。"
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
        title="任务列表"
        extra={
          <Auth perms="orchestration:requirement:add">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
              新增需求
            </Button>
          </Auth>
        }
      >
        <Table<RequirementItem>
          rowKey="id"
          loading={loading}
          dataSource={data}
          pagination={false}
          columns={[
            { title: '标题', dataIndex: 'title', width: 200 },
            {
              title: '需求摘要',
              dataIndex: 'summary',
              ellipsis: true,
              render: (v: string | null) => v || '-',
            },
            { title: '创建人', dataIndex: 'creatorName', width: 120, render: (v: string | null) => v || '-' },
            {
              title: '关联需求',
              dataIndex: 'demands',
              width: 220,
              render: (v: { id: number; title: string }[] | undefined) =>
                v && v.length
                  ? v.map((d) => (
                      <Tag key={d.id} color="purple">
                        {d.title}
                      </Tag>
                    ))
                  : '-',
            },
            {
              title: '关联代码库',
              dataIndex: 'codeRepo',
              width: 160,
              render: (v: { id: number; name: string } | null | undefined) => v?.name ?? '-',
            },
            { title: '创建时间', dataIndex: 'createdAt', width: 180 },
            {
              title: '操作',
              width: 260,
              render: (_, record) => (
                <Space size={4}>
                  <Auth perms="orchestration:requirement:ai">
                    <Button
                      type="link"
                      size="small"
                      icon={<RobotOutlined />}
                      loading={aiId === record.id}
                      disabled={aiId !== null && aiId !== record.id}
                      onClick={() => aiOptimize(record)}
                    >
                      AI优化
                    </Button>
                  </Auth>
                  <Auth perms="orchestration:requirement:edit">
                    <Button type="link" size="small" onClick={() => openModal(record)}>
                      编辑
                    </Button>
                  </Auth>
                  <Auth perms="orchestration:requirement:remove">
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
          <Form.Item name="demandIds" label="关联需求">
            <Select
              mode="multiple"
              allowClear
              placeholder="可关联一个或多个需求"
              optionFilterProp="label"
              options={demandOptions.map((d) => ({ label: d.title, value: d.id }))}
            />
          </Form.Item>
          <Form.Item name="repoId" label="关联代码库">
            <Select
              allowClear
              placeholder="可关联一个代码库"
              showSearch
              optionFilterProp="label"
              options={repoOptions.map((r) => ({ label: r.name, value: r.id }))}
            />
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
              action="/api/requirements/upload"
              data={{ kind: 'requirement' }}
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
