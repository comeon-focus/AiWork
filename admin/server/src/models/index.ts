import { Dept } from './dept.js';
import { User } from './user.js';
import { Role } from './role.js';
import { Menu } from './menu.js';
import { CodeRepo } from './codeRepo.js';
import { DataSimProject } from './dataSimProject.js';
import { DataSimInterface } from './dataSimInterface.js';
import { DataTask, TASK_STATUS } from './dataTask.js';
import { DataTaskUser } from './dataTaskUser.js';
import { DataTaskInterface } from './dataTaskInterface.js';
import { Requirement } from './requirement.js';
import { RequirementFile } from './requirementFile.js';
import { SmartDoc } from './smartDoc.js';
import { AITask, AI_TASK_STATUS, type AITaskStatus } from './aiTask.js';
import { AiSubTask } from './aiSubTask.js';
import { Demand, DEMAND_STATUS, type DemandStatus } from './demand.js';
import { DemandFile } from './demandFile.js';
import { RequirementDemand } from './requirementDemand.js';
import { UserRole, RoleMenu, RoleDept, RoleCodeRepo } from './joins.js';
import { RefreshToken } from './refreshToken.js';
import { LoginLog, OperLog } from './logs.js';

/* ── 用户 ↔ 角色：多对多 ───────────────────────────── */
User.belongsToMany(Role, { through: UserRole, foreignKey: 'userId', otherKey: 'roleId', as: 'roles' });
Role.belongsToMany(User, { through: UserRole, foreignKey: 'roleId', otherKey: 'userId', as: 'users' });

/* ── 角色 ↔ 菜单：多对多（页面权限 + 操作权限授权） ── */
Role.belongsToMany(Menu, { through: RoleMenu, foreignKey: 'roleId', otherKey: 'menuId', as: 'menus' });
Menu.belongsToMany(Role, { through: RoleMenu, foreignKey: 'menuId', otherKey: 'roleId', as: 'roles' });

/* ── 角色 ↔ 部门：多对多（自定义数据范围） ────────── */
Role.belongsToMany(Dept, { through: RoleDept, foreignKey: 'roleId', otherKey: 'deptId', as: 'depts' });
Dept.belongsToMany(Role, { through: RoleDept, foreignKey: 'deptId', otherKey: 'roleId', as: 'roles' });

/* ── 角色 ↔ 代码库：多对多（代码库数据权限） ────── */
Role.belongsToMany(CodeRepo, { through: RoleCodeRepo, foreignKey: 'roleId', otherKey: 'repoId', as: 'codeRepos' });
CodeRepo.belongsToMany(Role, { through: RoleCodeRepo, foreignKey: 'repoId', otherKey: 'roleId', as: 'roles' });

/* ── 需求 ↔ 附件 ─────────────────────────────────── */
Requirement.hasMany(RequirementFile, { foreignKey: 'requirementId', as: 'files' });
RequirementFile.belongsTo(Requirement, { foreignKey: 'requirementId', as: 'requirement' });

/* ── 需求 ↔ 智能文档 ─────────────────────────────── */
Requirement.hasMany(SmartDoc, { foreignKey: 'requirementId', as: 'smartDocs' });
SmartDoc.belongsTo(Requirement, { foreignKey: 'requirementId', as: 'requirement' });
SmartDoc.belongsTo(CodeRepo, { foreignKey: 'repoId', as: 'codeRepo' });

/* ── AI 任务 ↔ 智能文档（单关联） ────────────────── */
AITask.belongsTo(SmartDoc, { foreignKey: 'smartDocId', as: 'smartDoc' });
SmartDoc.hasMany(AITask, { foreignKey: 'smartDocId', as: 'aiTasks' });

/* ── AI 子任务 ↔ AI 任务（归属） ────────────────── */
AiSubTask.belongsTo(AITask, { foreignKey: 'parentId', as: 'parent' });
AITask.hasMany(AiSubTask, { foreignKey: 'parentId', as: 'subTasks' });

/* ── AI 子任务 ↔ 智能文档（单关联） ─────────────── */
AiSubTask.belongsTo(SmartDoc, { foreignKey: 'smartDocId', as: 'smartDoc' });

/* ── 任务 ↔ 代码库（单关联） ─────────────────────── */
Requirement.belongsTo(CodeRepo, { foreignKey: 'repoId', as: 'codeRepo' });
CodeRepo.hasMany(Requirement, { foreignKey: 'repoId', as: 'requirements' });

/* ── 需求列表 ↔ 需求文档 ─────────────────────────── */
Demand.hasMany(DemandFile, { foreignKey: 'demandId', as: 'files' });
DemandFile.belongsTo(Demand, { foreignKey: 'demandId', as: 'demand' });

/* ── 任务 ↔ 需求列表 多对多 ──────────────────────── */
Requirement.belongsToMany(Demand, { through: RequirementDemand, foreignKey: 'requirementId', otherKey: 'demandId', as: 'demands' });
Demand.belongsToMany(Requirement, { through: RequirementDemand, foreignKey: 'demandId', otherKey: 'requirementId', as: 'tasks' });

/* ── 用户 → 部门 ──────────────────────────────────── */
User.belongsTo(Dept, { foreignKey: 'deptId', as: 'dept' });
Dept.hasMany(User, { foreignKey: 'deptId', as: 'users' });

/* ── 用户 → refresh token ─────────────────────────── */
User.hasMany(RefreshToken, { foreignKey: 'userId', as: 'refreshTokens' });
RefreshToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });

/* ── 菜单自关联（树） ─────────────────────────────── */
Menu.hasMany(Menu, { foreignKey: 'parentId', as: 'children' });
Menu.belongsTo(Menu, { foreignKey: 'parentId', as: 'parent' });

/* ── 部门自关联（树） ─────────────────────────────── */
Dept.hasMany(Dept, { foreignKey: 'parentId', as: 'children' });
Dept.belongsTo(Dept, { foreignKey: 'parentId', as: 'parent' });

/* ── 数据任务 ↔ 接口 ─────────────────────────────── */
DataTask.hasMany(DataTaskInterface, { foreignKey: 'taskId', as: 'interfaces' });
DataTaskInterface.belongsTo(DataTask, { foreignKey: 'taskId', as: 'task' });

/* ── 数据任务 ↔ 责任人（用户）多对多 ─────────────── */
DataTask.belongsToMany(User, { through: DataTaskUser, foreignKey: 'taskId', otherKey: 'userId', as: 'users' });
User.belongsToMany(DataTask, { through: DataTaskUser, foreignKey: 'userId', otherKey: 'taskId', as: 'dataTasks' });
DataTaskUser.belongsTo(User, { foreignKey: 'userId', as: 'user' });

/* ── 数据任务 ↔ 数据模拟项目 ─────────────────────── */
DataTask.belongsTo(DataSimProject, { foreignKey: 'projectId', targetKey: 'projectId', as: 'project' });

export {
  Dept,
  User,
  Role,
  Menu,
  CodeRepo,
  DataSimProject,
  DataSimInterface,
  DataTask,
  DataTaskUser,
  DataTaskInterface,
  TASK_STATUS,
  Requirement,
  RequirementFile,
  SmartDoc,
  AITask,
  AI_TASK_STATUS,
  type AITaskStatus,
  AiSubTask,
  Demand,
  DemandFile,
  RequirementDemand,
  DEMAND_STATUS,
  type DemandStatus,
  UserRole,
  RoleMenu,
  RoleDept,
  RoleCodeRepo,
  RefreshToken,
  LoginLog,
  OperLog,
};
