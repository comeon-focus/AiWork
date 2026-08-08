import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../db/index.js';

/** 需求：用户上传的文档、图片与文字记录，按列表管理 */
export class Requirement extends Model<InferAttributes<Requirement>, InferCreationAttributes<Requirement>> {
  declare id: CreationOptional<number>;
  declare title: string;
  declare summary: string | null;
  declare content: string | null;
  /** 关联的代码库 id（单关联） */
  declare repoId: number | null;
  declare creatorId: number | null;
  declare creatorName: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Requirement.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    title: { type: DataTypes.STRING(100), allowNull: false, comment: '需求标题' },
    summary: { type: DataTypes.STRING(255), allowNull: true, comment: '需求摘要' },
    content: { type: DataTypes.TEXT, allowNull: true, comment: '需求描述 / 文字记录' },
    repoId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '关联代码库 id' },
    creatorId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    creatorName: { type: DataTypes.STRING(50), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'Requirement', tableName: 'sys_requirement' },
);
