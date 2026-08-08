import { Op } from 'sequelize';
import { z } from 'zod';
import { DataSimInterface } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';

export const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'] as const;

/** 导入时单条记录校验：字段缺失 / 方法非法等视为该条失败，不影响其余条目 */
const importItemSchema = z.object({
  description: z.string().trim().min(1).max(255),
  method: z.enum(METHODS).default('GET'),
  path: z.string().trim().min(1).max(255),
  // responseData 接受任意类型（字符串/对象/数组/数字/布尔等），统一由 normalizeResponseData 序列化为字符串
  responseData: z.unknown().nullish(),
});

/** responseData 归一成字符串：对象 / 数组序列化为 JSON，其余置空 */
function normalizeResponseData(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

export interface DataSimInterfaceInput {
  projectId: string;
  description: string;
  method: string;
  path: string;
  responseData?: string | null;
}

export interface ListInterfaceFilter {
  projectId: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ImportDetail {
  index: number;
  reason: string;
}

export interface ImportResult {
  imported: number;
  updated: number;
  failed: number;
  errors: ImportDetail[];
}

export async function listDataSimInterfaces(filter: ListInterfaceFilter): Promise<PageResult<DataSimInterface>> {
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 10;
  const where: { [key: string]: unknown; [key: symbol]: unknown } = { projectId: filter.projectId };
  // 关键字搜索：模糊匹配描述 / 路径，或精确匹配请求方法（如输入 GET）
  if (filter.keyword && filter.keyword.trim()) {
    const kw = filter.keyword.trim();
    where[Op.or] = [
      { description: { [Op.like]: `%${kw}%` } },
      { path: { [Op.like]: `%${kw}%` } },
      { method: kw.toUpperCase() },
    ];
  }
  const { rows, count } = await DataSimInterface.findAndCountAll({
    where,
    order: [['id', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  return { list: rows, total: count, page, pageSize };
}

/** 同一项目下路径需唯一；excludeId 用于更新时排除自身 */
export async function isPathTaken(projectId: string, path: string, excludeId?: number): Promise<boolean> {
  const where: Record<string, unknown> = { projectId, path: path.trim() };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  const found = await DataSimInterface.findOne({ where });
  return !!found;
}

export async function createDataSimInterface(
  input: DataSimInterfaceInput,
  auth: { id: number; nickname: string },
) {
  return DataSimInterface.create({
    projectId: input.projectId,
    description: input.description.trim(),
    method: input.method,
    path: input.path.trim(),
    responseData: input.responseData ?? null,
    createdBy: auth.nickname,
    updatedBy: auth.nickname,
  });
}

export async function updateDataSimInterface(
  id: number,
  input: DataSimInterfaceInput,
  auth: { id: number; nickname: string },
) {
  const it = await DataSimInterface.findByPk(id);
  if (!it) throw ApiError.notFound('接口不存在');

  it.projectId = input.projectId;
  it.description = input.description.trim();
  it.method = input.method;
  it.path = input.path.trim();
  it.responseData = input.responseData ?? null;
  it.updatedBy = auth.nickname;
  await it.save();
  return it;
}

export async function removeDataSimInterface(id: number) {
  const it = await DataSimInterface.findByPk(id);
  if (!it) throw ApiError.notFound('接口不存在');
  await it.destroy();
}

/**
 * 批量导入：忽略传入的 id / projectId，统一使用目标项目的 projectId；
 * 每条记录独立校验与写入——path 已存在时更新该记录（upsert），不存在则新增，
 * 因此重新导入也能保证全部数据入库；单条校验失败或写入异常仅记录原因并继续下一条。
 * 返回新增 / 更新 / 失败数量及失败明细（含原因），便于定位问题条目。
 */
export async function importDataSimInterfaces(
  projectId: string,
  rawItems: unknown[],
  auth: { id: number; nickname: string },
): Promise<ImportResult> {
  let imported = 0;
  let updated = 0;
  let failed = 0;
  const errors: ImportDetail[] = [];
  // 预加载本项目已有 path -> id，既避免逐条查询，也用于 upsert 时定位待更新记录
  const existingMap = new Map<string, number>();
  for (const it of await DataSimInterface.findAll({ where: { projectId }, attributes: ['id', 'path'] })) {
    existingMap.set(it.path.trim(), it.id);
  }
  for (let i = 0; i < rawItems.length; i++) {
    const raw = rawItems[i];
    // 1) 单条结构校验：非法则记录原因并继续下一条
    const parsed = importItemSchema.safeParse(raw);
    if (!parsed.success) {
      failed++;
      const reason = parsed.error.issues.map((iss) => `${iss.path.join('.') || '记录'} ${iss.message}`).join('; ');
      errors.push({ index: i + 1, reason });
      continue;
    }
    const description = parsed.data.description.trim();
    const path = parsed.data.path.trim();
    const method = parsed.data.method;
    const responseData = normalizeResponseData(parsed.data.responseData);
    const existingId = existingMap.get(path);
    try {
      if (existingId != null) {
        // path 已存在：更新该记录，而非新增重复项
        await DataSimInterface.update(
          { description, method, responseData, updatedBy: auth.nickname },
          { where: { id: existingId } },
        );
        updated++;
      } else {
        const created = await DataSimInterface.create({
          projectId,
          description,
          method,
          path,
          responseData,
          createdBy: auth.nickname,
          updatedBy: auth.nickname,
        });
        imported++;
        existingMap.set(path, created.id);
      }
    } catch (e) {
      // 写入异常（如数据库约束）仅记录原因并继续下一条
      failed++;
      errors.push({ index: i + 1, reason: (e as Error).message });
    }
  }
  return { imported, updated, failed, errors };
}
