import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../db/index.js';

export class Dept extends Model<InferAttributes<Dept>, InferCreationAttributes<Dept>> {
  declare id: CreationOptional<number>;
  declare parentId: number;
  /**
   * 祖级路径，形如 "0,1,3"。
   * 冗余存储换取「本部门及子级」一条 LIKE 即可查出整棵子树，避免递归查询。
   */
  declare ancestors: string;
  declare name: string;
  declare orderNum: number;
  declare leader: string | null;
  declare phone: string | null;
  declare status: number;
  declare delFlag: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Dept.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    parentId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, comment: '父部门id，0为根' },
    ancestors: { type: DataTypes.STRING(255), allowNull: false, defaultValue: '0', comment: '祖级路径' },
    name: { type: DataTypes.STRING(50), allowNull: false, comment: '部门名称' },
    orderNum: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '排序' },
    leader: { type: DataTypes.STRING(50), allowNull: true, comment: '负责人' },
    phone: { type: DataTypes.STRING(20), allowNull: true, comment: '联系电话' },
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1, comment: '1启用 0停用' },
    delFlag: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0, comment: '0正常 1已删除' },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'Dept',
    tableName: 'sys_dept',
    indexes: [{ fields: ['parent_id'] }, { fields: ['ancestors'] }],
  },
);
