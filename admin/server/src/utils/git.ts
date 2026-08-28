import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/** AI 任务工作区根目录：当前运行环境目录下的 AiWorkSpace */
export const AI_WORKSPACE_DIR = path.resolve(process.cwd(), 'AiWorkSpace');

/** 确保工作区根目录存在 */
export async function ensureWorkspaceDir(): Promise<void> {
  await fs.promises.mkdir(AI_WORKSPACE_DIR, { recursive: true });
}

/** 单个 AI 任务的代码目录：以 SessionID 命名的外层文件夹 */
export function taskWorkspaceDir(sessionId: string): string {
  return path.join(AI_WORKSPACE_DIR, sessionId);
}

/**
 * 克隆代码库到 AiWorkSpace/<sessionId>（外层文件夹以 SessionID 命名）。
 * 返回克隆后的目录绝对路径；克隆失败（含超时）向上抛出，并清理已产生的残留目录。
 * 超时用于避免无 TTY 环境下（如 SSH 私钥口令交互）无限挂起请求。
 */
export async function cloneRepo(repoUrl: string, sessionId: string, timeoutMs = 300000): Promise<string> {
  await ensureWorkspaceDir();
  const target = taskWorkspaceDir(sessionId);
  try {
    // --quiet：抑制 git clone 的进度输出，避免 stderr 超过 exec 默认 1MB buffer 被异常终止
    await execAsync(`git clone --quiet "${repoUrl}" "${target}"`, {
      cwd: AI_WORKSPACE_DIR,
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch (e) {
    await fs.promises.rm(target, { recursive: true, force: true }).catch(() => undefined);
    throw e;
  }
  return target;
}

/**
 * 切换到指定分支。分支不存在（远端也无同名分支）时向上抛出，由调用方决定是否创建远程分支。
 * 切换为本地已存在的默认分支时为空操作；分支在远端存在时会自动创建本地跟踪分支。
 */
export async function checkoutBranch(repoDir: string, branch: string, timeoutMs = 120000): Promise<void> {
  await execAsync(`git checkout "${branch}"`, { cwd: repoDir, timeout: timeoutMs, maxBuffer: 50 * 1024 * 1024 });
}

/** 判断 checkout 报错是否因「分支不存在」（pathspec 未匹配），这类情况应改走创建远程分支流程 */
export function isBranchNotFound(errMsg: string): boolean {
  return /pathspec.+did not match/i.test(errMsg) || /did not match any/i.test(errMsg);
}

/**
 * 分支不存在时：基于当前 HEAD 创建本地分支并推送到远端（创建远程分支）。
 * 推送失败（如无写权限）向上抛出，由调用方清理已拉取的目录。
 */
export async function createAndPushBranch(repoDir: string, branch: string, timeoutMs = 120000): Promise<void> {
  await execAsync(`git checkout -b "${branch}"`, { cwd: repoDir, timeout: timeoutMs, maxBuffer: 50 * 1024 * 1024 });
  // --quiet：抑制 push 进度输出，避免大仓库推送时 stderr 撑爆 buffer
  await execAsync(`git push --quiet -u origin "${branch}"`, { cwd: repoDir, timeout: timeoutMs, maxBuffer: 50 * 1024 * 1024 });
}

/** 判断任务代码库是否存在未提交的改动（用于『已结束』前的校验） */
export async function hasUncommittedChanges(sessionId: string): Promise<boolean> {
  const dir = taskWorkspaceDir(sessionId);
  try {
    const { stdout } = await execAsync('git status --porcelain', { cwd: dir, timeout: 30000 });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/** 运行前的代码库快照，用于事后判定「这一次到底改了什么」 */
export interface RepoSnapshot {
  head: string | null;
  branch: string | null;
  /** 运行前就已存在的未提交改动路径集合 */
  dirty: Set<string>;
}

/** 一次运行造成的实际改动（全部为 null 表示 git 校验失败） */
export interface RepoChange {
  changedFiles: number | null;
  detail: string | null;
  headBefore: string | null;
  headAfter: string | null;
  commitsAhead: number | null;
}

// core.quotepath=false：否则中文文件名会被返回成八进制转义
const GIT = 'git -c core.quotepath=false';

async function gitOut(dir: string, cmd: string): Promise<string> {
  const { stdout } = await execAsync(`${GIT} ${cmd}`, { cwd: dir, timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  return stdout.trim();
}

/** 解析 `git status --porcelain` 输出为路径集合（重命名取箭头右侧的新路径） */
function parsePorcelain(stdout: string): Set<string> {
  const set = new Set<string>();
  for (const raw of stdout.split('\n')) {
    const l = raw.trimEnd();
    if (!l) continue;
    const p = l.slice(3);
    const arrow = p.indexOf(' -> ');
    set.add(arrow >= 0 ? p.slice(arrow + 4) : p);
  }
  return set;
}

/** AICoding 启动前对代码库拍快照 */
export async function snapshotRepo(dir: string): Promise<RepoSnapshot> {
  try {
    const [head, branch, status] = await Promise.all([
      gitOut(dir, 'rev-parse HEAD').catch(() => ''),
      gitOut(dir, 'rev-parse --abbrev-ref HEAD').catch(() => ''),
      gitOut(dir, 'status --porcelain').catch(() => ''),
    ]);
    return { head: head || null, branch: branch || null, dirty: parsePorcelain(status) };
  } catch {
    return { head: null, branch: null, dirty: new Set() };
  }
}

/**
 * 对比快照，算出本次运行的实际改动。
 * - 工作区改动取集合差（父子任务共用工作区，不减去运行前的脏文件会冒领上一次的改动）
 * - 同时比对 HEAD：codebuddy 可能自动提交，此时工作区是干净的但已领先若干提交
 * 任何异常都返回全 null —— git 校验失败绝不能让编译流程失败。
 */
export async function diffRepoSince(dir: string, before: RepoSnapshot): Promise<RepoChange> {
  const empty: RepoChange = {
    changedFiles: null,
    detail: null,
    headBefore: before.head,
    headAfter: null,
    commitsAhead: null,
  };
  try {
    const headAfter = (await gitOut(dir, 'rev-parse HEAD').catch(() => '')) || null;
    const dirtyAfter = parsePorcelain(await gitOut(dir, 'status --porcelain').catch(() => ''));

    const changed = new Map<string, string>();
    for (const p of dirtyAfter) {
      if (!before.dirty.has(p)) changed.set(p, 'M');
    }

    let commitsAhead: number | null = null;
    let commitLines = '';
    if (before.head && headAfter && before.head !== headAfter) {
      const range = `${before.head}..${headAfter}`;
      const nameStatus = await gitOut(dir, `diff --name-status ${before.head} ${headAfter}`).catch(() => '');
      for (const raw of nameStatus.split('\n')) {
        const l = raw.trim();
        if (!l) continue;
        const [flag, ...rest] = l.split('\t');
        const p = rest[rest.length - 1];
        if (p) changed.set(p, flag.charAt(0));
      }
      const cnt = await gitOut(dir, `rev-list --count ${range}`).catch(() => '');
      commitsAhead = cnt ? Number(cnt) : null;
      commitLines = await gitOut(dir, `log --oneline -50 ${range}`).catch(() => '');
    }

    const lines = [...changed.entries()].slice(0, 200).map(([p, f]) => `${f} ${p}`);
    if (changed.size > 200) lines.push(`… 其余 ${changed.size - 200} 个文件省略`);
    if (commitLines) lines.push('--- 新增提交 ---', commitLines);

    return {
      changedFiles: changed.size,
      detail: lines.length ? lines.join('\n') : null,
      headBefore: before.head,
      headAfter,
      commitsAhead,
    };
  } catch {
    return empty;
  }
}

/** 一次「提交代码」的结果 */
export interface CommitResult {
  /** 本次提交涉及的文件数 */
  changedFiles: number;
  /** 短 commit hash */
  commitHash: string;
  /** 提交所在分支 */
  branch: string;
  /** 改动明细：每行「状态 路径」，超出上限截断 */
  detail: string;
  /** 每个改动文件对应的 diff 内容 */
  fileDiffs: Record<string, string>;
}

/** 提交记录里保留的改动明细最大行数 */
const MAX_DETAIL_LINES = 200;

/** 单文件 diff 入库上限，避免超大文件撑爆 LONGTEXT */
const MAX_FILE_DIFF_BYTES = 64 * 1024;

/**
 * commit 已经落地之后的失败（拉取或推送）。
 * 单独成类是因为这一刻的语义很特殊：改动已经进了本地仓库，不能提示用户「重新提交」，
 * 否则他会以为改动丢了而反复点击。result 里带着完整的提交信息供失败记录留痕。
 */
export class GitAfterCommitError extends Error {
  constructor(
    readonly stage: 'pull' | 'push',
    readonly result: CommitResult,
    readonly reason: string,
  ) {
    super(reason);
    this.name = 'GitAfterCommitError';
  }
}

/** porcelain 输出转成可读明细，过长时截断。只去行尾空格，保留行首状态前缀，避免路径首字符被切掉 */
function buildDetail(status: string): string {
  const lines = status
    .split('\n')
    .map((l) => l.trimEnd())
    .filter(Boolean);
  if (lines.length <= MAX_DETAIL_LINES) return lines.join('\n');
  return [...lines.slice(0, MAX_DETAIL_LINES), `… 其余 ${lines.length - MAX_DETAIL_LINES} 个文件省略`].join('\n');
}

/**
 * 为每个改动文件生成 diff（基于刚生成的 commit）。
 * 单个文件 diff 超过上限时截断并追加提示。
 */
async function buildFileDiffs(dir: string, commitHash: string, files: string[]): Promise<Record<string, string>> {
  const diffs: Record<string, string> = {};
  for (const file of files) {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['-c', 'core.quotepath=false', 'show', commitHash, '--', file],
        { cwd: dir, timeout: 30000, maxBuffer: 8 * 1024 * 1024 },
      );
      const raw = stdout;
      diffs[file] =
        Buffer.byteLength(raw, 'utf8') > MAX_FILE_DIFF_BYTES
          ? `${raw.slice(0, MAX_FILE_DIFF_BYTES)}\n… 文件 diff 过长，已截断`
          : raw;
    } catch {
      diffs[file] = '（无法获取该文件 diff）';
    }
  }
  return diffs;
}

/**
 * 不经过 shell 执行 git —— 提交信息里带任务标题，属于用户输入，
 * 拼进 shell 字符串会有命令注入风险，必须走参数数组。
 */
async function gitExec(dir: string, args: string[], timeoutMs = 120000): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-c', 'core.quotepath=false', ...args], {
    cwd: dir,
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
  return stdout.trim();
}

/** git 报错信息优先取 stderr，比 "Command failed: ..." 可读得多 */
function gitErrMsg(e: unknown): string {
  const err = e as { stderr?: string; message?: string };
  const raw = err.stderr?.trim() || err.message || String(e);
  return raw.length > 500 ? `${raw.slice(0, 500)}…` : raw;
}

/**
 * 提交工作区内全部改动（含新增与删除），拉取远端后推送到同名分支。
 *
 * 顺序是 commit → pull --rebase → push，而不是先拉后提交：
 * 工作区几乎总是脏的（AICoding 刚改完），先 commit 能让工作区变干净，
 * 拉取就不必依赖 --autostash，也就不存在暂存恢复冲突这一类难以收拾的中间态。
 *
 * - 无改动返回 null，由调用方给出「无需提交」的提示；此时也不拉取，
 *   避免一次「没什么可提交」的点击悄悄改动了用户的工作区
 * - commit 之后任一步失败都抛 GitAfterCommitError，且不回滚本地提交：
 *   reset 属于破坏性操作，把真实状态如实告诉用户更安全
 */
export async function commitAllAndPush(
  dir: string,
  message: string,
  timeoutMs = 120000,
): Promise<CommitResult | null> {
  // -uall：未跟踪目录展开成具体文件，否则整个新目录只算 1 个改动
  const status = await gitExec(dir, ['status', '--porcelain', '-uall'], 30000);
  if (!status) return null;
  const changed = parsePorcelain(status);
  const changedFiles = changed.size;
  // 明细必须在 add 之前取：add 之后 porcelain 全变成 A/M 暂存态，看不出原本是新增还是修改
  const detail = buildDetail(status);

  const branch = await gitExec(dir, ['rev-parse', '--abbrev-ref', 'HEAD'], 30000);
  await gitExec(dir, ['add', '-A'], timeoutMs);
  await gitExec(dir, ['commit', '-m', message], timeoutMs);
  const commitHash = await gitExec(dir, ['rev-parse', '--short', 'HEAD'], 30000);
  const fileDiffs = await buildFileDiffs(dir, commitHash, Array.from(changed));
  const result: CommitResult = { changedFiles, commitHash, branch, detail, fileDiffs };

  try {
    await gitExec(dir, ['pull', '--rebase', 'origin', branch], timeoutMs);
  } catch (e) {
    // 冲突会把仓库停在 rebase 中间态，不回滚的话之后任何 git 操作都会被挡下来
    await gitExec(dir, ['rebase', '--abort'], 30000).catch(() => undefined);
    throw new GitAfterCommitError('pull', result, gitErrMsg(e));
  }

  try {
    await gitExec(dir, ['push', 'origin', branch], timeoutMs);
  } catch (e) {
    throw new GitAfterCommitError('push', result, gitErrMsg(e));
  }
  return result;
}

/** 删除当前任务本地代码文件夹（已结束清理用） */
export async function removeWorkspaceDir(sessionId: string): Promise<void> {
  await fs.promises.rm(taskWorkspaceDir(sessionId), { recursive: true, force: true }).catch(() => undefined);
}

/**
 * 删除任务创建时推送到远端的分支（回收无主远程分支，避免越积越多）。
 * 必须在本地工作区仍存在的条件下调用——删除任务时会先于 removeWorkspaceDir 执行。
 * 走参数数组（非 shell），分支名若含特殊字符也安全。
 * 分支可能已被手动保留/改名或远端已不存在，失败只告警不阻断主流程。
 */
export async function deleteRemoteBranch(
  repoDir: string,
  branch: string,
  timeoutMs = 120000,
): Promise<boolean> {
  // 目录本身必须是 git 仓库（含 .git），否则 git 会向上找到 enclosing 仓库并向其 origin 推送，
  // 误删无关仓库的分支。非本任务克隆出的目录直接跳过，避免危险操作。
  if (!fs.existsSync(path.join(repoDir, '.git'))) return false;
  try {
    await gitExec(repoDir, ['push', 'origin', '--delete', branch], timeoutMs);
    return true;
  } catch (e) {
    console.warn(`[git] 删除远程分支『${branch}』失败（可能远端已不存在或无权删除）：${gitErrMsg(e)}`);
    return false;
  }
}

/**
 * codebuddy 的配置根目录，与 CLI 内部 PathUtils.getHomeDir() 等价：
 * 优先 CODEBUDDY_CONFIG_DIR，否则 ~/.codebuddy。
 * spawn 子进程时透传了整个 process.env，因此这里读到的与子进程实际使用的必然一致，
 * 换机器 / 换部署路径都不需要改代码。
 */
export function codebuddyHomeDir(): string {
  const custom = process.env.CODEBUDDY_CONFIG_DIR?.trim();
  return custom || path.join(os.homedir(), '.codebuddy');
}

/**
 * 与 CLI 内部 PathUtils.compressPath() 等价：把工作目录绝对路径压成一个目录名。
 * 会话记录实际落在 <home>/projects/<compressPath(工作目录)>/ 下。
 */
function compressPath(p: string): string {
  return p
    .replace(/[/\\:]/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .replace(/-+/g, '-');
}

/**
 * 回收 codebuddy 为该会话落盘的缓存（会话记录 + 运行日志），释放磁盘。
 *
 * 定位方式不写死目录结构：根目录取自 codebuddy 自身的配置，
 * 目录名按 CLI 的压缩规则现算。又因为工作区目录以 sessionId 命名，
 * 压缩后必然以 `-<sessionId>` 结尾，据此扫描即可命中——
 * 这条不变式让「工作区已被删除」「部署路径变了」两种情况同样能清干净。
 *
 * 纯清理动作，任何一步失败都只跳过，不影响主流程。
 */
export async function clearCodebuddySession(sessionId: string): Promise<void> {
  const rm = (p: string) => fs.promises.rm(p, { recursive: true, force: true }).catch(() => undefined);
  const projectsDir = path.join(codebuddyHomeDir(), 'projects');

  // 期望目录：必须走 realpath —— macOS 上 /tmp 实为 /private/tmp，
  // codebuddy 记录的是解析后的物理路径，不解析会算出对不上的目录名
  const workspace = taskWorkspaceDir(sessionId);
  const realPath = await fs.promises.realpath(workspace).catch(() => workspace);
  const targets = new Set([path.join(projectsDir, compressPath(realPath))]);

  // 扫描兜底：工作区已删除时 realpath 失效，路径迁移时压缩名也会变
  const entries = await fs.promises.readdir(projectsDir).catch(() => [] as string[]);
  for (const name of entries) {
    if (name === sessionId || name.endsWith(`-${sessionId}`)) {
      targets.add(path.join(projectsDir, name));
    }
  }
  for (const t of targets) await rm(t);

  // 运行日志：logs/<日期>/<sessionId>__<hash>.log，按前缀精确匹配
  const logsDir = path.join(codebuddyHomeDir(), 'logs');
  const days = await fs.promises.readdir(logsDir).catch(() => [] as string[]);
  for (const day of days) {
    const dayDir = path.join(logsDir, day);
    const files = await fs.promises.readdir(dayDir).catch(() => [] as string[]);
    for (const f of files) {
      if (f.startsWith(`${sessionId}__`)) await rm(path.join(dayDir, f));
    }
  }
}

