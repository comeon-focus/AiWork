import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../db/index.js';
import { AI_TASK_STATUS, AI_CODING_STATUS, type AITaskStatus, type AicodingStatus } from './aiTask.js';

/** AI 子任务：挂在某个 AI 任务下的子条目，维护字段与 AI 任务一致 */
export class AiSubTask extends Model<InferAttributes<AiSubTask>, InferCreationAttributes<AiSubTask>> {
  declare id: CreationOptional<number>;
  declare parentId: number;
  declare title: string;
  declare summary: string | null;
  /** 会话 ID：继承父任务 sessionId（只读） */
  declare sessionId: string | null;
  /** 关联智能文档 id（单关联，可空） */
  declare smartDocId: number | null;
  /** 代码分支 */
  declare branch: string | null;
  /** 选用的 AI 模型；继承父任务，为空/null 表示使用系统默认模型 */
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

AiSubTask.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    parentId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '所属 AI 任务 id' },
    title: { type: DataTypes.STRING(100), allowNull: false, comment: '任务标题' },
    summary: { type: DataTypes.STRING(255), allowNull: true, comment: '任务摘要' },
    sessionId: { type: DataTypes.STRING(16), allowNull: true, comment: '会话 ID（继承父任务）' },
    smartDocId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '关联智能文档 id' },
    branch: { type: DataTypes.STRING(100), allowNull: true, comment: '代码分支' },
    model: { type: DataTypes.STRING(50), allowNull: true, comment: '选用的 AI 模型（继承父任务）' },
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
  { sequelize, modelName: 'AiSubTask', tableName: 'sys_ai_sub_task' },
);
