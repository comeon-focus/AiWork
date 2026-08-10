import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../db/index.js';

/** 任务队列条目状态枚举 */
export const TASK_QUEUE_ITEM_STATUS = ['待执行', '执行中', '已完成', '失败'] as const;
export type TaskQueueItemStatus = (typeof TASK_QUEUE_ITEM_STATUS)[number];

/** 队列条目：关联一个 AI 任务（父任务）或一个 AI 子任务（subTaskId 非空） */
export class TaskQueueItem extends Model<
  InferAttributes<TaskQueueItem>,
  InferCreationAttributes<TaskQueueItem>
> {
  declare id: CreationOptional<number>;
  declare queueId: number;
  /** 父级 AI 任务 id（子任务条目也存父 id） */
  declare taskId: number;
  /** AI 子任务 id；为空表示关联的是父任务本身 */
  declare subTaskId: number | null;
  declare taskType: '父任务' | '子任务';
  /** 关联时快照的任务标题 */
  declare title: string;
  /** 快照的会话 ID（父子任务共用父 sessionId） */
  declare sessionId: string | null;
  /** 执行顺序，升序 */
  declare orderNum: CreationOptional<number>;
  declare status: CreationOptional<TaskQueueItemStatus>;
  /** 失败原因 */
  declare errorMsg: string | null;
  /** 本次触发产生的 sys_ai_compile_log.id，用于跳转编译详情 */
  declare compileLogId: number | null;
  declare startedAt: Date | null;
  declare finishedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

TaskQueueItem.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    queueId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '所属队列 id' },
    taskId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '父级 AI 任务 id' },
    subTaskId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: 'AI 子任务 id（关联父任务本身时为空）',
    },
    taskType: { type: DataTypes.ENUM('父任务', '子任务'), allowNull: false, comment: '关联任务类型' },
    title: { type: DataTypes.STRING(100), allowNull: false, comment: '关联任务标题（快照）' },
    sessionId: { type: DataTypes.STRING(16), allowNull: true, comment: '会话 ID（快照）' },
    orderNum: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, comment: '执行顺序' },
    status: {
      type: DataTypes.ENUM(...TASK_QUEUE_ITEM_STATUS),
      allowNull: false,
      defaultValue: '待执行',
      comment: '条目状态：待执行/执行中/已完成/失败',
    },
    errorMsg: { type: DataTypes.STRING(512), allowNull: true, comment: '失败原因' },
    compileLogId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '关联编译详情 id' },
    startedAt: { type: DataTypes.DATE, allowNull: true, comment: '开始执行时间' },
    finishedAt: { type: DataTypes.DATE, allowNull: true, comment: '结束执行时间' },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'TaskQueueItem',
    tableName: 'sys_task_queue_item',
    indexes: [
      { fields: ['queue_id'] },
      { fields: ['queue_id', 'order_num'] },
      { fields: ['status'] },
    ],
  },
);
