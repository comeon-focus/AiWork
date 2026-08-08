import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../db/index.js';

/** 需求文档：每个需求可挂多个上传文档 */
export class DemandFile extends Model<InferAttributes<DemandFile>, InferCreationAttributes<DemandFile>> {
  declare id: CreationOptional<number>;
  declare demandId: number;
  declare fileName: string;
  declare fileType: 'doc' | 'image';
  declare url: string;
  declare createdAt: CreationOptional<Date>;
}

DemandFile.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    demandId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    fileName: { type: DataTypes.STRING(200), allowNull: false },
    fileType: { type: DataTypes.ENUM('doc', 'image'), allowNull: false, defaultValue: 'doc' },
    url: { type: DataTypes.STRING(300), allowNull: false },
    createdAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'DemandFile', tableName: 'sys_demand_file' },
);
