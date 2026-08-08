import { Op } from 'sequelize';
import { Demand, DemandFile, RequirementDemand, DEMAND_STATUS, type DemandStatus } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { sequelize } from '../../db/index.js';

export interface DemandFileInput {
  fileName: string;
  fileType: 'doc' | 'image';
  url: string;
}

export interface DemandInput {
  title: string;
  summary?: string | null;
  content?: string | null;
  /** 需求状态，缺省为「待开始」 */
  status?: DemandStatus;
  creatorId?: number | null;
  creatorName?: string | null;
  files?: DemandFileInput[];
}

export interface DemandItem {
  id: number;
  title: string;
  summary: string | null;
  content: string | null;
  creatorId: number | null;
  creatorName: string | null;
  files: DemandFileInput[];
  /** 关联了本需求的任务条数 */
  taskCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** 批量取每个需求被多少任务关联，返回 Map<demandId, count> */
async function taskCountMap(demandIds: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (demandIds.length === 0) return map;
  const rows = await RequirementDemand.findAll({
    where: { demandId: { [Op.in]: demandIds } },
    attributes: ['demandId', [sequelize.fn('COUNT', sequelize.col('id')), 'cnt']],
    group: ['demand_id'],
  });
  for (const r of rows) {
    const plain = r.get({ plain: true }) as unknown as { demandId: number; cnt: string | number };
    map.set(plain.demandId, Number(plain.cnt));
  }
  return map;
}

export async function listDemands(filter: { title?: string }): Promise<DemandItem[]> {
  const where: Record<string, unknown> = {};
  if (filter.title) where.title = { [Op.like]: `%${filter.title}%` };

  const demands = await Demand.findAll({
    where,
    order: [['id', 'DESC']],
    include: [{ model: DemandFile, as: 'files', required: false }],
  });

  const countMap = await taskCountMap(demands.map((d) => d.id));

  return demands.map((d) => {
    const plain = d.get({ plain: true }) as unknown as {
      id: number;
      title: string;
      summary: string | null;
      content: string | null;
      creatorId: number | null;
      creatorName: string | null;
      files: DemandFileInput[];
      createdAt: Date;
      updatedAt: Date;
    };
    return { ...plain, taskCount: countMap.get(plain.id) ?? 0 };
  });
}

export async function getDemand(id: number) {
  const demand = await Demand.findByPk(id, { include: [{ model: DemandFile, as: 'files', required: false }] });
  if (!demand) throw ApiError.notFound('需求不存在');
  return demand;
}

export async function createDemand(input: DemandInput) {
  return sequelize.transaction(async (tx) => {
    const demand = await Demand.create(
      {
        title: input.title.trim(),
        summary: input.summary?.trim() || null,
        content: input.content?.trim() || null,
        status: input.status ?? '待开始',
        creatorId: input.creatorId ?? null,
        creatorName: input.creatorName ?? null,
      },
      { transaction: tx },
    );
    const files = input.files ?? [];
    if (files.length) {
      await DemandFile.bulkCreate(
        files.map((f) => ({ demandId: demand.id, fileName: f.fileName, fileType: f.fileType, url: f.url })),
        { transaction: tx },
      );
    }
    return demand;
  });
}

export async function updateDemand(id: number, input: DemandInput) {
  const demand = await Demand.findByPk(id);
  if (!demand) throw ApiError.notFound('需求不存在');

  await sequelize.transaction(async (tx) => {
    await demand.update(
      {
        title: input.title.trim(),
        summary: input.summary?.trim() || null,
        content: input.content?.trim() || null,
        status: input.status ?? '待开始',
      },
      { transaction: tx },
    );
    // 附件整体替换：先清后写
    await DemandFile.destroy({ where: { demandId: id }, transaction: tx });
    const files = input.files ?? [];
    if (files.length) {
      await DemandFile.bulkCreate(
        files.map((f) => ({ demandId: id, fileName: f.fileName, fileType: f.fileType, url: f.url })),
        { transaction: tx },
      );
    }
  });
  return demand;
}

export async function removeDemand(id: number) {
  const demand = await Demand.findByPk(id);
  if (!demand) throw ApiError.notFound('需求不存在');

  await sequelize.transaction(async (tx) => {
    await DemandFile.destroy({ where: { demandId: id }, transaction: tx });
    await RequirementDemand.destroy({ where: { demandId: id }, transaction: tx });
    await demand.destroy({ transaction: tx });
  });
}

/** 任务列表「关联需求」下拉候选 */
export async function listDemandOptions(): Promise<{ id: number; title: string }[]> {
  const demands = await Demand.findAll({ order: [['id', 'DESC']], attributes: ['id', 'title'] });
  return demands.map((d) => ({ id: d.id, title: d.title }));
}
