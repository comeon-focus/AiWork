import { http, type PageResult } from './request';
import type {
  AITaskItem,
  AITaskInput,
  AITaskStatus,
  AiSubTaskItem,
  AiSubTaskInput,
  CodeRepoItem,
  DataSimProjectItem,
  DataSimInterfaceItem,
  DataTaskItem,
  DataTaskInterfaceItem,
  TaskUserItem,
  DeptItem,
  LoginLogItem,
  MenuItem,
  OperLogItem,
  Profile,
  RequirementFileInput,
  RequirementItem,
  RequirementFileItem,
  DemandFileInput,
  DemandItem,
  DemandOption,
  RoleItem,
  SmartDocItem,
  SmartDocInput,
  TokenPair,
  UserItem,
} from './types';

/** AI 润色为长耗时任务，单独放宽超时时间 */
const AI_TIMEOUT = 300000;

export const authApi = {
  login: (body: { username: string; password: string }) => http.post<TokenPair>('/auth/login', body),
  logout: (refreshToken: string | null) => http.post<null>('/auth/logout', { refreshToken }),
  profile: () => http.get<Profile>('/auth/profile'),
};

export interface UserQuery {
  username?: string;
  nickname?: string;
  phone?: string;
  status?: number;
  deptId?: number;
  page?: number;
  pageSize?: number;
}

export const userApi = {
  list: (params: UserQuery) => http.get<PageResult<UserItem>>('/users', params),
  detail: (id: number) => http.get<UserItem>(`/users/${id}`),
  create: (body: Partial<UserItem> & { password: string }) => http.post<UserItem>('/users', body),
  update: (id: number, body: Partial<UserItem>) => http.put<UserItem>(`/users/${id}`, body),
  remove: (id: number) => http.delete<null>(`/users/${id}`),
  resetPassword: (id: number, password: string) => http.put<null>(`/users/${id}/password`, { password }),
  updateProfile: (body: { nickname: string; email?: string | null; phone?: string | null; gender: number }) =>
    http.put<UserItem>('/users/profile', body),
  changePassword: (body: { oldPassword: string; newPassword: string }) =>
    http.put<null>('/users/profile/password', body),
};

export const roleApi = {
  list: (params: { name?: string; roleKey?: string; status?: number; page?: number; pageSize?: number }) =>
    http.get<PageResult<RoleItem>>('/roles', params),
  all: () => http.get<Pick<RoleItem, 'id' | 'name' | 'roleKey'>[]>('/roles/all'),
  detail: (id: number) => http.get<RoleItem>(`/roles/${id}`),
  create: (body: Partial<RoleItem>) => http.post<RoleItem>('/roles', body),
  update: (id: number, body: Partial<RoleItem>) => http.put<RoleItem>(`/roles/${id}`, body),
  remove: (id: number) => http.delete<null>(`/roles/${id}`),
};

export const menuApi = {
  tree: (params?: { name?: string; status?: number }) => http.get<MenuItem[]>('/menus/tree', params),
  create: (body: Partial<MenuItem>) => http.post<MenuItem>('/menus', body),
  update: (id: number, body: Partial<MenuItem>) => http.put<MenuItem>(`/menus/${id}`, body),
  remove: (id: number) => http.delete<null>(`/menus/${id}`),
};

export const deptApi = {
  tree: (params?: { name?: string; status?: number }) => http.get<DeptItem[]>('/depts/tree', params),
  create: (body: Partial<DeptItem>) => http.post<DeptItem>('/depts', body),
  update: (id: number, body: Partial<DeptItem>) => http.put<DeptItem>(`/depts/${id}`, body),
  remove: (id: number) => http.delete<null>(`/depts/${id}`),
};

export const codeRepoApi = {
  list: (params?: { name?: string }) => http.get<CodeRepoItem[]>('/repos', params),
  create: (body: Partial<CodeRepoItem>) => http.post<CodeRepoItem>('/repos', body),
  update: (id: number, body: Partial<CodeRepoItem>) => http.put<CodeRepoItem>(`/repos/${id}`, body),
  remove: (id: number) => http.delete<null>(`/repos/${id}`),
};

export const requirementApi = {
  list: (params?: { title?: string }) => http.get<RequirementItem[]>('/requirements', params),
  upload: (formData: FormData) => http.post<RequirementFileItem[]>('/requirements/upload', formData),
  create: (body: { title: string; content?: string | null; files?: RequirementFileInput[]; demandIds?: number[]; repoId?: number | null }) =>
    http.post<RequirementItem>('/requirements', body),
  update: (
    id: number,
    body: { title: string; content?: string | null; files?: RequirementFileInput[]; demandIds?: number[]; repoId?: number | null },
  ) => http.put<RequirementItem>(`/requirements/${id}`, body),
  remove: (id: number) => http.delete<null>(`/requirements/${id}`),
  aiOptimize: (id: number) =>
    http.post<SmartDocItem>(`/requirements/${id}/ai-optimize`, undefined, { timeout: AI_TIMEOUT }),
  /** 关联需求下拉候选 */
  demandOptions: () => http.post<DemandOption[]>('/requirements/demand-options'),
};

export const demandApi = {
  list: (params?: { title?: string }) => http.get<DemandItem[]>('/demands', params),
  upload: (formData: FormData) => http.post<DemandFileInput[]>('/demands/upload', formData),
  create: (body: { title: string; summary?: string | null; content?: string | null; status?: string; files?: DemandFileInput[] }) =>
    http.post<DemandItem>('/demands', body),
  update: (
    id: number,
    body: { title: string; summary?: string | null; content?: string | null; status?: string; files?: DemandFileInput[] },
  ) => http.put<DemandItem>(`/demands/${id}`, body),
  remove: (id: number) => http.delete<null>(`/demands/${id}`),
};

export const aiTaskApi = {
  list: (params?: { title?: string }) => http.get<AITaskItem[]>('/ai-tasks', params),
  create: (body: AITaskInput) => http.post<AITaskItem>('/ai-tasks', body),
  update: (id: number, body: AITaskInput) => http.put<AITaskItem>(`/ai-tasks/${id}`, body),
  updateStatus: (id: number, status: AITaskStatus) =>
    http.patch<AITaskItem>(`/ai-tasks/${id}/status`, { status }),
  remove: (id: number) => http.delete<null>(`/ai-tasks/${id}`),
};

export const aiSubTaskApi = {
  list: (parentId: number, params?: { title?: string }) =>
    http.get<AiSubTaskItem[]>('/ai-sub-tasks', { parentId, ...params }),
  create: (body: AiSubTaskInput) => http.post<AiSubTaskItem>('/ai-sub-tasks', body),
  update: (id: number, body: AiSubTaskInput) => http.put<AiSubTaskItem>(`/ai-sub-tasks/${id}`, body),
  updateStatus: (id: number, status: AITaskStatus) =>
    http.patch<AiSubTaskItem>(`/ai-sub-tasks/${id}/status`, { status }),
  remove: (id: number) => http.delete<null>(`/ai-sub-tasks/${id}`),
};

export const smartDocApi = {
  list: (params?: { title?: string }) => http.get<SmartDocItem[]>('/smart-docs', params),
  detail: (id: number) => http.get<SmartDocItem>(`/smart-docs/${id}`),
  update: (id: number, body: SmartDocInput) => http.put<SmartDocItem>(`/smart-docs/${id}`, body),
  remove: (id: number) => http.delete<null>(`/smart-docs/${id}`),
};

export const dataSimApi = {
  list: (params?: { name?: string }) => http.get<DataSimProjectItem[]>('/data-sim', params),
  create: (body: { name: string }) => http.post<DataSimProjectItem>('/data-sim', body),
  update: (id: number, body: { name: string }) => http.put<DataSimProjectItem>(`/data-sim/${id}`, body),
  remove: (id: number) => http.delete<null>(`/data-sim/${id}`),
};

export const dataSimInterfaceApi = {
  list: (projectId: string, params?: { keyword?: string; page?: number; pageSize?: number }) =>
    http.get<PageResult<DataSimInterfaceItem>>('/data-sim-interfaces', { projectId, ...params }),
  create: (body: { projectId: string; description: string; method: string; path: string; responseData?: string | null }) =>
    http.post<DataSimInterfaceItem>('/data-sim-interfaces', body),
  update: (
    id: number,
    body: { projectId: string; description: string; method: string; path: string; responseData?: string | null },
  ) => http.put<DataSimInterfaceItem>(`/data-sim-interfaces/${id}`, body),
  remove: (id: number) => http.delete<null>(`/data-sim-interfaces/${id}`),
  import: (
    projectId: string,
    items: { description: string; method: string; path: string; responseData?: string | null }[],
  ) => http.post<{ imported: number; updated: number; failed: number; errors: { index: number; reason: string }[] }>(
    '/data-sim-interfaces/import',
    { projectId, items },
  ),
};

export const dataTaskApi = {
  list: (params?: { keyword?: string; status?: number; page?: number; pageSize?: number }) =>
    http.get<PageResult<DataTaskItem>>('/data-tasks', params),
  create: (body: { name: string; projectId: string; interfaceCount: number; userIds?: number[] }) =>
    http.post<DataTaskItem>('/data-tasks', body),
  update: (
    id: number,
    body: { name?: string; projectId?: string; interfaceCount?: number; userIds?: number[] },
  ) => http.put<DataTaskItem>(`/data-tasks/${id}`, body),
  remove: (id: number) => http.delete<null>(`/data-tasks/${id}`),
  changeStatus: (id: number, status: number) => http.put<DataTaskItem>(`/data-tasks/${id}/status`, { status }),
  sync: (id: number) => http.post<{ imported: number; updated: number }>(`/data-tasks/${id}/sync`),
  /** 责任人候选（全部用户） */
  listUsers: () => http.get<TaskUserItem[]>('/data-tasks/users'),
  listInterfaces: (taskId: number, params?: { keyword?: string; page?: number; pageSize?: number }) =>
    http.get<PageResult<DataTaskInterfaceItem>>(`/data-tasks/${taskId}/interfaces`, params),
  createInterface: (
    taskId: number,
    body: { description: string; method: string; path: string; responseData?: string | null },
  ) => http.post<DataTaskInterfaceItem>(`/data-tasks/${taskId}/interfaces`, body),
  updateInterface: (
    taskId: number,
    interfaceId: number,
    body: { description: string; method: string; path: string; responseData?: string | null },
  ) => http.put<DataTaskInterfaceItem>(`/data-tasks/${taskId}/interfaces/${interfaceId}`, body),
  removeInterface: (taskId: number, interfaceId: number) =>
    http.delete<null>(`/data-tasks/${taskId}/interfaces/${interfaceId}`),
};

export const logApi = {
  loginLogs: (params: Record<string, unknown>) => http.get<PageResult<LoginLogItem>>('/logs/login', params),
  clearLoginLogs: () => http.delete<null>('/logs/login'),
  operLogs: (params: Record<string, unknown>) => http.get<PageResult<OperLogItem>>('/logs/oper', params),
  clearOperLogs: () => http.delete<null>('/logs/oper'),
};
