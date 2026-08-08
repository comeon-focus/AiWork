import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../db/index.js';

/** 需求附件：每个需求可挂多个文档 / 图片 */
export class RequirementFile extends Model<
  InferAttributes<RequirementFile>,
  InferCreationAttributes<RequirementFile>
> {
  declare id: CreationOptional<number>;
  declare requirementId: number;
  declare fileName: string;
  declare fileType: 'doc' | 'image';
  /** 附件归类：requirement=需求文档，design=设计稿 */
  declare kind: 'requirement' | 'design';
  declare url: string;
  declare createdAt: CreationOptional<Date>;
}

RequirementFile.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    requirementId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    fileName: { type: DataTypes.STRING(200), allowNull: false },
    fileType: { type: DataTypes.ENUM('doc', 'image'), allowNull: false, defaultValue: 'doc' },
    kind: { type: DataTypes.ENUM('requirement', 'design'), allowNull: false, defaultValue: 'requirement' },
    url: { type: DataTypes.STRING(300), allowNull: false },
    createdAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'RequirementFile', tableName: 'sys_requirement_file' },
);
