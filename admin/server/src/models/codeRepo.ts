import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../db/index.js';

/** 代码库：可独立授权给角色的数据资源，与菜单/部门是并列的一类权限客体 */
export class CodeRepo extends Model<InferAttributes<CodeRepo>, InferCreationAttributes<CodeRepo>> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare address: string | null;
  declare remark: string | null;
  declare status: CreationOptional<number>;
  declare sort: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

CodeRepo.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(50), allowNull: false, comment: '代码库名称' },
    address: { type: DataTypes.STRING(255), allowNull: true, comment: '地址/克隆地址' },
    remark: { type: DataTypes.STRING(255), allowNull: true, comment: '备注' },
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1, comment: '1启用 0停用' },
    sort: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'CodeRepo',
    tableName: 'sys_code_repo',
    indexes: [{ fields: ['name'] }],
  },
);
