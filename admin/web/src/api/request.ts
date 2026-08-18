import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { message } from 'antd';
import { tokenStore } from '@/utils/token';

export interface ApiBody<T = unknown> {
  code: number;
  msg: string;
  data: T;
}

export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** access token 过期，需要静默刷新 */
const TOKEN_EXPIRED = 40101;
const UNAUTHORIZED = 40100;
/** 操作需要用户二次确认（如删除含未提交代码的任务）：不弹错误提示，交由调用方弹确认框 */
const NEED_CONFIRM = 40901;

const instance = axios.create({ baseURL: '/api', timeout: 15000 });

/* ── 刷新 token 的并发控制 ────────────────────────────
   多个请求同时 401 时，只发起一次 refresh，其余排队等结果， */
let refreshing = false;
let waiters: ((token: string | null) => void)[] = [];

function notifyWaiters(token: string | null) {
  waiters.forEach((fn) => fn(token));
  waiters = [];
}

function redirectToLogin() {
  tokenStore.clear();
  if (!location.pathname.startsWith('/login')) {
    location.href = `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;
  }
}

async function doRefresh(): Promise<string | null> {
  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) return null;
  try {
    // 用裸 axios，避免走进拦截器造成递归
    const { data } = await axios.post<ApiBody<{ accessToken: string; refreshToken: string }>>(
      '/api/auth/refresh',
      { refreshToken },
    );
    if (data.code !== 0) return null;
    tokenStore.set(data.data.accessToken, data.data.refreshToken);
    return data.data.accessToken;
  } catch {
    return null;
  }
}

instance.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
  const token = tokenStore.getAccess();
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

instance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiBody>) => {
    const body = error.response?.data;
    const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;

    if (body?.code === TOKEN_EXPIRED && original && !original._retried) {
      original._retried = true;

      if (refreshing) {
        const token = await new Promise<string | null>((resolve) => waiters.push(resolve));
        if (!token) return Promise.reject(error);
        original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
        return instance(original);
      }

      refreshing = true;
      const token = await doRefresh();
      refreshing = false;
      notifyWaiters(token);

      if (!token) {
        message.error('登录已过期，请重新登录');
        redirectToLogin();
        return Promise.reject(error);
      }
      original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
      return instance(original);
    }

    if (body?.code === UNAUTHORIZED) {
      message.error(body.msg || '请重新登录');
      redirectToLogin();
      return Promise.reject(error);
    }

    // 需要二次确认的错误：不弹错误提示，交给具体组件弹确认框处理
    if (body?.code === NEED_CONFIRM) {
      return Promise.reject(error);
    }

    message.error(body?.msg || error.message || '请求失败');
    return Promise.reject(error);
  },
);

/** 统一解包：业务码非 0 视为失败 */
async function unwrap<T>(promise: Promise<{ data: ApiBody<T> }>): Promise<T> {
  const { data } = await promise;
  if (data.code !== 0) {
    message.error(data.msg);
    throw new Error(data.msg);
  }
  return data.data;
}

export const http = {
  get: <T>(url: string, params?: unknown, config?: AxiosRequestConfig) =>
    unwrap<T>(instance.get(url, { ...config, params: params as object })),
  post: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) => unwrap<T>(instance.post(url, body, config)),
  put: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) => unwrap<T>(instance.put(url, body, config)),
  patch: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) => unwrap<T>(instance.patch(url, body, config)),
  delete: <T>(url: string, params?: unknown, config?: AxiosRequestConfig) =>
    unwrap<T>(instance.delete(url, { ...config, params: params as object })),
};

export default instance;
