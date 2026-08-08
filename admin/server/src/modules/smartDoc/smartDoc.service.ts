import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { Op } from 'sequelize';
import { Requirement, RequirementFile, SmartDoc, CodeRepo } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { config } from '../../config/index.js';
import { REQUIREMENT_UPLOAD_DIR } from '../../middleware/upload.js';

export interface SmartDocInput {
  title: string;
  summary?: string | null;
  content?: string | null;
  /** 关联代码库 id（可空） */
  repoId?: number | null;
}

export async function listSmartDocs(filter: { title?: string }) {
  const where: Record<string, unknown> = {};
  if (filter.title) where.title = { [Op.like]: `%${filter.title}%` };
  return SmartDoc.findAll({
    where,
    order: [['id', 'DESC']],
    include: [{ model: CodeRepo, as: 'codeRepo', attributes: ['id', 'name'], required: false }],
  });
}

export async function getSmartDoc(id: number) {
  const doc = await SmartDoc.findByPk(id);
  if (!doc) throw ApiError.notFound('智能文档不存在');
  return doc;
}

export async function updateSmartDoc(id: number, input: SmartDocInput) {
  const doc = await getSmartDoc(id);
  await doc.update({
    title: input.title.trim(),
    summary: input.summary?.trim() || null,
    content: input.content?.trim() || null,
    repoId: input.repoId ?? null,
  });
  return doc;
}

export async function removeSmartDoc(id: number) {
  const doc = await getSmartDoc(id);
  await doc.destroy();
}

/* ── AI 润色 ───────────────────────────────────────── */

interface CliItem {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  providerData?: { model?: string };
}

interface CliOutcome {
  markdown: string;
  inputTokens: number;
  outputTokens: number;
  model: string | null;
}

/** 从 `/api/uploads/xxx` 反推磁盘绝对路径，文件不存在则返回 null */
function diskPathOf(url: string): string | null {
  const name = path.basename(url);
  const full = path.join(REQUIREMENT_UPLOAD_DIR, name);
  return fs.existsSync(full) ? full : null;
}

function buildPrompt(req: Requirement, files: { fileName: string; disk: string }[]) {
  const lines: string[] = [
    '你是一名资深需求分析师。请把下面这条原始需求润色成一份结构清晰、可直接交付研发的需求文档。',
    '',
    '## 原始需求',
    `标题：${req.title}`,
  ];
  if (req.summary) lines.push(`摘要：${req.summary}`);
  lines.push('', '需求描述：', req.content?.trim() || '（无）');

  if (files.length) {
    lines.push(
      '',
      '## 需求附件（请使用 Read 工具逐个读取后再综合理解）',
      ...files.map((f) => `- ${f.fileName}：${f.disk}`),
    );
  }

  lines.push(
    '',
    '## 输出要求',
    '1. 只输出 Markdown 正文，不要任何寒暄、说明或代码块包裹整篇文档。',
    '2. 结构建议包含：需求背景、目标与价值、功能点拆解、业务流程、边界与异常场景、验收标准。',
    '3. 忠实于原始需求，不要臆造不存在的业务事实；信息缺失处标注「待确认」。',
    '4. 使用中文书写。',
  );
  return lines.join('\n');
}

function parseOutcome(raw: string): CliOutcome {
  const parsed = JSON.parse(raw) as CliItem | CliItem[];
  const items = Array.isArray(parsed) ? parsed : [parsed];

  const result = [...items].reverse().find((i) => i.type === 'result');
  if (!result) throw ApiError.badRequest('CodeBuddy 未返回结果');
  if (result.is_error) throw ApiError.badRequest(`AI 处理出错：${result.result ?? '未知错误'}`);

  return {
    markdown: (result.result ?? '').trim(),
    inputTokens: result.usage?.input_tokens ?? 0,
    outputTokens: result.usage?.output_tokens ?? 0,
    // 模型名只出现在 message / reasoning 项上，result 项没有
    model: items.find((i) => i.providerData?.model)?.providerData?.model ?? null,
  };
}

function runCodebuddy(prompt: string, extraDirs: string[]): Promise<CliOutcome> {
  const args = [
    config.ai.codebuddyBin,
    '-p',
    '--output-format',
    'json',
    '--no-session-persistence',
    '--tools',
    'Read',
    '--max-turns',
    '20',
  ];
  if (config.ai.model) args.push('--model', config.ai.model);
  if (extraDirs.length) args.push('--add-dir', ...extraDirs);
  args.push('-y', prompt);

  // CLI 结束时会 process.exit，走管道的 stdout 会被截断；重定向到临时文件可拿到完整输出
  const outFile = path.join(os.tmpdir(), `codebuddy-${Date.now()}-${Math.round(Math.random() * 1e9)}.json`);
  const fd = fs.openSync(outFile, 'w');

  return new Promise<CliOutcome>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: REQUIREMENT_UPLOAD_DIR,
      env: { ...process.env },
      stdio: ['ignore', fd, 'pipe'],
    });

    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(ApiError.badRequest(`AI 处理超时（${config.ai.timeoutMs}ms），请稍后重试`));
    }, config.ai.timeoutMs);

    child.stderr?.on('data', (b: Buffer) => {
      stderr += b.toString();
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(ApiError.badRequest(`无法启动 CodeBuddy：${err.message}`));
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        return reject(ApiError.badRequest(`CodeBuddy 执行失败（exit ${code}）：${stderr.slice(-500) || '无输出'}`));
      }
      try {
        resolve(parseOutcome(fs.readFileSync(outFile, 'utf8')));
      } catch (err) {
        reject(err instanceof ApiError ? err : ApiError.badRequest('解析 CodeBuddy 输出失败'));
      }
    });
  }).finally(() => {
    try {
      fs.closeSync(fd);
    } catch {
      /* 子进程可能已关闭该 fd */
    }
    fs.rm(outFile, { force: true }, () => undefined);
  });
}

/** 对指定需求做一次 AI 润色，生成一条智能文档记录 */
export async function aiOptimizeRequirement(
  requirementId: number,
  operator: { id?: number | null; name?: string | null },
) {
  const req = await Requirement.findByPk(requirementId);
  if (!req) throw ApiError.notFound('需求不存在');

  const rows = await RequirementFile.findAll({ where: { requirementId } });
  const files = rows
    .map((f) => ({ fileName: f.fileName, disk: diskPathOf(f.url) }))
    .filter((f): f is { fileName: string; disk: string } => Boolean(f.disk));

  if (!req.content?.trim() && !files.length) {
    throw ApiError.badRequest('该需求没有需求描述和需求文档，无法进行 AI 优化');
  }

  const outcome = await runCodebuddy(buildPrompt(req, files), files.length ? [REQUIREMENT_UPLOAD_DIR] : []);
  if (!outcome.markdown) throw ApiError.badRequest('AI 未生成有效内容');

  return SmartDoc.create({
    requirementId,
    title: req.title,
    summary: req.summary ?? null,
    content: outcome.markdown,
    inputTokens: outcome.inputTokens,
    outputTokens: outcome.outputTokens,
    model: outcome.model || config.ai.model || null,
    repoId: req.repoId ?? null,
    creatorId: operator.id ?? null,
    creatorName: operator.name ?? null,
  });
}
