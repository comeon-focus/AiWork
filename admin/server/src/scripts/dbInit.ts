/**
 * 一键初始化数据库：建库 → 建表 → 写入种子数据
 *
 *   npm run db:init            仅在库为空时写入种子数据
 *   npm run db:init -- --force 先删除所有表再重建（会清空数据，请谨慎）
 */
import mysql from 'mysql2/promise';
import { Op, DataTypes } from 'sequelize';
import { config } from '../config/index.js';
import { sequelize } from '../db/index.js';
import { Dept, User, Role, Menu, CodeRepo, Requirement, DataTask, DataTaskProject, UserRole, RoleMenu, RoleDept, RoleCodeRepo } from '../models/index.js';
import { hashPassword } from '../utils/password.js';
import { DataScope, MenuType, type MenuTypeValue } from '../types/index.js';

const force = process.argv.includes('--force');

async function ensureDatabase() {
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
  });
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.db.name}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`,
  );
  await conn.end();
  console.log(`[db:init] 数据库 ${config.db.name} 就绪`);
}

/* ── 部门种子 ─────────────────────────────────────── */
interface DeptSeed {
  name: string;
  leader?: string;
  children?: DeptSeed[];
}

const DEPT_SEED: DeptSeed[] = [
  {
    name: '总公司',
    leader: '张总',
    children: [
      {
        name: '研发部',
        leader: '李工',
        children: [{ name: '前端组', leader: '王前端' }, { name: '后端组', leader: '赵后端' }],
      },
      { name: '市场部', leader: '钱市场' },
    ],
  },
];

const deptIds = new Map<string, number>();

async function seedDepts(list: DeptSeed[], parentId: number, ancestors: string, startOrder = 1) {
  let order = startOrder;
  for (const item of list) {
    const dept = await Dept.create({
      parentId,
      ancestors,
      name: item.name,
      orderNum: order++,
      leader: item.leader ?? null,
      phone: null,
      status: 1,
      delFlag: 0,
    });
    deptIds.set(item.name, dept.id);
    if (item.children?.length) {
      await seedDepts(item.children, dept.id, `${ancestors},${dept.id}`, 1);
    }
  }
}

/* ── 菜单（权限）种子 ─────────────────────────────── */
interface MenuSeed {
  name: string;
  type: MenuTypeValue;
  path?: string;
  component?: string;
  perms?: string;
  icon?: string;
  children?: MenuSeed[];
}

const MENU_SEED: MenuSeed[] = [
  { name: '首页', type: MenuType.MENU, path: '/dashboard', component: 'dashboard/index', icon: 'DashboardOutlined' },
  {
    name: '系统管理',
    type: MenuType.CATALOG,
    path: '/system',
    icon: 'SettingOutlined',
    children: [
      {
        name: '用户管理',
        type: MenuType.MENU,
        path: '/system/user',
        component: 'system/user/index',
        icon: 'UserOutlined',
        perms: 'system:user:list',
        children: [
          { name: '新增用户', type: MenuType.BUTTON, perms: 'system:user:add' },
          { name: '编辑用户', type: MenuType.BUTTON, perms: 'system:user:edit' },
          { name: '删除用户', type: MenuType.BUTTON, perms: 'system:user:remove' },
          { name: '重置密码', type: MenuType.BUTTON, perms: 'system:user:resetPwd' },
        ],
      },
      {
        name: '角色管理',
        type: MenuType.MENU,
        path: '/system/role',
        component: 'system/role/index',
        icon: 'TeamOutlined',
        perms: 'system:role:list',
        children: [
          { name: '新增角色', type: MenuType.BUTTON, perms: 'system:role:add' },
          { name: '编辑角色', type: MenuType.BUTTON, perms: 'system:role:edit' },
          { name: '删除角色', type: MenuType.BUTTON, perms: 'system:role:remove' },
        ],
      },
      {
        name: '菜单管理',
        type: MenuType.MENU,
        path: '/system/menu',
        component: 'system/menu/index',
        icon: 'MenuOutlined',
        perms: 'system:menu:list',
        children: [
          { name: '新增菜单', type: MenuType.BUTTON, perms: 'system:menu:add' },
          { name: '编辑菜单', type: MenuType.BUTTON, perms: 'system:menu:edit' },
          { name: '删除菜单', type: MenuType.BUTTON, perms: 'system:menu:remove' },
        ],
      },
      {
        name: '部门管理',
        type: MenuType.MENU,
        path: '/system/dept',
        component: 'system/dept/index',
        icon: 'ApartmentOutlined',
        perms: 'system:dept:list',
        children: [
          { name: '新增部门', type: MenuType.BUTTON, perms: 'system:dept:add' },
          { name: '编辑部门', type: MenuType.BUTTON, perms: 'system:dept:edit' },
          { name: '删除部门', type: MenuType.BUTTON, perms: 'system:dept:remove' },
        ],
      },
      {
        name: '代码库管理',
        type: MenuType.MENU,
        path: '/system/repo',
        component: 'system/repo/index',
        icon: 'CodeOutlined',
        perms: 'system:repo:list',
        children: [
          { name: '新增代码库', type: MenuType.BUTTON, perms: 'system:repo:add' },
          { name: '编辑代码库', type: MenuType.BUTTON, perms: 'system:repo:edit' },
          { name: '删除代码库', type: MenuType.BUTTON, perms: 'system:repo:remove' },
        ],
      },
      {
        name: '用户信息',
        type: MenuType.MENU,
        path: '/system/user-info',
        component: 'system/userInfo/index',
        icon: 'IdcardOutlined',
        perms: 'monitor:userinfo:view',
      },
    ],
  },
  {
    name: '系统监控',
    type: MenuType.CATALOG,
    path: '/monitor',
    icon: 'MonitorOutlined',
    children: [
      {
        name: '登录日志',
        type: MenuType.MENU,
        path: '/monitor/login-log',
        component: 'monitor/loginLog/index',
        icon: 'LoginOutlined',
        perms: 'monitor:loginlog:list',
        children: [{ name: '清空登录日志', type: MenuType.BUTTON, perms: 'monitor:loginlog:remove' }],
      },
      {
        name: '操作日志',
        type: MenuType.MENU,
        path: '/monitor/oper-log',
        component: 'monitor/operLog/index',
        icon: 'FileTextOutlined',
        perms: 'monitor:operlog:list',
        children: [{ name: '清空操作日志', type: MenuType.BUTTON, perms: 'monitor:operlog:remove' }],
      },
    ],
  },
  {
    name: '需求空间',
    type: MenuType.CATALOG,
    path: '/orchestration',
    icon: 'ReadOutlined',
    children: [
      {
        name: '需求列表',
        type: MenuType.MENU,
        path: '/orchestration/demand',
        component: 'orchestration/demand/index',
        icon: 'ProfileOutlined',
        perms: 'orchestration:demand:list',
        children: [
          { name: '新增需求', type: MenuType.BUTTON, perms: 'orchestration:demand:add' },
          { name: '编辑需求', type: MenuType.BUTTON, perms: 'orchestration:demand:edit' },
          { name: '删除需求', type: MenuType.BUTTON, perms: 'orchestration:demand:remove' },
        ],
      },
      {
        name: '任务列表',
        type: MenuType.MENU,
        path: '/orchestration/requirement',
        component: 'orchestration/requirement/index',
        icon: 'FileDoneOutlined',
        perms: 'orchestration:requirement:list',
        children: [
          { name: '新增任务', type: MenuType.BUTTON, perms: 'orchestration:requirement:add' },
          { name: '编辑任务', type: MenuType.BUTTON, perms: 'orchestration:requirement:edit' },
          { name: '删除任务', type: MenuType.BUTTON, perms: 'orchestration:requirement:remove' },
          { name: 'AI优化', type: MenuType.BUTTON, perms: 'orchestration:requirement:ai' },
        ],
      },
      {
        name: '智能文档',
        type: MenuType.MENU,
        path: '/orchestration/smart-doc',
        component: 'orchestration/smartDoc/index',
        icon: 'RobotOutlined',
        perms: 'orchestration:smartDoc:list',
        children: [
          { name: '编辑文档', type: MenuType.BUTTON, perms: 'orchestration:smartDoc:edit' },
          { name: '删除文档', type: MenuType.BUTTON, perms: 'orchestration:smartDoc:remove' },
        ],
      },
    ],
  },
  {
    name: '智能编排',
    type: MenuType.CATALOG,
    path: '/ai-orchestration',
    icon: 'NodeIndexOutlined',
    children: [
      {
        name: 'AI任务',
        type: MenuType.MENU,
        path: '/ai-orchestration/ai-task',
        component: 'aiOrchestration/aiTask/index',
        icon: 'ThunderboltOutlined',
        perms: 'orchestration:aiTask:list',
        children: [
          { name: '新增任务', type: MenuType.BUTTON, perms: 'orchestration:aiTask:add' },
          { name: '编辑任务', type: MenuType.BUTTON, perms: 'orchestration:aiTask:edit' },
          { name: '删除任务', type: MenuType.BUTTON, perms: 'orchestration:aiTask:remove' },
          { name: '提交代码', type: MenuType.BUTTON, perms: 'orchestration:aiTask:commit' },
        ],
      },
      {
        name: '编译详情',
        type: MenuType.MENU,
        path: '/ai-orchestration/compile-log',
        component: 'aiOrchestration/compileLog/index',
        icon: 'FileSearchOutlined',
        perms: 'orchestration:compileLog:list',
        children: [
          { name: '删除记录', type: MenuType.BUTTON, perms: 'orchestration:compileLog:remove' },
        ],
      },
      {
        name: 'GIT提交记录',
        type: MenuType.MENU,
        path: '/ai-orchestration/git-commit',
        component: 'aiOrchestration/gitCommit/index',
        icon: 'BranchesOutlined',
        perms: 'orchestration:gitCommit:list',
        children: [
          { name: '删除记录', type: MenuType.BUTTON, perms: 'orchestration:gitCommit:remove' },
        ],
      },
    ],
  },
  {
    name: '虚拟空间',
    type: MenuType.CATALOG,
    path: '/vspace',
    icon: 'CloudOutlined',
    children: [
      {
        name: '数据模拟',
        type: MenuType.MENU,
        path: '/vspace/data-sim',
        component: 'vspace/dataSim/index',
        icon: 'ExperimentOutlined',
        perms: 'vspace:datasim:list',
        children: [
          { name: '新增项目', type: MenuType.BUTTON, perms: 'vspace:datasim:add' },
          { name: '编辑项目', type: MenuType.BUTTON, perms: 'vspace:datasim:edit' },
          { name: '删除项目', type: MenuType.BUTTON, perms: 'vspace:datasim:remove' },
        ],
      },
      {
        name: '数据任务',
        type: MenuType.MENU,
        path: '/vspace/data-task',
        component: 'vspace/dataTask/index',
        icon: 'DeploymentUnitOutlined',
        perms: 'vspace:datatask:list',
        children: [
          { name: '新增任务', type: MenuType.BUTTON, perms: 'vspace:datatask:add' },
          { name: '编辑任务', type: MenuType.BUTTON, perms: 'vspace:datatask:edit' },
          { name: '删除任务', type: MenuType.BUTTON, perms: 'vspace:datatask:remove' },
        ],
      },
    ],
  },
];

const menuIds = new Map<string, number>();

async function seedMenus(list: MenuSeed[], parentId: number) {
  let sort = 1;
  for (const item of list) {
    const menu = await Menu.create({
      parentId,
      name: item.name,
      type: item.type,
      path: item.path ?? null,
      component: item.component ?? null,
      perms: item.perms ?? null,
      icon: item.icon ?? null,
      sort: sort++,
      redirect: null,
    });
    menuIds.set(item.name, menu.id);
    if (item.children?.length) await seedMenus(item.children, menu.id);
  }
}

function pickMenuIds(names: string[]): number[] {
  return names.map((n) => {
    const id = menuIds.get(n);
    if (!id) throw new Error(`菜单种子缺少节点: ${n}`);
    return id;
  });
}

/* ── 增量补齐：兼容已在运行的数据库，无需 --force 重建 ── */

/**
 * 确保「用户信息」菜单挂在「系统管理」下，并授权给所有非超级管理员角色（超管自动拥有全部菜单）。
 * 兼容已在运行的数据库：若旧节点仍在「系统监控」下，则就地迁移（保留角色授权关联），并清理残留重复项。
 */
async function ensureUserInfoMenu() {
  const sysParent = await Menu.findOne({ where: { name: '系统管理', type: MenuType.CATALOG } });
  if (!sysParent) return; // 系统管理目录缺失则不处理
  const monitorParent = await Menu.findOne({ where: { name: '系统监控', type: MenuType.CATALOG } });

  // 优先复用已存在的「用户信息」节点（可能在系统监控旧路径下），整体迁移到系统管理
  const old = await Menu.findOne({
    where: monitorParent ? { name: '用户信息', parentId: monitorParent.id } : { name: '用户信息' },
  });
  const target =
    old ?? (await Menu.findOne({ where: { name: '用户信息', parentId: sysParent.id } }));

  if (target) {
    await target.update({
      parentId: sysParent.id,
      path: '/system/user-info',
      component: 'system/userInfo/index',
      perms: 'monitor:userinfo:view',
      icon: 'IdcardOutlined',
      sort: 6,
    });
  } else {
    await Menu.create({
      parentId: sysParent.id,
      name: '用户信息',
      type: MenuType.MENU,
      path: '/system/user-info',
      component: 'system/userInfo/index',
      perms: 'monitor:userinfo:view',
      icon: 'IdcardOutlined',
      sort: 6,
      visible: 1,
      status: 1,
      keepAlive: 0,
      redirect: null,
    });
  }

  // 清掉系统管理以外的残留同名节点（含旧系统监控路径下的重复项）
  await Menu.destroy({ where: { name: '用户信息', parentId: { [Op.ne]: sysParent.id } } });

  const menu = (await Menu.findOne({ where: { name: '用户信息', parentId: sysParent.id } }))!;
  const roles = await Role.findAll({ where: { roleKey: { [Op.ne]: 'admin' } } });
  for (const role of roles) {
    const exists = await RoleMenu.findOne({ where: { roleId: role.id, menuId: menu.id } });
    if (!exists) await RoleMenu.create({ roleId: role.id, menuId: menu.id });
  }
  console.log('[db:init] 用户信息菜单已迁移至「系统管理」');
}

/** 确保 sys_user 已包含 git_key 字段（模型已声明，此处补齐存量库） */
async function ensureUserGitKeyColumn() {
  const qi = sequelize.getQueryInterface();
  const cols = await qi.describeTable('sys_user');
  if (!cols.git_key) {
    await qi.addColumn('sys_user', 'git_key', {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'Git 密钥',
    });
    console.log('[db:init] 已为 sys_user 新增 git_key 字段');
  }
}

/**
 * 兼容存量库：数据任务原仅支持单项目（DataTask.projectId），
 * 现多项目关系落在 sys_data_task_project，这里把已有任务的单项目补齐进关联表（幂等）。
 */
async function ensureDataTaskProjects() {
  const tasks = await DataTask.findAll({ attributes: ['id', 'projectId'], raw: true });
  for (const task of tasks) {
    if (!task.projectId) continue;
    const exists = await DataTaskProject.findOne({ where: { taskId: task.id, projectId: task.projectId } });
    if (!exists) {
      await DataTaskProject.create({ taskId: task.id, projectId: task.projectId });
    }
  }
}

/* ── 主流程 ───────────────────────────────────────── */
async function main() {
  await ensureDatabase();

  await sequelize.sync({ force });
  console.log(force ? '[db:init] 已删除并重建全部数据表' : '[db:init] 数据表已同步');

  // 增量补齐：存量库不会走下面的种子分支，这里保证新菜单、字段列与多项目关联一定存在
  await ensureUserGitKeyColumn();
  await ensureUserInfoMenu();
  await ensureDataTaskProjects();

  const existing = await User.count();
  if (existing > 0 && !force) {
    console.log('[db:init] 检测到已有用户数据，跳过种子写入。如需重置请执行: npm run db:init -- --force');
    return;
  }

  await seedDepts(DEPT_SEED, 0, '0');
  console.log(`[db:init] 部门 ${deptIds.size} 个`);

  await seedMenus(MENU_SEED, 0);
  console.log(`[db:init] 菜单/权限节点 ${menuIds.size} 个`);

  // 角色一：超级管理员，数据范围「全部」
  const adminRole = await Role.create({
    name: '超级管理员',
    roleKey: 'admin',
    sort: 1,
    dataScope: DataScope.ALL,
    status: 1,
    remark: '系统内置角色，拥有全部权限',
  });
  const allMenus = await Menu.findAll();
  await RoleMenu.bulkCreate(allMenus.map((m) => ({ roleId: adminRole.id, menuId: m.id })));

  // 角色二：部门主管，数据范围「本部门及以下」——用于演示数据权限
  const managerRole = await Role.create({
    name: '部门主管',
    roleKey: 'manager',
    sort: 2,
    dataScope: DataScope.DEPT_AND_CHILD,
    status: 1,
    remark: '只能查看本部门及下级部门的用户，且没有删除权限',
  });
  await RoleMenu.bulkCreate(
    pickMenuIds([
      '首页',
      '系统管理',
      '用户管理',
      '新增用户',
      '编辑用户',
      '部门管理',
      '系统监控',
      '登录日志',
      '用户信息',
      '数据模拟',
    ]).map((menuId) => ({ roleId: managerRole.id, menuId })),
  );

  // 角色三：普通员工，数据范围「仅本人」
  const staffRole = await Role.create({
    name: '普通员工',
    roleKey: 'staff',
    sort: 3,
    dataScope: DataScope.SELF,
    status: 1,
    remark: '只能看到自己的数据',
  });
  await RoleMenu.bulkCreate(
    pickMenuIds(['首页', '系统管理', '用户管理', '用户信息']).map((menuId) => ({ roleId: staffRole.id, menuId })),
  );

  // 角色四：自定义范围，演示 sys_role_dept
  const customRole = await Role.create({
    name: '跨部门协作',
    roleKey: 'cross',
    sort: 4,
    dataScope: DataScope.CUSTOM,
    status: 1,
    remark: '数据范围为手工指定的部门集合',
  });
  await RoleMenu.bulkCreate(
    pickMenuIds(['首页', '系统管理', '用户管理', '用户信息']).map((menuId) => ({ roleId: customRole.id, menuId })),
  );
  await RoleDept.bulkCreate(
    [deptIds.get('前端组')!, deptIds.get('市场部')!].map((deptId) => ({ roleId: customRole.id, deptId })),
  );

  // 代码库种子 + 给部门主管分配其中两个，演示代码库数据权限
  const seedRepos = await CodeRepo.bulkCreate([
    { name: '前端主仓库', address: 'git@git.example.com:frontend/main.git', remark: '零零七前端源码', status: 1, sort: 1 },
    { name: '后端服务仓库', address: 'git@git.example.com:backend/service.git', remark: 'Node 后端服务', status: 1, sort: 2 },
    { name: '基础设施仓库', address: 'git@git.example.com:infra/iac.git', remark: 'IaC 与部署配置', status: 1, sort: 3 },
  ]);
  await RoleCodeRepo.bulkCreate(
    [seedRepos[0]!.id, seedRepos[2]!.id].map((repoId) => ({ roleId: managerRole.id, repoId })),
  );

  const [adminPwd, demoPwd] = await Promise.all([hashPassword('Admin@123'), hashPassword('Test@123')]);

  const seedUsers = [
    { username: 'admin', nickname: '超级管理员', dept: '总公司', isSuper: true, pwd: adminPwd, role: adminRole.id },
    { username: 'manager', nickname: '研发主管', dept: '研发部', isSuper: false, pwd: demoPwd, role: managerRole.id },
    { username: 'zhangsan', nickname: '张三', dept: '前端组', isSuper: false, pwd: demoPwd, role: staffRole.id },
    { username: 'lisi', nickname: '李四', dept: '后端组', isSuper: false, pwd: demoPwd, role: staffRole.id },
    { username: 'wangwu', nickname: '王五', dept: '市场部', isSuper: false, pwd: demoPwd, role: customRole.id },
  ];

  for (const item of seedUsers) {
    const user = await User.create({
      deptId: deptIds.get(item.dept) ?? null,
      username: item.username,
      password: item.pwd,
      nickname: item.nickname,
      email: `${item.username}@example.com`,
      phone: null,
      avatar: null,
      gender: 0,
      status: 1,
      isSuper: item.isSuper,
      lastLoginAt: null,
      lastLoginIp: null,
      remark: null,
    });
    await UserRole.create({ userId: user.id, roleId: item.role });
  }

  // 示例需求：便于首次进入「需求列表」即可见
  const adminUser = await User.findOne({ where: { username: 'admin' } });
  await Requirement.create({
    title: '示例需求：登录页支持扫码登录',
    summary: '登录页增加扫码登录入口，兼容账号密码登录。',
    content: '希望在登录页增加二维码扫码登录入口，并兼容现有账号密码登录方式。',
    creatorId: adminUser?.id ?? null,
    creatorName: adminUser?.nickname ?? null,
  });

  console.log('[db:init] 种子数据写入完成');
  console.log('  超级管理员  admin    / Admin@123  （全部数据）');
  console.log('  研发主管    manager  / Test@123   （本部门及以下）');
  console.log('  普通员工    zhangsan / Test@123   （仅本人）');
  console.log('  普通员工    lisi     / Test@123   （仅本人）');
  console.log('  跨部门协作  wangwu   / Test@123   （自定义：前端组 + 市场部）');
}

main()
  .then(() => sequelize.close())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('[db:init] 失败:', err);
    await sequelize.close().catch(() => undefined);
    process.exit(1);
  });
