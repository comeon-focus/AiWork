import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../db/index.js';

/** 需求状态枚举 */
export const DEMAND_STATUS = ['待开始', '开发中', '已完成', '挂起中', '无效需求'] as const;
export type DemandStatus = (typeof DEMAND_STATUS)[number];

/** 需求列表：独立的「需求」聚合，任务可关联一个或多个需求 */
export class Demand extends Model<InferAttributes<Demand>, InferCreationAttributes<Demand>> {
  declare id: CreationOptional<number>;
  declare title: string;
  declare summary: string | null;
  declare content: string | null;
  declare status: DemandStatus;
  declare creatorId: number | null;
  declare creatorName: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Demand.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    title: { type: DataTypes.STRING(100), allowNull: false, comment: '需求标题' },
    summary: { type: DataTypes.STRING(255), allowNull: true, comment: '需求摘要' },
    content: { type: DataTypes.TEXT, allowNull: true, comment: '需求描述 / Markdown' },
    status: {
      type: DataTypes.ENUM(...DEMAND_STATUS),
      allowNull: false,
      defaultValue: '待开始',
      comment: '需求状态：待开始/开发中/已完成/挂起中/无效需求',
    },
    creatorId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    creatorName: { type: DataTypes.STRING(50), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'Demand', tableName: 'sys_demand' },
);
