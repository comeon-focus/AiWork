import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../db/index.js';

/** 登录日志 */
export class LoginLog extends Model<InferAttributes<LoginLog>, InferCreationAttributes<LoginLog>> {
  declare id: CreationOptional<number>;
  declare username: string;
  declare ip: string | null;
  declare browser: string | null;
  declare os: string | null;
  declare status: number;
  declare msg: string | null;
  declare loginAt: CreationOptional<Date>;
}

LoginLog.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    username: { type: DataTypes.STRING(50), allowNull: false },
    ip: { type: DataTypes.STRING(50), allowNull: true },
    browser: { type: DataTypes.STRING(50), allowNull: true },
    os: { type: DataTypes.STRING(50), allowNull: true },
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1, comment: '1成功 0失败' },
    msg: { type: DataTypes.STRING(255), allowNull: true },
    loginAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'LoginLog',
    tableName: 'sys_login_log',
    timestamps: false,
    indexes: [{ fields: ['username'] }, { fields: ['login_at'] }],
  },
);

/** 操作日志（由 operLog 中间件自动落库） */
export class OperLog extends Model<InferAttributes<OperLog>, InferCreationAttributes<OperLog>> {
  declare id: CreationOptional<number>;
  declare title: string;
  declare businessType: string;
  declare operId: number | null;
  declare operName: string | null;
  declare deptName: string | null;
  declare operUrl: string;
  declare requestMethod: string;
  declare operIp: string | null;
  declare operParam: string | null;
  declare jsonResult: string | null;
  declare status: number;
  declare errorMsg: string | null;
  declare costTime: number;
  declare operAt: CreationOptional<Date>;
}

OperLog.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    title: { type: DataTypes.STRING(50), allowNull: false, comment: '模块标题' },
    businessType: { type: DataTypes.STRING(20), allowNull: false, comment: 'INSERT/UPDATE/DELETE/GRANT/OTHER' },
    operId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    operName: { type: DataTypes.STRING(50), allowNull: true },
    deptName: { type: DataTypes.STRING(50), allowNull: true },
    operUrl: { type: DataTypes.STRING(255), allowNull: false },
    requestMethod: { type: DataTypes.STRING(10), allowNull: false },
    operIp: { type: DataTypes.STRING(50), allowNull: true },
    operParam: { type: DataTypes.TEXT, allowNull: true },
    jsonResult: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1, comment: '1成功 0失败' },
    errorMsg: { type: DataTypes.TEXT, allowNull: true },
    costTime: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '耗时(ms)' },
    operAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'OperLog',
    tableName: 'sys_oper_log',
    timestamps: false,
    indexes: [{ fields: ['oper_at'] }, { fields: ['oper_name'] }],
  },
);
