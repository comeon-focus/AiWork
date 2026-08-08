import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/store/useAuthStore';

const { Title, Text } = Typography;

interface LoginForm {
  username: string;
  password: string;
}

const DEMO_ACCOUNTS = [
  ['admin', 'Admin@123', '超级管理员 · 全部数据'],
  ['manager', 'Test@123', '研发主管 · 本部门及以下'],
  ['zhangsan', 'Test@123', '普通员工 · 仅本人'],
  ['wangwu', 'Test@123', '跨部门协作 · 自定义部门'],
];

export default function LoginPage() {
  const [form] = Form.useForm<LoginForm>();
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const location = useLocation();

  const redirect =
    (location.state as { from?: string } | null)?.from ??
    new URLSearchParams(location.search).get('redirect') ??
    '/';

  const onFinish = async (values: LoginForm) => {
    setLoading(true);
    try {
      await login(values.username, values.password);
      navigate(redirect, { replace: true });
    } catch {
      // 错误提示已由 axios 拦截器统一处理
    } finally {
      setLoading(false);
    }
  };

  const fill = (username: string, password: string) => {
    form.setFieldsValue({ username, password });
  };

  return (
    <div
      style={{
        height: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(135deg, #1677ff 0%, #0958d9 100%)',
      }}
    >
      <Card style={{ width: 420 }} styles={{ body: { padding: 32 } }}>
        <Title level={3} style={{ textAlign: 'center', marginBottom: 4 }}>
          零零七管理平台
        </Title>
        <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 24 }}>
          页面权限 · 操作权限 · 数据权限
        </Text>

        <Form form={form} onFinish={onFinish} size="large" initialValues={{ username: 'admin', password: 'Admin@123' }}>
          <Form.Item name="username" rules={[{ required: true, message: '请输入账号' }]}>
            <Input prefix={<UserOutlined />} placeholder="账号" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="current-password" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              登录
            </Button>
          </Form.Item>
        </Form>

        <Alert
          type="info"
          message="演示账号（点击填充）"
          description={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {DEMO_ACCOUNTS.map(([u, p, desc]) => (
                <a key={u} onClick={() => fill(u!, p!)}>
                  {u} / {p} —— {desc}
                </a>
              ))}
            </div>
          }
        />
      </Card>
    </div>
  );
}
