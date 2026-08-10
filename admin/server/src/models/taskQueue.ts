import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../db/index.js';

/** 任务队列状态枚举 */
export const TASK_QUEUE_STATUS = ['待执行', '执行中', '暂停中', '已执行'] as const;
export type TaskQueueStatus = (typeof TASK_QUEUE_STATUS)[number];

/**
 * 任务队列：把多个 AI 任务（含子任务）按序串成一个执行队列。
 * 历史不建与 AI 任务的关联（任务删除后队列记录仍需可查，title/sessionId 已快照）。
 */
export class TaskQueue extends Model<InferAttributes<TaskQueue>, InferCreationAttributes<TaskQueue>> {
  declare id: CreationOptional<number>;
  /** 队列名称（全局唯一） */
  declare name: string;
  declare status: CreationOptional<TaskQueueStatus>;
  /** 已请求暂停，等待当前任务跑完 */
  declare pauseRequested: CreationOptional<boolean>;
  /** 当前正在执行的条目 id */
  declare currentItemId: number | null;
  declare remark: string | null;
  declare startedAt: Date | null;
  declare finishedAt: Date | null;
  declare creatorId: number | null;
  declare creatorName: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

TaskQueue.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false, comment: '队列名称' },
    status: {
      type: DataTypes.ENUM(...TASK_QUEUE_STATUS),
      allowNull: false,
      defaultValue: '待执行',
      comment: '队列状态：待执行/执行中/暂停中/已执行',
    },
    pauseRequested: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, comment: '已请求暂停' },
    currentItemId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '当前执行条目 id' },
    remark: { type: DataTypes.STRING(255), allowNull: true, comment: '备注' },
    startedAt: { type: DataTypes.DATE, allowNull: true, comment: '首次开始执行时间' },
    finishedAt: { type: DataTypes.DATE, allowNull: true, comment: '全部执行完成时间' },
    creatorId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '创建人 id' },
    creatorName: { type: DataTypes.STRING(50), allowNull: true, comment: '创建人' },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'TaskQueue',
    tableName: 'sys_task_queue',
    indexes: [{ fields: ['status'] }, { fields: ['created_at'] }],
  },
);
