import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../db/index.js';

/**
 * 数据任务：隶属于某个数据模拟项目（projectId），可关联多个责任人（用户）。
 * 任务下创建的接口在「同步」前不会出现在关联项目里；
 * status：0=进行中，1=成功（终态，锁定不可改），2=失败。
 */
export class DataTask extends Model<InferAttributes<DataTask>, InferCreationAttributes<DataTask>> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare projectId: string;
  declare interfaceCount: number;
  declare status: number;
  declare createdBy: string | null;
  declare updatedBy: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

DataTask.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false, comment: '任务名称' },
    projectId: { type: DataTypes.STRING(32), allowNull: false, comment: '关联项目ID' },
    interfaceCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, comment: '接口任务数量（目标）' },
    status: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0, comment: '0=进行中 1=成功 2=失败' },
    createdBy: { type: DataTypes.STRING(50), allowNull: true, comment: '创建人' },
    updatedBy: { type: DataTypes.STRING(50), allowNull: true, comment: '更新人' },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'DataTask', tableName: 'sys_data_task' },
);

export const TASK_STATUS = {
  IN_PROGRESS: 0,
  SUCCESS: 1,
  FAILED: 2,
} as const;
