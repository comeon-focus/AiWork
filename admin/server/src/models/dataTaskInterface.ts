import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../db/index.js';

/**
 * 数据任务下的接口：创建后默认有效（无状态字段），
 * 在所属任务「同步」前不会进入关联项目的接口列表；synced 标记是否已同步到项目。
 */
export class DataTaskInterface extends Model<
  InferAttributes<DataTaskInterface>,
  InferCreationAttributes<DataTaskInterface>
> {
  declare id: CreationOptional<number>;
  declare taskId: number;
  declare description: string;
  declare method: string;
  declare path: string;
  declare responseData: string | null;
  declare synced: CreationOptional<boolean>;
  declare createdBy: string | null;
  declare updatedBy: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

DataTaskInterface.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    taskId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '所属任务ID' },
    description: { type: DataTypes.STRING(255), allowNull: false, comment: '接口描述' },
    method: { type: DataTypes.STRING(10), allowNull: false, comment: 'HTTP 方法' },
    path: { type: DataTypes.STRING(255), allowNull: false, comment: '接口路径' },
    responseData: { type: DataTypes.TEXT('long'), allowNull: true, comment: '响应数据代码片段' },
    synced: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, comment: '是否已同步到项目' },
    createdBy: { type: DataTypes.STRING(50), allowNull: true, comment: '创建人' },
    updatedBy: { type: DataTypes.STRING(50), allowNull: true, comment: '更新人' },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'DataTaskInterface',
    tableName: 'sys_data_task_interface',
    indexes: [{ fields: ['task_id'] }],
  },
);
