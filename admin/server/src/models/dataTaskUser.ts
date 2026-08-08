import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../db/index.js';

/** 数据任务 ↔ 责任人（用户）多对多 */
export class DataTaskUser extends Model {
  declare id: number;
  declare taskId: number;
  declare userId: number;
}

DataTaskUser.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    taskId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  },
  {
    sequelize,
    modelName: 'DataTaskUser',
    tableName: 'sys_data_task_user',
    indexes: [{ unique: true, fields: ['task_id', 'user_id'] }],
  },
);
