import { Op } from 'sequelize';
import { Dept, User } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { buildTree } from '../../utils/tree.js';
import { sequelize } from '../../db/index.js';

export interface DeptInput {
  parentId: number;
  name: string;
  orderNum: number;
  leader?: string | null;
  phone?: string | null;
  status: number;
}

/** 由父部门推导出祖级路径，根部门为 "0" */
async function resolveAncestors(parentId: number): Promise<string> {
  if (parentId === 0) return '0';
  const parent = await Dept.findOne({ where: { id: parentId, delFlag: 0 } });
  if (!parent) throw ApiError.badRequest('上级部门不存在');
  return `${parent.ancestors},${parent.id}`;
}

export async function listDepts(filter: { name?: string; status?: number }) {
  const where: Record<string, unknown> = { delFlag: 0 };
  if (filter.name) where.name = { [Op.like]: `%${filter.name}%` };
  if (filter.status !== undefined) where.status = filter.status;

  return Dept.findAll({
    where,
    order: [
      ['parentId', 'ASC'],
      ['orderNum', 'ASC'],
    ],
  });
}

export async function deptTree(filter: { name?: string; status?: number }) {
  const list = await listDepts(filter);
  return buildTree(list.map((d) => d.toJSON()));
}

export async function createDept(input: DeptInput) {
  const ancestors = await resolveAncestors(input.parentId);
  return Dept.create({ ...input, ancestors, delFlag: 0 });
}

export async function updateDept(id: number, input: DeptInput) {
  const dept = await Dept.findOne({ where: { id, delFlag: 0 } });
  if (!dept) throw ApiError.notFound('部门不存在');
  if (input.parentId === id) throw ApiError.badRequest('上级部门不能是自己');

  const newAncestors = await resolveAncestors(input.parentId);
  // 不能挂到自己的子孙下面，否则树会成环
  if (newAncestors.split(',').includes(String(id))) {
    throw ApiError.badRequest('上级部门不能是自己的下级');
  }

  const oldAncestors = dept.ancestors;

  await sequelize.transaction(async (tx) => {
    await dept.update({ ...input, ancestors: newAncestors }, { transaction: tx });

    // 父级变了要同步整棵子树的 ancestors 前缀，否则数据权限会算错
    if (oldAncestors !== newAncestors) {
      const children = await Dept.findAll({
        where: { delFlag: 0, ancestors: { [Op.like]: `${oldAncestors},${id}%` } },
        transaction: tx,
      });
      for (const child of children) {
        await child.update(
          { ancestors: child.ancestors.replace(`${oldAncestors},${id}`, `${newAncestors},${id}`) },
          { transaction: tx },
        );
      }
    }
  });

  return dept;
}

export async function removeDept(id: number) {
  const dept = await Dept.findOne({ where: { id, delFlag: 0 } });
  if (!dept) throw ApiError.notFound('部门不存在');

  const childCount = await Dept.count({ where: { parentId: id, delFlag: 0 } });
  if (childCount > 0) throw ApiError.conflict('该部门下还有子部门，无法删除');

  const userCount = await User.count({ where: { deptId: id, delFlag: 0 } });
  if (userCount > 0) throw ApiError.conflict('该部门下还有用户，无法删除');

  await dept.update({ delFlag: 1 });
}
