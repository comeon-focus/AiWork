import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
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
 * 切换到指定分支。分支不存在（远端也无同名分支）时向上抛出，由调用方清理已拉取的目录。
 * 切换为本地已存在的默认分支时为空操作；分支在远端存在时会自动创建本地跟踪分支。
 */
export async function checkoutBranch(repoDir: string, branch: string, timeoutMs = 120000): Promise<void> {
  await execAsync(`git checkout "${branch}"`, { cwd: repoDir, timeout: timeoutMs });
}
