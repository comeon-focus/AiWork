import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Input, Modal, Popconfirm, Space, Table, Tag, Tooltip, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { configApi } from '@/api';
import type { ConfigItem } from '@/api/types';
import { Auth } from '@/components/Auth';

interface FormValues {
  configKey?: string;
  configValue: string;
  remark?: string;
}

const AI_CONCURRENT_KEY = 'ai.concurrent.parent.limit';

/** 统一渲染配置键：所有配置键都使用说明作为 tooltip，AI 并发数额外补充作用说明 */
function KeyCell({ record }: { record: ConfigItem }) {
  const title =
    record.configKey === AI_CONCURRENT_KEY ? (
      <div>
        <div>控制同时允许的父级 AI 任务 AICoding 并发数。</div>
        <div>留空：不限制并发数</div>
        <div>填写正整数：最多允许 N 个任务同时 AICoding</div>
      </div>
    ) : (
      record.remark || '暂无说明'
    );

  return (
    <Tooltip title={title}>
      <span style={{ cursor: 'help', textDecoration: 'underline dotted' }}>{record.configKey}</span>
    </Tooltip>
  );
}

/** 统一渲染配置值：空值统一展示为「未设置」标签；AI 并发数空值展示为「不限制」 */
function ValueCell({ record }: { record: ConfigItem }) {
  const v = record.configValue;
  if (v === '') {
    if (record.configKey === AI_CONCURRENT_KEY) {
      return <Tag color="default">不限制</Tag>;
    }
    return <Tag color="default">未设置</Tag>;
  }
  return <span>{v}</span>;
}

export default function ConfigPage() {
  const [data, setData] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ConfigItem | null>(null);
  const [form] = Form.useForm<FormValues>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await configApi.list());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setOpen(true);
  };

  const openEdit = (record: ConfigItem) => {
    setEditing(record);
    form.setFieldsValue({
      configKey: record.configKey,
      configValue: record.configValue,
      remark: record.remark ?? undefined,
    });
    setOpen(true);
  };

  const isAiConcurrent = (key?: string) => key === AI_CONCURRENT_KEY;

  const submit = async () => {
    const values = await form.validateFields();
    if (editing) {
      await configApi.update(editing.configKey, {
        configValue: values.configValue,
        remark: values.remark?.trim() || null,
      });
      message.success('保存成功');
    } else {
      await configApi.create({
        configKey: values.configKey!.trim(),
        configValue: values.configValue,
        remark: values.remark?.trim() || null,
      });
      message.success('创建成功');
    }
    setOpen(false);
    void load();
  };

  const handleDelete = async (record: ConfigItem) => {
    await configApi.remove(record.configKey);
    message.success('删除成功');
    void load();
  };

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="系统配置"
        description="维护日常运行变量。支持新增、编辑、删除 key-value 配置项，修改保存后立即生效。鼠标悬停在配置键上可查看说明。"
      />

      <Card
        className="page-card"
        title="配置项列表"
        extra={
          <Space>
            <Auth perms="system:config:add">
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                新增配置
              </Button>
            </Auth>
            <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
              刷新
            </Button>
          </Space>
        }
      >
        <Table<ConfigItem>
          rowKey="id"
          loading={loading}
          dataSource={data}
          pagination={false}
          columns={[
            {
              title: '配置键',
              dataIndex: 'configKey',
              width: 280,
              render: (_v, record) => <KeyCell record={record} />,
            },
            {
              title: '配置值',
              dataIndex: 'configValue',
              width: 220,
              render: (_v, record) => <ValueCell record={record} />,
            },
            { title: '说明', dataIndex: 'remark', render: (v: string | null) => v || '-' },
            { title: '更新时间', dataIndex: 'updatedAt', width: 170 },
            {
              title: '操作',
              width: 160,
              render: (_, record) => (
                <Space size={4}>
                  <Auth perms="system:config:edit">
                    <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
                      编辑
                    </Button>
                  </Auth>
                  <Auth perms="system:config:remove">
                    <Popconfirm
                      title="确定删除该配置？"
                      description={`配置键：${record.configKey}`}
                      onConfirm={() => void handleDelete(record)}
                      okText="删除"
                      cancelText="取消"
                    >
                      <Button type="link" danger size="small" icon={<DeleteOutlined />}>
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
        title={editing ? '编辑配置' : '新增配置'}
        onCancel={() => setOpen(false)}
        onOk={submit}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="configKey"
            label="配置键"
            rules={[
              { required: true, message: '请输入配置键' },
              { max: 100, message: '配置键最多 100 字符' },
              { pattern: /^[a-zA-Z0-9._-]+$/, message: '配置键仅允许字母、数字、点、下划线、中划线' },
            ]}
          >
            <Input disabled={!!editing} placeholder="如 ai.concurrent.parent.limit" />
          </Form.Item>
          <Form.Item
            name="configValue"
            label="配置值"
            rules={[
              { required: false },
              { max: 500, message: '配置值最多 500 字符' },
              {
                validator: (_rule, value: string | undefined) => {
                  const key = form.getFieldValue('configKey');
                  if (!isAiConcurrent(key)) return Promise.resolve();
                  if (value === undefined || value === '') return Promise.resolve();
                  const n = Number(value);
                  if (!Number.isInteger(n) || n <= 0) {
                    return Promise.reject(new Error('AI 任务并发数须为正整数，或留空表示不限制'));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input
              placeholder={isAiConcurrent(form.getFieldValue('configKey')) ? '留空表示不限制' : '请输入配置值'}
            />
          </Form.Item>
          <Form.Item
            name="remark"
            label="说明"
            rules={[{ max: 255, message: '说明最多 255 字符' }]}
          >
            <Input.TextArea rows={2} placeholder="选填，用于说明该配置项作用（会显示在配置键的悬停提示中）" />
          </Form.Item>
          {isAiConcurrent(form.getFieldValue('configKey')) && (
            <Alert
              type="info"
              showIcon
              message="字段作用"
              description="该值控制同时允许的父级 AI 任务 AICoding 并发数。留空表示不限制；填写正整数（如 2）表示最多允许 2 个任务同时 AICoding。"
              style={{ marginTop: 8 }}
            />
          )}
        </Form>
      </Modal>
    </>
  );
}
