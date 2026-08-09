import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../db/index.js';

/** 单次编译状态枚举 */
export const AI_COMPILE_STATUS = ['编译中', '编译成功', '编译失败'] as const;
export type AiCompileStatus = (typeof AI_COMPILE_STATUS)[number];

/** 触发来源类型 */
export const AI_COMPILE_TASK_TYPE = ['父任务', '子任务'] as const;
export type AiCompileTaskType = (typeof AI_COMPILE_TASK_TYPE)[number];

/**
 * AICoding 编译详情：每点击一次 AICoding 生成一条，通过 sessionId 与任务关联。
 * 刻意全字段冗余、不建 association —— 父任务删除后编译记录仍需保留可查（审计），
 * 届时 include 只会得到 null，join 没有意义。
 */
export class AiCompileLog extends Model<
  InferAttributes<AiCompileLog>,
  InferCreationAttributes<AiCompileLog>
> {
  declare id: CreationOptional<number>;
  /** 会话 ID：父任务 sessionId，父/子任务共用 */
  declare sessionId: string;
  /** 所属父级 AI 任务 id */
  declare taskId: number;
  /** AI 子任务 id；父任务触发时为空 */
  declare subTaskId: number | null;
  declare taskType: AiCompileTaskType;
  /** 编译标题：等于触发方自身标题（子任务用子任务标题） */
  declare title: string;
  declare smartDocId: number | null;
  declare branch: string | null;
  declare model: string | null;
  declare status: CreationOptional<AiCompileStatus>;
  declare errorMsg: CreationOptional<string | null>;
  /** 本次实际投喂 codebuddy 的提示词 */
  declare prompt: CreationOptional<string | null>;
  /**
   * 编译输出日志（人类可读文本，追加写入）。
   * MySQL 的 LONGTEXT 不支持 DEFAULT，所以这里刻意不设 CreationOptional：
   * 由类型强制创建时显式传 ''，避免插入 NULL 后 CONCAT(NULL, x) 把日志静默吞掉。
   */
  declare content: string;
  /** 日志字符数（Unicode 码点，与 MySQL CHAR_LENGTH 一致） */
  declare contentChars: CreationOptional<number>;
  declare lineCount: CreationOptional<number>;
  declare truncated: CreationOptional<boolean>;
  declare exitCode: CreationOptional<number | null>;
  declare resultSubtype: CreationOptional<string | null>;
  declare durationMs: CreationOptional<number | null>;
  declare numTurns: CreationOptional<number | null>;
  declare inputTokens: CreationOptional<number>;
  declare outputTokens: CreationOptional<number>;
  declare toolCalls: CreationOptional<number>;
  /** git 实测改动文件数（null 表示校验失败） */
  declare changedFiles: CreationOptional<number | null>;
  declare changedDetail: CreationOptional<string | null>;
  declare headBefore: CreationOptional<string | null>;
  declare headAfter: CreationOptional<string | null>;
  declare commitsAhead: CreationOptional<number | null>;
  declare startedAt: CreationOptional<Date>;
  declare finishedAt: CreationOptional<Date | null>;
  declare creatorId: CreationOptional<number | null>;
  declare creatorName: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

AiCompileLog.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    sessionId: { type: DataTypes.STRING(16), allowNull: false, comment: '会话 ID（父子任务共用）' },
    taskId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '所属父级 AI 任务 id' },
    subTaskId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: 'AI 子任务 id（父任务触发时为空）' },
    taskType: {
      type: DataTypes.ENUM(...AI_COMPILE_TASK_TYPE),
      allowNull: false,
      comment: '触发来源：父任务/子任务',
    },
    title: { type: DataTypes.STRING(100), allowNull: false, comment: '编译标题（同触发方任务标题）' },
    smartDocId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '本次使用的智能文档 id' },
    branch: { type: DataTypes.STRING(100), allowNull: true, comment: '代码分支（触发时快照）' },
    model: { type: DataTypes.STRING(50), allowNull: true, comment: '使用的模型' },
    status: {
      type: DataTypes.ENUM(...AI_COMPILE_STATUS),
      allowNull: false,
      defaultValue: '编译中',
      comment: '编译状态：编译中/编译成功/编译失败',
    },
    errorMsg: { type: DataTypes.STRING(512), allowNull: true, comment: '编译失败原因' },
    prompt: { type: DataTypes.TEXT('medium'), allowNull: true, comment: '本次投喂 codebuddy 的完整提示词' },
    // NOT NULL 但不能给 DEFAULT（MySQL 不允许 TEXT 类默认值），创建时必须显式传 ''
    content: { type: DataTypes.TEXT('long'), allowNull: false, comment: '编译输出日志（追加写入）' },
    contentChars: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, comment: '日志字符数（码点）' },
    lineCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, comment: '日志行数' },
    truncated: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, comment: '日志是否因超上限被截断' },
    exitCode: { type: DataTypes.INTEGER, allowNull: true, comment: '子进程退出码（启动失败为空）' },
    resultSubtype: { type: DataTypes.STRING(50), allowNull: true, comment: 'codebuddy result 事件 subtype' },
    durationMs: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: 'codebuddy 自报耗时（毫秒）' },
    numTurns: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '对话轮次' },
    inputTokens: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, comment: '输入 token' },
    outputTokens: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, comment: '输出 token' },
    toolCalls: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, comment: '工具调用次数' },
    changedFiles: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: 'git 实测改动文件数（空=未能校验）' },
    changedDetail: { type: DataTypes.TEXT, allowNull: true, comment: '改动明细：每行「状态 路径」，末尾附新增提交' },
    headBefore: { type: DataTypes.STRING(40), allowNull: true, comment: '运行前 HEAD commit' },
    headAfter: { type: DataTypes.STRING(40), allowNull: true, comment: '运行后 HEAD commit' },
    commitsAhead: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '运行期间新增提交数' },
    startedAt: { type: DataTypes.DATE, allowNull: false, comment: '开始时间' },
    finishedAt: { type: DataTypes.DATE, allowNull: true, comment: '结束时间' },
    creatorId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    creatorName: { type: DataTypes.STRING(50), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'AiCompileLog',
    tableName: 'sys_ai_compile_log',
    indexes: [
      { fields: ['session_id'] },
      { fields: ['task_id'] },
      { fields: ['status'] },
      { fields: ['created_at'] },
    ],
  },
);
