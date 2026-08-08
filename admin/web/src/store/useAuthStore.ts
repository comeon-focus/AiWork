import { create } from 'zustand';
import { authApi } from '@/api';
import type { Profile, ProfileUser, RoleScope, RouteItem } from '@/api/types';
import { tokenStore } from '@/utils/token';

interface AuthState {
  hasToken: boolean;
  /** profile 是否已拉取完成，动态路由要等它 */
  ready: boolean;
  user: ProfileUser | null;
  roles: string[];
  /** 操作权限码，超管为 ['*'] */
  perms: string[];
  /** 页面权限：后端下发的菜单树 */
  routes: RouteItem[];
  /** 数据权限范围：每个角色一条 */
  dataScopes: RoleScope[];

  login: (username: string, password: string) => Promise<void>;
  loadProfile: () => Promise<void>;
  logout: () => Promise<void>;
  reset: () => void;
}

const emptyProfile = { user: null, roles: [], perms: [], routes: [], dataScopes: [] };

export const useAuthStore = create<AuthState>((set) => ({
  hasToken: Boolean(tokenStore.getAccess()),
  ready: false,
  ...emptyProfile,

  async login(username, password) {
    const tokens = await authApi.login({ username, password });
    tokenStore.set(tokens.accessToken, tokens.refreshToken);
    set({ hasToken: true, ready: false });
  },

  async loadProfile() {
    const profile: Profile = await authApi.profile();
    set({
      user: profile.user,
      roles: profile.roles,
      perms: profile.perms,
      routes: profile.routes,
      dataScopes: profile.dataScopes,
      ready: true,
      hasToken: true,
    });
  },

  async logout() {
    try {
      await authApi.logout(tokenStore.getRefresh());
    } finally {
      tokenStore.clear();
      set({ hasToken: false, ready: false, ...emptyProfile });
    }
  },

  reset() {
    tokenStore.clear();
    set({ hasToken: false, ready: false, ...emptyProfile });
  },
}));

/** 权限判断的唯一入口，超管的 '*' 在这里统一处理 */
export function checkPerm(perms: string[], code?: string | string[]): boolean {
  if (!code) return true;
  if (perms.includes('*')) return true;
  const codes = Array.isArray(code) ? code : [code];
  return codes.some((c) => perms.includes(c));
}
