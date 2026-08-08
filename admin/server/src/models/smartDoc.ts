import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../db/index.js';

/** 智能文档：需求经 AI 润色后生成的 Markdown 文档记录 */
export class SmartDoc extends Model<InferAttributes<SmartDoc>, InferCreationAttributes<SmartDoc>> {
  declare id: CreationOptional<number>;
  declare requirementId: number | null;
  declare title: string;
  declare summary: string | null;
  declare content: string | null;
  declare inputTokens: CreationOptional<number>;
  declare outputTokens: CreationOptional<number>;
  declare model: string | null;
  /** 来源需求的关联代码库 id（AI 优化时带入，便于追溯） */
  declare repoId: number | null;
  declare creatorId: number | null;
  declare creatorName: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

SmartDoc.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    requirementId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '来源需求 ID' },
    title: { type: DataTypes.STRING(200), allowNull: false, comment: '标题' },
    summary: { type: DataTypes.TEXT, allowNull: true, comment: '需求摘要' },
    content: { type: DataTypes.TEXT('medium'), allowNull: true, comment: '智能需求描述（Markdown）' },
    inputTokens: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, comment: '输入 token' },
    outputTokens: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, comment: '输出 token' },
    model: { type: DataTypes.STRING(100), allowNull: true, comment: 'AI 模型' },
    repoId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '关联代码库 id' },
    creatorId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    creatorName: { type: DataTypes.STRING(50), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'SmartDoc', tableName: 'sys_smart_doc' },
);
