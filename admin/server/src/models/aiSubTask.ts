import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../db/index.js';
import { AI_TASK_STATUS, type AITaskStatus } from './aiTask.js';

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
  /** 任务状态：待开始 / 进行中 / 已结束 */
  declare status: AITaskStatus;
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
    status: {
      type: DataTypes.ENUM(...AI_TASK_STATUS),
      allowNull: false,
      defaultValue: '待开始',
      comment: '任务状态：待开始/进行中/已结束',
    },
    creatorId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    creatorName: { type: DataTypes.STRING(50), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'AiSubTask', tableName: 'sys_ai_sub_task' },
);
