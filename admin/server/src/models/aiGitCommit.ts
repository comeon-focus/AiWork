import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../db/index.js';

/** 一次「提交代码」的结果状态 */
export const AI_GIT_COMMIT_STATUS = ['提交成功', '提交失败'] as const;
export type AiGitCommitStatus = (typeof AI_GIT_COMMIT_STATUS)[number];

/**
 * GIT 提交记录：AI 任务每点击一次「提交代码」生成一条，成功与失败都留痕。
 * 与编译详情同样刻意全字段冗余、不建 association —— 任务删除后记录仍需可查（审计）。
 */
export class AiGitCommit extends Model<
  InferAttributes<AiGitCommit>,
  InferCreationAttributes<AiGitCommit>
> {
  declare id: CreationOptional<number>;
  /** 会话 ID：取自所属 AI 任务 */
  declare sessionId: string;
  /** 所属 AI 任务 id */
  declare taskId: number;
  /** 记录标题：等于 AI 任务标题 */
  declare title: string;
  /** 提交所在分支；前置校验失败时退化为任务上登记的分支 */
  declare branch: CreationOptional<string | null>;
  declare status: AiGitCommitStatus;
  /** 本次使用的 commit 注释 */
  declare commitMessage: string;
  /** 短 commit hash；push 失败时本地提交已生成，此字段仍有值 */
  declare commitHash: CreationOptional<string | null>;
  declare changedFiles: CreationOptional<number | null>;
  /** 改动明细：每行「状态 路径」 */
  declare changedDetail: CreationOptional<string | null>;
  /** 每个改动文件对应的 diff 内容，JSON 对象：{ [path]: diffText } */
  declare changedFileDiffs: CreationOptional<string | null>;
  /** 失败原因（status 为『提交失败』时有值） */
  declare errorMsg: CreationOptional<string | null>;
  declare creatorId: CreationOptional<number | null>;
  declare creatorName: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

AiGitCommit.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    sessionId: { type: DataTypes.STRING(16), allowNull: false, comment: '会话 ID（取自 AI 任务）' },
    taskId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '所属 AI 任务 id' },
    title: { type: DataTypes.STRING(100), allowNull: false, comment: '记录标题（同 AI 任务标题）' },
    branch: { type: DataTypes.STRING(100), allowNull: true, comment: '提交所在分支' },
    status: {
      type: DataTypes.ENUM(...AI_GIT_COMMIT_STATUS),
      allowNull: false,
      comment: '提交结果：提交成功/提交失败',
    },
    commitMessage: { type: DataTypes.STRING(512), allowNull: false, comment: '本次 commit 注释' },
    commitHash: { type: DataTypes.STRING(40), allowNull: true, comment: '短 commit hash' },
    changedFiles: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '本次提交涉及的文件数' },
    changedDetail: { type: DataTypes.TEXT, allowNull: true, comment: '改动明细：每行「状态 路径」' },
    changedFileDiffs: { type: DataTypes.TEXT('long'), allowNull: true, comment: '每个改动文件对应的 diff 内容，JSON 对象' },
    // 失败原因会带上 git stderr，512 不够用（推送失败的报错常见 300~600 字）
    errorMsg: { type: DataTypes.STRING(1000), allowNull: true, comment: '失败原因' },
    creatorId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    creatorName: { type: DataTypes.STRING(50), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'AiGitCommit',
    tableName: 'sys_ai_git_commit',
    indexes: [
      { fields: ['session_id'] },
      { fields: ['task_id'] },
      { fields: ['status'] },
      { fields: ['created_at'] },
    ],
  },
);
