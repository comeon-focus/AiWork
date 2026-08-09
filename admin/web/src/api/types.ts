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

export type AicodingStatus = '暂无' | '编译中' | '编译成功' | '编译失败';

export const AI_CODING_STATUS: AicodingStatus[] = ['暂无', '编译中', '编译成功', '编译失败'];

/** AICoding 状态对应 Tag 颜色 */
export const AI_CODING_STATUS_COLOR: Record<AicodingStatus, string> = {
  暂无: 'default',
  编译中: 'processing',
  编译成功: 'success',
  编译失败: 'error',
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
  /** AICoding 状态：暂无 / 编译中 / 编译成功 / 编译失败 */
  codingStatus: AicodingStatus;
  /** AICoding 编译失败原因（codingStatus 为『编译失败』时展示） */
  codingError?: string | null;
  /** 该任务（含任一子任务）是否正在 AICoding —— 用于禁用按钮 */
  codingActive?: boolean;
  /** 本地代码库目录是否存在 —— 无代码库时不能提交代码 */
  hasWorkspace?: boolean;
  creatorId: number | null;
  creatorName: string | null;
  createdAt: string;
}

/** 提交代码结果 */
export interface AiTaskCommitResult {
  /** 本次提交涉及的文件数 */
  changedFiles: number;
  /** 短 commit hash */
  commitHash: string;
  /** 提交所在分支 */
  branch: string;
  /** 实际使用的 commit 注释 */
  message: string;
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
  /** AICoding 状态：暂无 / 编译中 / 编译成功 / 编译失败 */
  codingStatus: AicodingStatus;
  /** AICoding 编译失败原因（codingStatus 为『编译失败』时展示） */
  codingError?: string | null;
  /** 该任务（含任一子任务）是否正在 AICoding —— 用于禁用按钮 */
  codingActive?: boolean;
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

/* ── 编译详情 ─────────────────────────── */

export type AiCompileStatus = '编译中' | '编译成功' | '编译失败';

export const AI_COMPILE_STATUS: AiCompileStatus[] = ['编译中', '编译成功', '编译失败'];

export const AI_COMPILE_STATUS_COLOR: Record<AiCompileStatus, string> = {
  编译中: 'processing',
  编译成功: 'success',
  编译失败: 'error',
};

/** 一次 AICoding 的编译记录（列表接口不含 content/prompt/changedDetail 等大字段） */
export interface AiCompileLogItem {
  id: number;
  /** 关联的任务会话 ID，父子任务共享 */
  sessionId: string;
  taskId: number;
  subTaskId: number | null;
  taskType: '父任务' | '子任务';
  /** 与发起方任务标题一致 */
  title: string;
  smartDocId: number | null;
  branch: string | null;
  model: string | null;
  status: AiCompileStatus;
  errorMsg: string | null;
  contentChars: number;
  lineCount: number;
  /** 日志超出上限被截断 */
  truncated: boolean;
  exitCode: number | null;
  resultSubtype: string | null;
  durationMs: number | null;
  numTurns: number | null;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  /** git 实测改动文件数；null 表示 git 校验失败 */
  changedFiles: number | null;
  headBefore: string | null;
  headAfter: string | null;
  commitsAhead: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  creatorId: number | null;
  creatorName: string | null;
  createdAt: string;
}

/** 增量拉取日志尾部的返回结构；offset 单位为 Unicode 码点，由服务端权威给出 */
export interface AiCompileLogTail {
  id: number;
  status: AiCompileStatus;
  running: boolean;
  offset: number;
  nextOffset: number;
  total: number;
  chunk: string;
  hasMore: boolean;
  /** 服务端判定 offset 失效，前端需清空已有内容重新累积 */
  reset: boolean;
  truncated: boolean;
  lineCount: number;
  errorMsg: string | null;
  finishedAt: string | null;
  changedFiles: number | null;
  changedDetail: string | null;
  exitCode: number | null;
  resultSubtype: string | null;
  durationMs: number | null;
  numTurns: number | null;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  commitsAhead: number | null;
}

/* ── GIT 提交记录 ─────────────────────────── */

export type AiGitCommitStatus = '提交成功' | '提交失败';

export const AI_GIT_COMMIT_STATUS: AiGitCommitStatus[] = ['提交成功', '提交失败'];

export const AI_GIT_COMMIT_STATUS_COLOR: Record<AiGitCommitStatus, string> = {
  提交成功: 'success',
  提交失败: 'error',
};

/** 一次「提交代码」的记录（列表接口不含 changedDetail，详情接口才返回） */
export interface AiGitCommitItem {
  id: number;
  /** 关联的任务会话 ID */
  sessionId: string;
  taskId: number;
  /** 与 AI 任务标题一致 */
  title: string;
  branch: string | null;
  status: AiGitCommitStatus;
  /** 本次使用的 commit 注释 */
  commitMessage: string;
  /** 短 commit hash；推送失败时本地提交已生成，此字段仍有值 */
  commitHash: string | null;
  changedFiles: number | null;
  /** 改动明细，仅详情接口返回 */
  changedDetail?: string | null;
  errorMsg: string | null;
  creatorId: number | null;
  creatorName: string | null;
  createdAt: string;
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
