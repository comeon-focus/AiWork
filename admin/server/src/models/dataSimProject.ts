import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../db/index.js';

/**
 * 数据模拟项目：虚拟空间下的项目列表。
 * projectId 为业务侧生成的唯一标识（16 位 base62，参考值 iXt6sTD0TiYSjHe6），
 * 创建时自动生成、不可编辑。
 */
export class DataSimProject extends Model<InferAttributes<DataSimProject>, InferCreationAttributes<DataSimProject>> {
  declare id: CreationOptional<number>;
  declare projectId: string;
  declare name: string;
  declare createdBy: string | null;
  declare updatedBy: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

DataSimProject.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    projectId: { type: DataTypes.STRING(32), allowNull: false, unique: true, comment: '项目唯一标识' },
    name: { type: DataTypes.STRING(100), allowNull: false, comment: '项目名称' },
    createdBy: { type: DataTypes.STRING(50), allowNull: true, comment: '创建人' },
    updatedBy: { type: DataTypes.STRING(50), allowNull: true, comment: '更新人' },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'DataSimProject', tableName: 'sys_data_sim_project' },
);
