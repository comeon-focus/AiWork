import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';

const execAsync = promisify(exec);

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
    await execAsync(`git clone "${repoUrl}" "${target}"`, { cwd: AI_WORKSPACE_DIR, timeout: timeoutMs });
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
  await execAsync(`git checkout "${branch}"`, { cwd: repoDir, timeout: timeoutMs });
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
  await execAsync(`git checkout -b "${branch}"`, { cwd: repoDir, timeout: timeoutMs });
  await execAsync(`git push -u origin "${branch}"`, { cwd: repoDir, timeout: timeoutMs });
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

/** 删除当前任务本地代码文件夹（已结束清理用） */
export async function removeWorkspaceDir(sessionId: string): Promise<void> {
  await fs.promises.rm(taskWorkspaceDir(sessionId), { recursive: true, force: true }).catch(() => undefined);
}

/**
 * codebuddy 的配置根目录，与 CLI 内部 PathUtils.getHomeDir() 等价：
 * 优先 CODEBUDDY_CONFIG_DIR，否则 ~/.codebuddy。
 * spawn 子进程时透传了整个 process.env，因此这里读到的与子进程实际使用的必然一致，
 * 换机器 / 换部署路径都不需要改代码。
 */
function codebuddyHomeDir(): string {
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
