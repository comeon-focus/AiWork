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

/** 删除当前任务本地代码文件夹（已结束清理用） */
export async function removeWorkspaceDir(sessionId: string): Promise<void> {
  await fs.promises.rm(taskWorkspaceDir(sessionId), { recursive: true, force: true }).catch(() => undefined);
}

/**
 * 尽力释放 codebuddy 会话缓存以回收内存：删除其 sessions 目录下对应 sessionId 的文件/目录。
 * 路径随版本可能变化，失败仅告警，不影响主流程。
 */
export async function clearCodebuddySession(sessionId: string): Promise<void> {
  const sessionsDir = path.join(os.homedir(), '.codebuddy', 'sessions');
  const candidates = [
    path.join(sessionsDir, `${sessionId}.json`),
    path.join(sessionsDir, `${sessionId}.jsonl`),
    path.join(sessionsDir, sessionId),
  ];
  for (const c of candidates) {
    await fs.promises.rm(c, { recursive: true, force: true }).catch(() => undefined);
  }
}
