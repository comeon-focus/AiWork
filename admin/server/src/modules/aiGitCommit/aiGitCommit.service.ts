import { Op } from 'sequelize';
import { AiGitCommit, type AiGitCommitStatus } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';

/** 列表排除改动明细：单条可达数百行，10 行一页会把响应撑得很大，详情接口再给 */
const LIST_EXCLUDE = ['changedDetail'];

/** errorMsg 列宽 1000，git stderr 长度不可控，落库前先截断避免 MySQL 严格模式直接报错 */
const MAX_ERR = 1000;

export interface GitCommitRecordInput {
  sessionId: string;
  taskId: number;
  title: string;
  branch: string | null;
  status: AiGitCommitStatus;
  commitMessage: string;
  commitHash?: string | null;
  changedFiles?: number | null;
  changedDetail?: string | null;
  errorMsg?: string | null;
  creatorId: number | null;
  creatorName: string | null;
}

/**
 * 落一条提交记录。
 * 记录失败只告警：提交本身（尤其是已经推送成功的那次）不能因为写日志失败而被判为失败。
 */
export async function recordGitCommit(input: GitCommitRecordInput): Promise<void> {
  try {
    await AiGitCommit.create({
      ...input,
      errorMsg: input.errorMsg ? input.errorMsg.slice(0, MAX_ERR) : null,
    });
  } catch (e) {
    console.error(`[gitCommit] 提交记录写入失败 task=${input.taskId}:`, (e as Error).message);
  }
}

export async function listGitCommits(filter: {
  title?: string;
  sessionId?: string;
  status?: AiGitCommitStatus;
  taskId?: number;
  offset?: number;
  limit?: number;
}) {
  const where: Record<string, unknown> = {};
  if (filter.title) where.title = { [Op.like]: `%${filter.title}%` };
  // 模糊匹配：与 AI 任务、编译详情列表保持一致，只记得片段也能搜到
  if (filter.sessionId) where.sessionId = { [Op.like]: `%${filter.sessionId}%` };
  if (filter.status) where.status = filter.status;
  if (filter.taskId) where.taskId = filter.taskId;
  return AiGitCommit.findAndCountAll({
    where,
    offset: filter.offset,
    limit: filter.limit,
    order: [['id', 'DESC']],
    attributes: { exclude: LIST_EXCLUDE },
  });
}

/** 详情：含改动明细 */
export async function getGitCommit(id: number) {
  const row = await AiGitCommit.findByPk(id);
  if (!row) throw ApiError.notFound('提交记录不存在');
  return row;
}

export async function removeGitCommit(id: number) {
  const row = await AiGitCommit.findByPk(id, { attributes: ['id'] });
  if (!row) throw ApiError.notFound('提交记录不存在');
  await row.destroy();
}
