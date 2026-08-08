export interface RouteMeta {
  title: string;
  icon: string | null;
  keepAlive: boolean;
  hidden: boolean;
}

export interface RouteItem {
  id: number;
  parentId: number;
  name: string;
  path: string;
  component: string | null;
  redirect: string | null;
  meta: RouteMeta;
  children: RouteItem[];
}

export interface ProfileUser {
  id: number;
  username: string;
  nickname: string;
  avatar: string | null;
  email: string | null;
  phone: string | null;
  deptId: number | null;
  isSuper: boolean;
}

export interface RoleScope {
  scope: DataScope;
  customDeptIds: number[];
}

export interface Profile {
  user: ProfileUser;
  roles: string[];
  perms: string[];
  routes: RouteItem[];
  dataScopes: RoleScope[];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export type DataScope = 'ALL' | 'DEPT_AND_CHILD' | 'DEPT' | 'SELF' | 'CUSTOM';
export type MenuType = 'CATALOG' | 'MENU' | 'BUTTON';

export interface DeptItem {
  id: number;
  parentId: number;
  ancestors: string;
  name: string;
  orderNum: number;
  leader: string | null;
  phone: string | null;
  status: number;
  children?: DeptItem[];
}

export interface RoleItem {
  id: number;
  name: string;
  roleKey: string;
  sort: number;
  dataScope: DataScope;
  status: number;
  remark: string | null;
  createdAt: string;
  menuIds?: number[];
  deptIds?: number[];
  repoIds?: number[];
}

export interface CodeRepoItem {
  id: number;
  name: string;
  address: string | null;
  remark: string | null;
  status: number;
  sort: number;
  createdAt: string;
}

export interface RequirementFileItem {
  id: number;
  requirementId: number;
  fileName: string;
  fileType: 'doc' | 'image';
  kind: 'requirement' | 'design';
  url: string;
  createdAt: string;
}

/** 提交需求时携带的附件（不含服务端生成的 id 等字段） */
export interface RequirementFileInput {
  fileName: string;
  fileType: 'doc' | 'image';
  kind: 'requirement' | 'design';
  url: string;
}

export interface RequirementItem {
  id: number;
  title: string;
  summary: string | null;
  content: string | null;
  creatorId: number | null;
  creatorName: string | null;
  files?: RequirementFileItem[];
  /** 关联的需求列表（多对多） */
  demands?: { id: number; title: string }[];
  /** 关联的代码库 id（单关联） */
  repoId?: number | null;
  /** 关联的代码库（单关联） */
  codeRepo?: { id: number; name: string } | null;
  createdAt: string;
}

export interface DemandFileItem {
  id: number;
  demandId: number;
  fileName: string;
  fileType: 'doc' | 'image';
  url: string;
  createdAt: string;
}

/** 提交需求列表时携带的附件 */
export interface DemandFileInput {
  fileName: string;
  fileType: 'doc' | 'image';
  url: string;
}

export interface DemandItem {
  id: number;
  title: string;
  summary: string | null;
  content: string | null;
  /** 需求状态：待开始 / 开发中 / 已完成 / 挂起中 / 无效需求 */
  status: string;
  creatorId: number | null;
  creatorName: string | null;
  files?: DemandFileItem[];
  /** 关联了本需求的任务条数 */
  taskCount: number;
  createdAt: string;
  updatedAt: string;
}

/** 任务列表「关联需求」下拉候选 */
export interface DemandOption {
  id: number;
  title: string;
}

/** AI 任务（智能编排） */
export type AITaskStatus = '待开始' | '进行中' | '已结束';

export const AI_TASK_STATUS: AITaskStatus[] = ['待开始', '进行中', '已结束'];

/** 状态对应 Tag 颜色 */
export const AI_TASK_STATUS_COLOR: Record<AITaskStatus, string> = {
  待开始: 'default',
  进行中: 'processing',
  已结束: 'success',
};

export interface AITaskItem {
  id: number;
  title: string;
  summary: string | null;
  /** 会话 ID：创建时自动生成的 16 位 base62 唯一标识 */
  sessionId: string;
  /** 关联智能文档 id（单关联） */
  smartDocId?: number | null;
  /** 关联智能文档（单关联） */
  smartDoc?: { id: number; title: string } | null;
  /** 代码分支 */
  branch?: string | null;
  /** 任务状态：待开始 / 进行中 / 已结束 */
  status: AITaskStatus;
  creatorId: number | null;
  creatorName: string | null;
  createdAt: string;
}

export interface AITaskInput {
  title: string;
  summary?: string | null;
  smartDocId?: number | null;
  branch?: string | null;
  status?: AITaskStatus;
}

/** AI 子任务（挂在某个 AI 任务下，字段与 AI 任务一致） */
export interface AiSubTaskItem {
  id: number;
  /** 所属 AI 任务 id */
  parentId: number;
  title: string;
  summary: string | null;
  /** 会话 ID：继承父任务 sessionId */
  sessionId?: string | null;
  /** 关联智能文档 id（单关联） */
  smartDocId?: number | null;
  /** 关联智能文档（单关联） */
  smartDoc?: { id: number; title: string } | null;
  /** 代码分支 */
  branch?: string | null;
  /** 任务状态：待开始 / 进行中 / 已结束 */
  status: AITaskStatus;
  creatorId: number | null;
  creatorName: string | null;
  createdAt: string;
}

export interface AiSubTaskInput {
  parentId: number;
  title: string;
  summary?: string | null;
  /** 会话 ID：继承父任务 sessionId（只读） */
  sessionId?: string | null;
  smartDocId?: number | null;
  branch?: string | null;
  status?: AITaskStatus;
}

/** 智能文档：需求经 AI 润色后生成的 Markdown 文档 */
export interface SmartDocItem {
  id: number;
  requirementId: number | null;
  title: string;
  summary: string | null;
  content: string | null;
  /** 本次 AI 处理消耗的输入 token */
  inputTokens: number;
  /** 本次 AI 处理消耗的输出 token */
  outputTokens: number;
  model: string | null;
  /** 关联的代码库 id（AI 优化时从需求带入） */
  repoId?: number | null;
  /** 关联的代码库 */
  codeRepo?: { id: number; name: string } | null;
  creatorId: number | null;
  creatorName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SmartDocInput {
  title: string;
  summary?: string | null;
  content?: string | null;
  /** 关联代码库 id（可空） */
  repoId?: number | null;
}

/** 数据模拟项目（虚拟空间） */
export interface DataSimProjectItem {
  id: number;
  /** 业务侧生成的唯一标识，创建时自动生成、不可编辑 */
  projectId: string;
  name: string;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 数据模拟接口（隶属于某个项目） */
export interface DataSimInterfaceItem {
  id: number;
  projectId: string;
  description: string;
  method: string;
  path: string;
  responseData: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 任务下的责任人（用户） */
export interface TaskUserItem {
  id: number;
  nickname: string;
}

/** 数据任务（虚拟空间 / 数据任务） */
export interface DataTaskItem {
  id: number;
  name: string;
  projectId: string;
  projectName: string | null;
  /** 接口任务数量（目标） */
  interfaceCount: number;
  /** 0=进行中 1=成功 2=失败 */
  status: number;
  /** 完成进度（0~100） */
  progress: number;
  /** 已创建接口数 */
  createdCount: number;
  users: TaskUserItem[];
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 数据任务下的接口 */
export interface DataTaskInterfaceItem {
  id: number;
  taskId: number;
  description: string;
  method: string;
  path: string;
  responseData: string | null;
  /** 是否已同步到关联项目 */
  synced: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 数据任务状态枚举 */
export const TASK_STATUS = {
  IN_PROGRESS: 0,
  SUCCESS: 1,
  FAILED: 2,
} as const;

export interface MenuItem {
  id: number;
  parentId: number;
  name: string;
  type: MenuType;
  path: string | null;
  component: string | null;
  perms: string | null;
  icon: string | null;
  sort: number;
  visible: number;
  status: number;
  keepAlive: number;
  redirect: string | null;
  children?: MenuItem[];
}

export interface UserItem {
  id: number;
  deptId: number | null;
  username: string;
  nickname: string;
  email: string | null;
  phone: string | null;
  gender: number;
  status: number;
  isSuper: boolean;
  remark: string | null;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  createdAt: string;
  dept?: { id: number; name: string } | null;
  roles?: { id: number; name: string; roleKey: string }[];
  roleIds?: number[];
}

export interface LoginLogItem {
  id: number;
  username: string;
  ip: string | null;
  browser: string | null;
  os: string | null;
  status: number;
  msg: string | null;
  loginAt: string;
}

export interface OperLogItem {
  id: number;
  title: string;
  businessType: string;
  operName: string | null;
  deptName: string | null;
  operUrl: string;
  requestMethod: string;
  operIp: string | null;
  operParam: string | null;
  jsonResult: string | null;
  status: number;
  errorMsg: string | null;
  costTime: number;
  operAt: string;
}
