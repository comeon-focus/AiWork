import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../db/index.js';

/** 数据任务 ↔ 数据模拟项目 多对多（支持一个任务关联多个项目，并一键同步到全部关联项目） */
export class DataTaskProject extends Model {
  declare id: number;
  declare taskId: number;
  declare projectId: string;
}

DataTaskProject.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    taskId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    projectId: { type: DataTypes.STRING(32), allowNull: false, comment: '关联项目ID' },
  },
  {
    sequelize,
    modelName: 'DataTaskProject',
    tableName: 'sys_data_task_project',
    indexes: [{ unique: true, fields: ['task_id', 'project_id'] }],
  },
);
