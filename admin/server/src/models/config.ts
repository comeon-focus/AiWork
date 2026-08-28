import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../db/index.js';

/** 系统配置：以 key-value 形式维护日常变量 */
export class Config extends Model<InferAttributes<Config>, InferCreationAttributes<Config>> {
  declare id: CreationOptional<number>;
  declare configKey: string;
  declare configValue: string;
  declare remark: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Config.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    configKey: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      comment: '配置键',
    },
    configValue: {
      type: DataTypes.STRING(500),
      allowNull: false,
      defaultValue: '',
      comment: '配置值',
    },
    remark: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: '配置说明',
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'Config',
    tableName: 'sys_config',
    indexes: [{ fields: ['config_key'], name: 'idx_config_key' }],
  },
);
