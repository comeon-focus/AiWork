/**
 * 一次性建表脚本：为「AI 任务」功能创建 sys_ai_task（不加 force，不影响既有表）
 *   npx tsx src/scripts/syncAiTask.ts
 */
import { sequelize } from '../db/index.js';
import { AITask } from '../models/index.js';

async function main() {
  await AITask.sync();
  console.log('[sync] sys_ai_task 已就绪');
}

main()
  .then(() => sequelize.close())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('[sync] 失败:', err);
    await sequelize.close().catch(() => undefined);
    process.exit(1);
  });
