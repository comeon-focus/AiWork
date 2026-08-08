/**
 * 一次性建表脚本：为「需求列表」功能创建三张表（不加 force，不影响既有表）
 *   npx tsx src/scripts/syncDemand.ts
 */
import { sequelize } from '../db/index.js';
import { Demand, DemandFile, RequirementDemand } from '../models/index.js';

async function main() {
  await Demand.sync();
  console.log('[sync] sys_demand 已就绪');
  await DemandFile.sync();
  console.log('[sync] sys_demand_file 已就绪');
  await RequirementDemand.sync();
  console.log('[sync] sys_requirement_demand 已就绪');
}

main()
  .then(() => sequelize.close())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('[sync] 失败:', err);
    await sequelize.close().catch(() => undefined);
    process.exit(1);
  });
