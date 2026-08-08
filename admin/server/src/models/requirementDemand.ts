import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../db/index.js';

/** 任务 ↔ 需求 多对多关联 */
export class RequirementDemand extends Model {
  declare id: number;
  declare requirementId: number;
  declare demandId: number;
}

RequirementDemand.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    requirementId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    demandId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  },
  {
    sequelize,
    modelName: 'RequirementDemand',
    tableName: 'sys_requirement_demand',
    indexes: [{ unique: true, fields: ['requirement_id', 'demand_id'] }],
  },
);
