# 零零七管理平台

基于 **React 19 + Ant Design 5**（前端）+ **Node.js (Express 5) + TypeScript + Sequelize**（后端）+ **MySQL** 的通用后台管理系统（零零七管理平台）。实现了主流 RBAC 权限模型与三类细粒度权限管控。

## 特性

- **主流 RBAC 模型**：用户 — 角色 — 权限 多对多关联
- **三类权限管控**
  - **页面权限**：动态路由，按菜单树渲染可见菜单与可访问页面
  - **操作权限**：按钮级（`requirePerms` + 前端 `<Auth>` 组件），如「新增/编辑/删除」
  - **数据权限**：基于「角色数据范围」（`ALL` / `本部门及以下` / `本部门` / `仅本人` / `自定义部门`），在 SQL 层自动过滤
- **避免权限冗余配置**：菜单树是权限的**唯一来源**——目录/菜单承载页面权限，按钮节点承载操作权限（统一用 `perms` 字段），不再另设独立的权限表
- **双 Token（JWT）**：短时效 access token（2h）+ 长时效 refresh token（7d），refresh token 入库白名单 + 轮换 + 登出/改密/禁用即吊销
- **权限实时生效**：每次请求在 `auth` 中间件中重新计算权限，角色变更后立即生效，无缓存陈旧问题
- **多角色权限取并集**：一个用户拥有多个角色时，操作权限取并集，数据范围取「或」语义（而非最宽覆盖）
- **操作日志 / 登录日志**：自动记录关键操作，支持脱敏

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 19、Ant Design 5、Vite 8、React Router 7、Zustand、Axios |
| 后端 | Node.js、Express 5、TypeScript（NodeNext）、Sequelize 6、jsonwebtoken、bcryptjs、zod |
| 数据库 | MySQL 8（utf8mb4） |

> 要求 **Node ≥ 20.19**。本机若版本过低，请使用 nvm 切换到 Node 20（如 `nvm use 20`）。

## 目录结构

```
admin/
├── package.json            # npm workspaces 根，统一脚本
├── server/                 # 后端（Express + Sequelize）
│   ├── .env.example        # 环境变量示例
│   └── src/
│       ├── config/         # 读取 .env
│       ├── db/             # Sequelize 实例
│       ├── models/         # 表模型与关联
│       ├── utils/          # jwt / 密码 / 响应 / 数据范围 / 树 ...
│       ├── services/       # 权限计算（单一入口）
│       ├── middleware/     # auth / perms / validate / errorHandler / operLog
│       ├── modules/        # auth / user / role / menu / dept / log
│       ├── scripts/        # dbInit.ts 一键建库建表 + 种子
│       ├── app.ts
│       └── index.ts
└── web/                    # 前端（Vite + React + antd）
    └── src/
        ├── api/            # axios 封装 + 接口
        ├── store/          # zustand auth store
        ├── router/         # 动态路由（菜单树 → 路由）
        ├── layouts/        # 基础布局
        ├── components/     # Auth 权限组件 / 图标解析
        ├── hooks/          # usePerms
        └── pages/          # 登录 / 仪表盘 / 系统 / 监控
```

## 快速开始

### 1. 准备 MySQL

确保本地有可用的 MySQL 8 服务，并记下连接信息（主机、端口、账号、密码）。

### 2. 配置环境变量

```bash
cd admin/server
cp .env.example .env
# 编辑 .env，至少修改 DB_* 与 JWT_* 密钥
```

关键变量（见 `.env.example`）：

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `PORT` | 后端端口 | `3000` |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | MySQL 连接 | `127.0.0.1` / `3306` / `root` / 空 / `admin_rbac` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | JWT 签名密钥（生产务必更换） | dev 占位 |
| `JWT_ACCESS_EXPIRES` / `JWT_REFRESH_EXPIRES` | token 时效 | `2h` / `7d` |
| `CORS_ORIGIN` | 前端地址白名单（逗号分隔） | `http://localhost:5173` |

### 3. 安装依赖

在 `admin/` 根目录执行（npm workspaces 会同时安装 `server` 与 `web`）：

```bash
cd admin
npm install
```

### 4. 初始化数据库（建库 + 建表 + 种子数据）

```bash
npm run db:init          # 仅在库为空时写入种子
npm run db:init -- --force   # 删除并重建所有表（会清空数据，谨慎）
```

种子账号（详见下节）。

### 5. 启动开发环境

```bash
npm run dev              # 同时启动 server(3000) 与 web(5173)
```

- 后端接口：`http://127.0.0.1:3000/api`
- 前端页面：`http://localhost:5173`（Vite 已配置 `/api` 代理到后端，无需额外处理跨域）

生产构建：`npm run build`（分别构建 server 与 web）。

## 演示账号

> 以下账号均为种子数据，`db:init` 后可直接使用。

| 账号 | 密码 | 角色 | 数据范围（数据权限演示） |
| --- | --- | --- | --- |
| `admin` | `Admin@123` | 超级管理员 | 全部数据 |
| `manager` | `Test@123` | 部门主管 | 本部门及以下（研发部 + 前端组 + 后端组） |
| `zhangsan` | `Test@123` | 普通员工 | 仅本人 |
| `lisi` | `Test@123` | 普通员工 | 仅本人 |
| `wangwu` | `Test@123` | 跨部门协作 | 自定义（前端组 + 市场部） |

### 三类权限如何体验

1. **页面权限**：用 `staff` 角色（如 `zhangsan`）登录，左侧菜单只出现「首页 / 系统管理 / 用户管理」，且只能进入已授权的页面；未授权页面直接访问会跳 403。
2. **操作权限**：`manager` 没有「删除用户」按钮权限（`system:user:remove`），用户管理页的删除按钮被 `<Auth>` 隐藏；`admin` 则可看到全部操作按钮。
3. **数据权限**：
   - 用 ` manager` 进入「用户管理」：只能看到研发部及其下级（前端组/后端组）的用户；
   - 用 `zhangsan` 进入：只能看到自己；
   - 用 `wangwu` 进入：只能看到前端组与市场部的用户；
   - 用 `admin` 进入：看到全部用户。

后端在 `services/permission.service.ts` 计算权限、`utils/dataScope.ts` 拼装数据范围 SQL 过滤、`middleware/perms.ts` 校验操作权限，前端在 `store/useAuthStore.ts` (`checkPerm`) 与 `components/Auth.tsx` 做展示层控制。

## 核心设计

### 菜单即权限的单一来源（消除冗余）

`sys_menu` 一张表用 `type` 字段区分三类节点：

- `CATALOG`（目录）：仅用于分组展示
- `MENU`（菜单）：承载**页面权限**（`path` + `component` 用于前端动态路由）
- `BUTTON`（按钮）：承载**操作权限**，仅用 `perms` 字段（如 `system:user:add`）

角色与菜单通过 `sys_role_menu` 关联，因此「角色拥有哪些页面/操作权限」全部由菜单树推导，**不需要再维护一张独立的权限表**，从根本上避免了权限冗余配置。

### 数据权限：角色数据范围

`sys_role.data_scope` 取值：

| 值 | 含义 |
| --- | --- |
| `ALL` | 全部数据（超级管理员默认） |
| `DEPT_AND_CHILD` | 本部门及以下（依赖 `sys_dept.ancestors` 冗余路径 + `FIND_IN_SET` 高效查询子树） |
| `DEPT` | 仅本部门 |
| `SELF` | 仅本人 |
| `CUSTOM` | 自定义部门集合（`sys_role_dept`） |

多角色用户：数据范围按「或」语义组合（每个角色的范围用 `OR` 拼接），而非简单地取最宽范围。

### 双 Token 安全

- access token 短时效、refresh token 长时效；
- refresh token 以 `sha256` 哈希存入 `sys_refresh_token` 白名单（不存明文）；
- 刷新时轮换（旧 token 入库吊销，签发新 token）；
- 登出、修改密码、账号被禁用时吊销该用户全部 refresh token。

### 权限实时生效

`middleware/auth.ts` 每次请求都会调用 `permission.service.ts` 重新加载用户角色 → 菜单 → 权限 → 数据范围，写入 `req.user`，因此后台调整角色权限后下一次请求即生效，无需重新登录。

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 前后端同时启动（concurrently） |
| `npm run dev:server` / `npm run dev:web` | 单独启动后端 / 前端 |
| `npm run build` | 构建前后端 |
| `npm run db:init` | 初始化数据库（建库/表 + 种子） |
| `npm run db:init -- --force` | 强制重建数据库（清空数据） |
| `npm run typecheck` | 前后端 TypeScript 类型检查 |
