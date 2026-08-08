import { useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Breadcrumb, Dropdown, Layout, Menu, Modal, Tag, Watermark, theme, type MenuProps } from 'antd';
import {
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/store/useAuthStore';
import { DynamicIcon } from '@/components/DynamicIcon';
import type { RouteItem } from '@/api/types';

const { Header, Sider, Content } = Layout;

type MenuItem = Required<MenuProps>['items'][number];

/** 后端菜单树 → antd Menu items，隐藏节点与无子节点的空目录都会被剔除 */
function toMenuItems(nodes: RouteItem[]): MenuItem[] {
  return nodes
    .filter((node) => !node.meta.hidden)
    .map((node): MenuItem | null => {
      const children = node.children?.length ? toMenuItems(node.children) : [];
      if (children.length > 0) {
        return {
          key: node.path || `catalog-${node.id}`,
          icon: <DynamicIcon name={node.meta.icon} />,
          label: node.meta.title,
          children,
        } satisfies MenuItem;
      }
      if (!node.component) return null;
      return {
        key: node.path,
        icon: <DynamicIcon name={node.meta.icon} />,
        label: <Link to={node.path}>{node.meta.title}</Link>,
      } satisfies MenuItem;
    })
    .filter((item): item is MenuItem => item !== null);
}

/** 找出当前路径在菜单树中的层级链，用于面包屑与展开父级 */
function findChain(nodes: RouteItem[], path: string, trail: RouteItem[] = []): RouteItem[] | null {
  for (const node of nodes) {
    const next = [...trail, node];
    if (node.path === path) return next;
    if (node.children?.length) {
      const found = findChain(node.children, path, next);
      if (found) return found;
    }
  }
  return null;
}

export default function BasicLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { token } = theme.useToken();

  const routes = useAuthStore((s) => s.routes);
  const user = useAuthStore((s) => s.user);
  const roles = useAuthStore((s) => s.roles);
  const logout = useAuthStore((s) => s.logout);

  const menuItems = useMemo(() => toMenuItems(routes), [routes]);
  const chain = useMemo(() => findChain(routes, location.pathname) ?? [], [routes, location.pathname]);
  const openKeys = useMemo(
    () => chain.slice(0, -1).map((n) => n.path || `catalog-${n.id}`),
    [chain],
  );

  const handleLogout = () => {
    Modal.confirm({
      title: '确认退出登录？',
      okText: '退出',
      cancelText: '取消',
      onOk: async () => {
        await logout();
        navigate('/login', { replace: true });
      },
    });
  };

  const userMenu: MenuProps['items'] = [
    { key: 'name', label: `${user?.nickname ?? ''}（${user?.username ?? ''}）`, disabled: true },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: handleLogout },
  ];

  // 页面水印：展示当前登录用户，便于操作留痕
  const watermarkContent = user ? [`${user.nickname}`, `${user.username}`] : ['零零七管理平台'];

  return (
    <Layout style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          height: 60,
          lineHeight: '60px',
          padding: '0 24px',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              background: 'linear-gradient(135deg,#1677ff,#0958d9)',
            }}
          />
          <span style={{ color: '#1f1f1f', fontWeight: 700, fontSize: 18, letterSpacing: 1 }}>
            零零七管理平台
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {roles.map((r) => (
            <Tag key={r} color={r === 'admin' ? 'gold' : 'blue'}>
              {r}
            </Tag>
          ))}
          <Dropdown menu={{ items: userMenu }} placement="bottomRight">
            <span
              className="user-box"
              style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 12px',
                borderRadius: 20,
              }}
            >
              <Avatar
                size="small"
                icon={<UserOutlined />}
                src={user?.avatar ?? undefined}
                style={{ background: '#1677ff' }}
              />
              <span style={{ color: '#1f1f1f', fontSize: 14 }}>{user?.nickname}</span>
            </span>
          </Dropdown>
        </div>
      </Header>

      <Layout>
        <Sider
          trigger={null}
          collapsible
          collapsed={collapsed}
          theme="dark"
          width={220}
          style={{
            position: 'sticky',
            top: 60,
            alignSelf: 'flex-start',
            height: 'calc(100vh - 60px)',
            overflow: 'visible',
            boxShadow: '2px 0 8px rgba(0,0,0,0.15)',
          }}
        >
          <Menu
            theme="dark"
            mode="inline"
            items={menuItems}
            selectedKeys={[location.pathname]}
            defaultOpenKeys={openKeys}
            key={openKeys.join('|')}
          />
          <button
            type="button"
            className="sider-trigger"
            onClick={() => setCollapsed(!collapsed)}
            aria-label="切换菜单"
            style={{
              position: 'absolute',
              top: '50%',
              right: -13,
              transform: 'translateY(-50%)',
              width: 26,
              height: 26,
              padding: 0,
              borderRadius: '50%',
              border: `1px solid ${token.colorBorderSecondary}`,
              background: '#fff',
              color: token.colorPrimary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              zIndex: 10,
            }}
          >
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </button>
        </Sider>

        <Content style={{ margin: 16 }}>
          <Watermark
            content={watermarkContent}
            zIndex={10}
            gap={[80, 80]}
            font={{ color: 'rgba(0, 0, 0, 0.06)', fontSize: 14 }}
            style={{ minHeight: 'calc(100vh - 92px)' }}
          >
            <div
              style={{
                background: '#fff',
                borderRadius: 8,
                padding: '12px 16px',
                marginBottom: 16,
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              }}
            >
              <Breadcrumb items={[{ title: '首页' }, ...chain.map((n) => ({ title: n.meta.title }))]} />
            </div>
            <Outlet />
          </Watermark>
        </Content>
      </Layout>
    </Layout>
  );
}
