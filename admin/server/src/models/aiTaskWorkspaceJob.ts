import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../db/index.js';

export const WORKSPACE_JOB_STATUS = ['待执行', '执行中', '已完成', '失败'] as const;
export type WorkspaceJobStatus = (typeof WORKSPACE_JOB_STATUS)[number];

/** AI 任务工作区准备任务：记录某个 AI 任务 clone 代码库 / 切分支的异步进度 */
export class AiTaskWorkspaceJob extends Model<
  InferAttributes<AiTaskWorkspaceJob>,
  InferCreationAttributes<AiTaskWorkspaceJob>
> {
  declare id: CreationOptional<number>;
  declare taskId: number;
  declare sessionId: string;
  declare status: WorkspaceJobStatus;
  declare errorMsg: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

AiTaskWorkspaceJob.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    taskId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      unique: true,
      comment: '关联的 AI 任务 id',
    },
    sessionId: {
      type: DataTypes.STRING(16),
      allowNull: false,
      comment: '任务会话 ID，用于定位工作区目录',
    },
    status: {
      type: DataTypes.ENUM(...WORKSPACE_JOB_STATUS),
      allowNull: false,
      defaultValue: '待执行',
      comment: '准备状态：待执行/执行中/已完成/失败',
    },
    errorMsg: {
      type: DataTypes.STRING(512),
      allowNull: true,
      comment: '失败原因',
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'AiTaskWorkspaceJob',
    tableName: 'sys_ai_task_workspace_job',
    indexes: [
      { fields: ['status'], name: 'idx_status' },
      { fields: ['session_id'], name: 'idx_session_id' },
    ],
  },
);
