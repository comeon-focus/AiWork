import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
} from 'sequelize';
import { sequelize } from '../db/index.js';
import type { Role } from './role.js';
import type { Dept } from './dept.js';

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<number>;
  declare deptId: number | null;
  declare username: string;
  declare password: string;
  declare nickname: string;
  declare email: string | null;
  declare phone: string | null;
  declare avatar: string | null;
  declare gender: number;
  declare status: number;
  /** 超级管理员标记：短路放行全部权限，无需为其逐项勾选菜单 */
  declare isSuper: CreationOptional<boolean>;
  declare lastLoginAt: Date | null;
  declare lastLoginIp: string | null;
  declare remark: string | null;
  /** Git 密钥（SSH 公钥 / PAT 等），用户自助维护 */
  declare gitKey: string | null;
  declare delFlag: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare roles?: NonAttribute<Role[]>;
  declare dept?: NonAttribute<Dept>;
}

User.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    deptId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '所属部门' },
    username: { type: DataTypes.STRING(50), allowNull: false, unique: true, comment: '登录账号' },
    password: { type: DataTypes.STRING(100), allowNull: false, comment: 'bcrypt 哈希' },
    nickname: { type: DataTypes.STRING(50), allowNull: false, comment: '昵称' },
    email: { type: DataTypes.STRING(100), allowNull: true },
    phone: { type: DataTypes.STRING(20), allowNull: true },
    avatar: { type: DataTypes.STRING(255), allowNull: true },
    gender: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0, comment: '0未知 1男 2女' },
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1, comment: '1启用 0停用' },
    isSuper: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, comment: '是否超级管理员' },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true },
    lastLoginIp: { type: DataTypes.STRING(50), allowNull: true },
    remark: { type: DataTypes.STRING(255), allowNull: true },
    gitKey: { type: DataTypes.STRING(500), allowNull: true, comment: 'Git 密钥' },
    delFlag: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'User',
    tableName: 'sys_user',
    defaultScope: { attributes: { exclude: ['password'] } },
    scopes: { withPassword: { attributes: { include: ['password'] } } },
    indexes: [{ fields: ['dept_id'] }],
  },
);
