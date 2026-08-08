import '@ant-design/v5-patch-for-react-19';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App as AntdApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import App from './App';
import './styles/global.css';

dayjs.locale('zh-cn');

// 全局中文：确认按钮统一使用「确认 / 取消」（覆盖 antd 默认的「确定 / 取消」）
const antdLocale = {
  ...zhCN,
  Modal: { ...zhCN.Modal, okText: '确认', cancelText: '取消' },
  Popconfirm: { ...zhCN.Popconfirm, okText: '确认', cancelText: '取消' },
  // 分页「每页条数」切换器文案明确中文化（条/页）
  Pagination: { ...(zhCN.Pagination as object), items_per_page: '条/页' },
} as typeof zhCN;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider locale={antdLocale} theme={{ token: { colorPrimary: '#1677ff', borderRadius: 6 } }}>
      <AntdApp>
        <App />
      </AntdApp>
    </ConfigProvider>
  </StrictMode>,
);
