import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, Form, Input, Row, Select, Space, message } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { userApi } from '@/api';
import { useAuthStore } from '@/store/useAuthStore';

const PHONE_PATTERN = /^1[3-9]\d{9}$/;

interface InfoForm {
  nickname: string;
  phone?: string;
  email?: string;
  gitKey?: string;
  gender: number;
}

export default function UserInfoPage() {
  const [form] = Form.useForm<InfoForm>();
  const [saving, setSaving] = useState(false);

  const user = useAuthStore((s) => s.user);
  const loadProfile = useAuthStore((s) => s.loadProfile);

  const initialValues = useMemo<InfoForm>(
    () => ({
      nickname: user?.nickname ?? '',
      phone: user?.phone ?? undefined,
      email: user?.email ?? undefined,
      gitKey: user?.gitKey ?? undefined,
      gender: user?.gender ?? 0,
    }),
    [user],
  );

  // 进入页面或登录用户变化时回填表单
  useEffect(() => {
    form.setFieldsValue(initialValues);
  }, [form, initialValues]);

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await userApi.updateProfile({
        nickname: values.nickname.trim(),
        phone: values.phone?.trim() ? values.phone.trim() : null,
        email: values.email?.trim() ? values.email.trim() : null,
        gitKey: values.gitKey?.trim() ? values.gitKey.trim() : null,
        gender: values.gender,
      });
      // 刷新全局 profile，使顶部昵称等同步更新
      await loadProfile();
      message.success('保存成功');
    } catch (err) {
      if ((err as { isAxiosError?: boolean })?.isAxiosError || (err as { response?: unknown })?.response) {
        // 错误已由响应拦截器提示，这里不重复弹
      } else {
        message.error('请检查表单填写是否合法');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="page-card" title="用户信息">
      <Form<InfoForm>
        form={form}
        layout="vertical"
        initialValues={initialValues}
        style={{ maxWidth: 560 }}
      >
        <Form.Item label="登录账号">
          <Input value={user?.username} disabled />
        </Form.Item>

        <Form.Item
          label="用户姓名"
          name="nickname"
          rules={[{ required: true, message: '请输入用户姓名' }, { max: 50, message: '不超过 50 个字符' }]}
        >
          <Input placeholder="请输入用户姓名" maxLength={50} />
        </Form.Item>

        <Form.Item
          label="手机号"
          name="phone"
          rules={[
            {
              validator: (_rule, value?: string) =>
                !value || PHONE_PATTERN.test(value) ? Promise.resolve() : Promise.reject(new Error('手机号格式不正确')),
            },
          ]}
        >
          <Input placeholder="请输入手机号（选填）" maxLength={20} />
        </Form.Item>

        <Form.Item
          label="邮箱"
          name="email"
          rules={[{ type: 'email', message: '邮箱格式不正确' }]}
        >
          <Input placeholder="请输入邮箱（选填）" maxLength={100} />
        </Form.Item>

        <Form.Item label="性别" name="gender">
          <Select
            options={[
              { label: '未知', value: 0 },
              { label: '男', value: 1 },
              { label: '女', value: 2 },
            ]}
          />
        </Form.Item>

        <Form.Item
          label="Git 密钥"
          name="gitKey"
          extra="用于代码仓库鉴权的密钥（SSH 公钥 / 访问令牌等），长度上限 500 字符"
          rules={[{ max: 500, message: 'Git 密钥不能超过 500 字符' }]}
        >
          <Input.TextArea placeholder="请输入 Git 密钥（选填）" rows={4} maxLength={500} showCount />
        </Form.Item>

        <Row>
          <Col>
            <Space>
              <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
                保存
              </Button>
              <Button onClick={() => form.resetFields()} disabled={saving}>
                重置
              </Button>
            </Space>
          </Col>
        </Row>
      </Form>
    </Card>
  );
}
