/** 数据权限范围 —— 挂在角色上，决定该角色能看到哪些行 */
export const DataScope = {
  /** 全部数据 */
  ALL: 'ALL',
  /** 本部门及以下 */
  DEPT_AND_CHILD: 'DEPT_AND_CHILD',
  /** 仅本部门 */
  DEPT: 'DEPT',
  /** 仅本人 */
  SELF: 'SELF',
  /** 自定义部门集合 */
  CUSTOM: 'CUSTOM',
} as const;
export type DataScopeType = (typeof DataScope)[keyof typeof DataScope];

/** 单个角色贡献的数据范围 */
export interface RoleScope {
  scope: DataScopeType;
  /** 仅 scope=CUSTOM 时有值 */
  customDeptIds: number[];
}

/** 菜单节点类型：目录 / 页面 / 按钮，三者构成唯一的权限来源 */
export const MenuType = {
  /** 目录：只做侧边栏分组，不对应页面 */
  CATALOG: 'CATALOG',
  /** 页面：页面权限载体，有 path 与 component */
  MENU: 'MENU',
  /** 按钮：操作权限载体，只有 perms 标识 */
  BUTTON: 'BUTTON',
} as const;
export type MenuTypeValue = (typeof MenuType)[keyof typeof MenuType];

/** 请求上下文中的登录用户 */
export interface AuthUser {
  id: number;
  username: string;
  nickname: string;
  deptId: number | null;
  isSuper: boolean;
  /** 操作权限码集合（多角色并集），超管为 ['*'] */
  perms: string[];
  /** 各角色的数据范围。查询时对各条件取「并集」，即多角色能看到的行相加 */
  dataScopes: RoleScope[];
  /** 可管理的代码库 id 集合（多角色并集）。超管为 []，由接口层跳过过滤 */
  codeRepoIds: number[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
