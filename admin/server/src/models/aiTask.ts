import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../db/index.js';

/** AI 任务状态枚举 */
export const AI_TASK_STATUS = ['待开始', '进行中', '已结束'] as const;
export type AITaskStatus = (typeof AI_TASK_STATUS)[number];

/** AICoding 状态枚举：暂无 / 编译中 / 编译成功 / 编译失败 */
export const AI_CODING_STATUS = ['暂无', '编译中', '编译成功', '编译失败'] as const;
export type AicodingStatus = (typeof AI_CODING_STATUS)[number];

/** AI 任务：智能编排下的任务条目，关联一条智能文档与一个代码分支 */
export class AITask extends Model<InferAttributes<AITask>, InferCreationAttributes<AITask>> {
  declare id: CreationOptional<number>;
  declare title: string;
  declare summary: string | null;
  /** 会话 ID：创建时自动生成的 16 位 base62 唯一标识 */
  declare sessionId: string;
  /** 关联智能文档 id（单关联，可空） */
  declare smartDocId: number | null;
  /** 代码分支 */
  declare branch: string | null;
  /** 选用的 AI 模型；为空/null 表示使用系统默认模型 */
  declare model: string | null;
  /** 任务状态：待开始 / 进行中 / 已结束 */
  declare status: AITaskStatus;
  /** AICoding 状态：暂无 / 编译中 / 编译成功 / 编译失败 */
  declare codingStatus: AicodingStatus;
  /** AICoding 编译失败原因（codingStatus 为『编译失败』时展示） */
  declare codingError: string | null;
  declare creatorId: number | null;
  declare creatorName: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

AITask.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    title: { type: DataTypes.STRING(100), allowNull: false, comment: '任务标题' },
    summary: { type: DataTypes.STRING(255), allowNull: true, comment: '任务摘要' },
    sessionId: { type: DataTypes.STRING(16), allowNull: false, unique: true, comment: '会话 ID（创建时自动生成）' },
    smartDocId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '关联智能文档 id' },
    branch: { type: DataTypes.STRING(100), allowNull: true, comment: '代码分支' },
    model: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: '选用的 AI 模型（null 表示使用系统默认模型）',
    },
    status: {
      type: DataTypes.ENUM(...AI_TASK_STATUS),
      allowNull: false,
      defaultValue: '待开始',
      comment: '任务状态：待开始/进行中/已结束',
    },
    codingStatus: {
      type: DataTypes.ENUM(...AI_CODING_STATUS),
      allowNull: false,
      defaultValue: '暂无',
      comment: 'AICoding 状态：暂无/编译中/编译成功/编译失败',
    },
    codingError: {
      type: DataTypes.STRING(512),
      allowNull: true,
      comment: 'AICoding 编译失败原因',
    },
    creatorId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    creatorName: { type: DataTypes.STRING(50), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'AITask', tableName: 'sys_ai_task' },
);
