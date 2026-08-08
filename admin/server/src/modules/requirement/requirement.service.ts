import { Op, type Transaction } from 'sequelize';
import { Requirement, RequirementFile, Demand, RequirementDemand, CodeRepo } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { sequelize } from '../../db/index.js';

export interface RequirementFileInput {
  fileName: string;
  fileType: 'doc' | 'image';
  kind: 'requirement' | 'design';
  url: string;
}

export interface RequirementInput {
  title: string;
  summary?: string | null;
  content?: string | null;
  creatorId?: number | null;
  creatorName?: string | null;
  files?: RequirementFileInput[];
  /** 关联的需求 id 列表（多对多） */
  demandIds?: number[];
  /** 关联的代码库 id（单关联，可空） */
  repoId?: number | null;
}

export async function listRequirements(filter: { title?: string }) {
  const where: Record<string, unknown> = {};
  if (filter.title) where.title = { [Op.like]: `%${filter.title}%` };

  return Requirement.findAll({
    where,
    order: [['id', 'DESC']],
    include: [
      { model: RequirementFile, as: 'files', required: false },
      { model: Demand, as: 'demands', attributes: ['id', 'title'], through: { attributes: [] }, required: false },
      { model: CodeRepo, as: 'codeRepo', attributes: ['id', 'name'], required: false },
    ],
  });
}

export async function createRequirement(input: RequirementInput) {
  return sequelize.transaction(async (tx) => {
    const req = await Requirement.create(
      {
        title: input.title.trim(),
        summary: input.summary?.trim() || null,
        content: input.content?.trim() || null,
        repoId: input.repoId ?? null,
        creatorId: input.creatorId ?? null,
        creatorName: input.creatorName ?? null,
      },
      { transaction: tx },
    );
    const files = input.files ?? [];
    if (files.length) {
      await RequirementFile.bulkCreate(
        files.map((f) => ({
          requirementId: req.id,
          fileName: f.fileName,
          fileType: f.fileType,
          kind: f.kind,
          url: f.url,
        })),
        { transaction: tx },
      );
    }
    await replaceDemands(req.id, input.demandIds ?? [], tx);
    return req;
  });
}

export async function updateRequirement(id: number, input: RequirementInput) {
  const req = await Requirement.findByPk(id);
  if (!req) throw ApiError.notFound('需求不存在');

  await sequelize.transaction(async (tx) => {
    await req.update(
      {
        title: input.title.trim(),
        summary: input.summary?.trim() || null,
        content: input.content?.trim() || null,
        repoId: input.repoId ?? null,
      },
      { transaction: tx },
    );
    // 附件整体替换：先清后写，保证与表单最终状态一致
    await RequirementFile.destroy({ where: { requirementId: id }, transaction: tx });
    const files = input.files ?? [];
    if (files.length) {
      await RequirementFile.bulkCreate(
        files.map((f) => ({
          requirementId: id,
          fileName: f.fileName,
          fileType: f.fileType,
          kind: f.kind,
          url: f.url,
        })),
        { transaction: tx },
      );
    }
    await replaceDemands(id, input.demandIds ?? [], tx);
  });
  return req;
}

/** 整体替换任务的关联需求：先清后写 */
async function replaceDemands(requirementId: number, demandIds: number[], tx: Transaction) {
  await RequirementDemand.destroy({ where: { requirementId }, transaction: tx });
  if (demandIds.length) {
    await RequirementDemand.bulkCreate(
      demandIds.map((demandId) => ({ requirementId, demandId })),
      { transaction: tx, ignoreDuplicates: true },
    );
  }
}

export async function removeRequirement(id: number) {
  const req = await Requirement.findByPk(id);
  if (!req) throw ApiError.notFound('需求不存在');

  await sequelize.transaction(async (tx) => {
    await RequirementFile.destroy({ where: { requirementId: id }, transaction: tx });
    await RequirementDemand.destroy({ where: { requirementId: id }, transaction: tx });
    await req.destroy({ transaction: tx });
  });
}
