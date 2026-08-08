import { Op } from 'sequelize';
import { randomBytes } from 'crypto';
import { sequelize } from '../../db/index.js';
import { DataSimProject, DataSimInterface } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';

/** base62 字符集，与参考值 iXt6sTD0TiYSjHe6 的构成一致（大小写字母 + 数字） */
const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * 生成 16 位 base62 唯一标识，格式参考 iXt6sTD0TiYSjHe6。
 * 通过查询去重保证唯一；碰撞概率极低，循环重试即可。
 */
export function generateProjectId(len = 16): string {
  const bytes = randomBytes(len);
  let id = '';
  for (let i = 0; i < len; i++) id += CHARSET[bytes[i] % CHARSET.length];
  return id;
}

export interface DataSimProjectInput {
  name: string;
}

export async function listDataSimProjects(filter: { name?: string }) {
  const where: Record<string, unknown> = {};
  if (filter.name) where.name = { [Op.like]: `%${filter.name}%` };
  return DataSimProject.findAll({ where, order: [['id', 'DESC']] });
}

export async function createDataSimProject(
  input: DataSimProjectInput,
  auth: { id: number; nickname: string },
) {
  let projectId = generateProjectId();
  while (await DataSimProject.findOne({ where: { projectId } })) {
    projectId = generateProjectId();
  }
  return DataSimProject.create({
    projectId,
    name: input.name.trim(),
    createdBy: auth.nickname,
    updatedBy: auth.nickname,
  });
}

export async function updateDataSimProject(
  id: number,
  input: DataSimProjectInput,
  auth: { id: number; nickname: string },
) {
  const project = await DataSimProject.findByPk(id);
  if (!project) throw ApiError.notFound('项目不存在');

  project.name = input.name.trim();
  project.updatedBy = auth.nickname;
  await project.save();
  return project;
}

export async function removeDataSimProject(id: number) {
  const project = await DataSimProject.findByPk(id);
  if (!project) throw ApiError.notFound('项目不存在');
  // 事务内先删除该项目下的全部接口，再删除项目本身，保证级联一致
  const t = await sequelize.transaction();
  try {
    await DataSimInterface.destroy({ where: { projectId: project.projectId }, transaction: t });
    await project.destroy({ transaction: t });
    await t.commit();
  } catch (e) {
    await t.rollback();
    throw e;
  }
}
