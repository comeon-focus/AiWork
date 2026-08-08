import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
} from 'sequelize';
import { sequelize } from '../db/index.js';
import { DataScope, type DataScopeType } from '../types/index.js';
import type { Menu } from './menu.js';

export class Role extends Model<InferAttributes<Role>, InferCreationAttributes<Role>> {
  declare id: CreationOptional<number>;
  declare name: string;
  /** 权限字符，如 admin / common，代码中判断超管角色也用它 */
  declare roleKey: string;
  declare sort: number;
  /** 数据权限：该角色能看到哪些行 */
  declare dataScope: CreationOptional<DataScopeType>;
  declare status: number;
  declare remark: string | null;
  declare delFlag: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare menus?: NonAttribute<Menu[]>;
}

Role.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(50), allowNull: false, comment: '角色名称' },
    roleKey: { type: DataTypes.STRING(50), allowNull: false, unique: true, comment: '角色权限字符' },
    sort: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    dataScope: {
      type: DataTypes.ENUM(...Object.values(DataScope)),
      allowNull: false,
      defaultValue: DataScope.SELF,
      comment: '数据权限范围',
    },
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1, comment: '1启用 0停用' },
    remark: { type: DataTypes.STRING(255), allowNull: true },
    delFlag: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'Role', tableName: 'sys_role' },
);
