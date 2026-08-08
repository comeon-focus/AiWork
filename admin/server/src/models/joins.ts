import { DataTypes, Model, type InferAttributes, type InferCreationAttributes } from 'sequelize';
import { sequelize } from '../db/index.js';

/** 用户-角色 多对多 */
export class UserRole extends Model<InferAttributes<UserRole>, InferCreationAttributes<UserRole>> {
  declare userId: number;
  declare roleId: number;
}
UserRole.init(
  {
    userId: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true },
    roleId: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true },
  },
  { sequelize, modelName: 'UserRole', tableName: 'sys_user_role', timestamps: false },
);

/** 角色-菜单 多对多（页面权限 + 操作权限的授权关系） */
export class RoleMenu extends Model<InferAttributes<RoleMenu>, InferCreationAttributes<RoleMenu>> {
  declare roleId: number;
  declare menuId: number;
}
RoleMenu.init(
  {
    roleId: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true },
    menuId: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true },
  },
  { sequelize, modelName: 'RoleMenu', tableName: 'sys_role_menu', timestamps: false },
);

/** 角色-部门 多对多，仅当角色 dataScope=CUSTOM 时生效 */
export class RoleDept extends Model<InferAttributes<RoleDept>, InferCreationAttributes<RoleDept>> {
  declare roleId: number;
  declare deptId: number;
}
RoleDept.init(
  {
    roleId: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true },
    deptId: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true },
  },
  { sequelize, modelName: 'RoleDept', tableName: 'sys_role_dept', timestamps: false },
);

/** 角色-代码库 多对多（代码库数据权限，决定角色能管理哪些代码库） */
export class RoleCodeRepo extends Model<
  InferAttributes<RoleCodeRepo>,
  InferCreationAttributes<RoleCodeRepo>
> {
  declare roleId: number;
  declare repoId: number;
}
RoleCodeRepo.init(
  {
    roleId: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true },
    repoId: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true },
  },
  { sequelize, modelName: 'RoleCodeRepo', tableName: 'sys_role_code_repo', timestamps: false },
);
