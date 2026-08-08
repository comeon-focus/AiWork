import { Card, Col, Descriptions, Row, Space, Tag, Typography } from 'antd';
import { useAuthStore } from '@/store/useAuthStore';
import { flattenMenus } from '@/router/dynamic';
import type { DataScope } from '@/api/types';

const { Paragraph, Text } = Typography;

const SCOPE_LABEL: Record<DataScope, string> = {
  ALL: '全部数据',
  DEPT_AND_CHILD: '本部门及以下',
  DEPT: '仅本部门',
  SELF: '仅本人',
  CUSTOM: '自定义部门集合',
};

const SCOPE_COLOR: Record<DataScope, string> = {
  ALL: 'red',
  DEPT_AND_CHILD: 'green',
  DEPT: 'cyan',
  SELF: 'orange',
  CUSTOM: 'purple',
};

export default function Dashboard() {
  const { user, roles, perms, routes, dataScopes } = useAuthStore();
  const pages = flattenMenus(routes).filter((n) => n.component);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card title="当前登录身份">
        <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} bordered size="small">
          <Descriptions.Item label="账号">{user?.username}</Descriptions.Item>
          <Descriptions.Item label="昵称">{user?.nickname}</Descriptions.Item>
          <Descriptions.Item label="是否超管">{user?.isSuper ? '是' : '否'}</Descriptions.Item>
          <Descriptions.Item label="角色" span={3}>
            {roles.map((r) => (
              <Tag key={r} color="blue">
                {r}
              </Tag>
            ))}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card title={`页面权限（${pages.length} 个可访问页面）`} style={{ height: '100%' }}>
            <Paragraph type="secondary">
              由后端根据角色授权的菜单下发，前端据此动态注册路由。未授权的页面即使手动输入地址也不存在。
            </Paragraph>
            <Space wrap>
              {pages.map((p) => (
                <Tag key={p.id}>{p.meta.title}</Tag>
              ))}
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title={`操作权限（${perms.includes('*') ? '全部' : perms.length} 项）`} style={{ height: '100%' }}>
            <Paragraph type="secondary">
              控制按钮显隐，后端对每个写接口做强校验，绕过前端直接调接口同样会被拦截。
            </Paragraph>
            <Space wrap>
              {perms.includes('*') ? (
                <Text strong>* （超级管理员拥有全部操作权限）</Text>
              ) : (
                perms.map((p) => <Tag key={p}>{p}</Tag>)
              )}
            </Space>
          </Card>
        </Col>
      </Row>

      <Card title="数据权限">
        <Paragraph type="secondary" style={{ marginBottom: 12 }}>
          数据权限挂在角色上，进入「用户管理」即可看到效果：不同账号看到的用户列表行数不同。
          多角色时取各角色可见范围的并集。
        </Paragraph>
        <Space wrap>
          {dataScopes.length === 0 ? (
            <Text type="secondary">无</Text>
          ) : (
            dataScopes.map((s, i) => (
              <Tag key={i} color={SCOPE_COLOR[s.scope]}>
                {SCOPE_LABEL[s.scope]}
                {s.scope === 'CUSTOM' && s.customDeptIds.length ? `（${s.customDeptIds.length} 个部门）` : ''}
              </Tag>
            ))
          )}
        </Space>
      </Card>
    </Space>
  );
}
