/**
 * 一次性建表脚本：为「GIT提交记录」功能创建 sys_ai_git_commit（不加 force，不影响既有表）
 *   npx tsx src/scripts/syncAiGitCommit.ts
 * 注意：不带 alter 的 sync() 对已存在的表是空操作，改结构需先 DROP 再跑。
 */
import { sequelize } from '../db/index.js';
import { AiGitCommit } from '../models/index.js';

async function main() {
  await AiGitCommit.sync();
  console.log('[sync] sys_ai_git_commit 已就绪');
}

main()
  .then(() => sequelize.close())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('[sync] 失败:', err);
    await sequelize.close().catch(() => undefined);
    process.exit(1);
  });
