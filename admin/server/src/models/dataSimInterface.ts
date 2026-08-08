import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../db/index.js';

/**
 * 数据模拟接口：隶属于某个项目（projectId），一个项目可维护多个接口。
 * responseData 为响应数据代码片段，由前端用 CodeMirror 维护。
 */
export class DataSimInterface extends Model<InferAttributes<DataSimInterface>, InferCreationAttributes<DataSimInterface>> {
  declare id: CreationOptional<number>;
  declare projectId: string;
  declare description: string;
  declare method: string;
  declare path: string;
  declare responseData: string | null;
  declare createdBy: string | null;
  declare updatedBy: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

DataSimInterface.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    projectId: { type: DataTypes.STRING(32), allowNull: false, comment: '所属项目ID' },
    description: { type: DataTypes.STRING(255), allowNull: false, comment: '接口描述' },
    method: { type: DataTypes.STRING(10), allowNull: false, comment: 'HTTP 方法' },
    path: { type: DataTypes.STRING(255), allowNull: false, comment: '接口路径' },
    responseData: { type: DataTypes.TEXT('long'), allowNull: true, comment: '响应数据代码片段' },
    createdBy: { type: DataTypes.STRING(50), allowNull: true, comment: '创建人' },
    updatedBy: { type: DataTypes.STRING(50), allowNull: true, comment: '更新人' },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'DataSimInterface',
    tableName: 'sys_data_sim_interface',
    indexes: [{ fields: ['project_id'] }],
  },
);
