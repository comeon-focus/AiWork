import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../db/index.js';
import { MenuType, type MenuTypeValue } from '../types/index.js';

/**
 * 菜单树是整个系统权限的唯一数据源：
 * - CATALOG / MENU 节点 → 页面权限（下发给前端生成路由与侧边栏）
 * - BUTTON 节点 → 操作权限（perms 字段，前端控显隐、后端做强校验）
 * 不再单独维护 permission 表，杜绝「菜单一套、权限另一套」的重复配置。
 */
export class Menu extends Model<InferAttributes<Menu>, InferCreationAttributes<Menu>> {
  declare id: CreationOptional<number>;
  declare parentId: number;
  declare name: string;
  declare type: MenuTypeValue;
  /** 路由地址，CATALOG/MENU 使用 */
  declare path: string | null;
  /** 前端组件路径，相对 src/pages，如 system/user/index */
  declare component: string | null;
  /** 操作权限标识，如 system:user:add，BUTTON 必填 */
  declare perms: string | null;
  declare icon: string | null;
  declare sort: number;
  declare visible: CreationOptional<number>;
  declare status: CreationOptional<number>;
  declare keepAlive: CreationOptional<number>;
  declare redirect: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Menu.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    parentId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    name: { type: DataTypes.STRING(50), allowNull: false, comment: '菜单/按钮名称' },
    type: {
      type: DataTypes.ENUM(...Object.values(MenuType)),
      allowNull: false,
      defaultValue: MenuType.MENU,
      comment: 'CATALOG目录 MENU页面 BUTTON按钮',
    },
    path: { type: DataTypes.STRING(200), allowNull: true, comment: '路由地址' },
    component: { type: DataTypes.STRING(200), allowNull: true, comment: '组件路径' },
    perms: { type: DataTypes.STRING(100), allowNull: true, comment: '操作权限标识' },
    icon: { type: DataTypes.STRING(50), allowNull: true },
    sort: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    visible: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1, comment: '1显示 0隐藏' },
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1, comment: '1启用 0停用' },
    keepAlive: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    redirect: { type: DataTypes.STRING(200), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'Menu',
    tableName: 'sys_menu',
    indexes: [{ fields: ['parent_id'] }, { fields: ['perms'] }],
  },
);
