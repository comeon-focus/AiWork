import fs from 'fs';
import path from 'path';
import { sequelize } from '../src/db/index.js';
import * as taskSvc from '../src/modules/aiTask/aiTask.service.js';
import { AI_WORKSPACE_DIR } from '../src/utils/git.js';

async function main() {
  console.log('workspace dir =', AI_WORKSPACE_DIR);
  let created;
  try {
    created = await taskSvc.createAiTask({
      title: '验证-克隆代码库',
      summary: '临时',
      smartDocId: 7,
      creatorId: 1,
      creatorName: 'x',
    });
    console.log('created id=%d sessionId=%s', created.id, created.sessionId);
    const dir = path.join(AI_WORKSPACE_DIR, created.sessionId);
    console.log('workspace exists=%s', fs.existsSync(dir));
    if (fs.existsSync(dir)) console.log('workspace contents=', fs.readdirSync(dir).slice(0, 10));
  } catch (e) {
    console.log('CREATE FAILED (expected if clone fails):', (e as Error).message);
    return;
  } finally {
    if (created) {
      await taskSvc.removeAiTask(created.id);
      const dir = path.join(AI_WORKSPACE_DIR, created.sessionId);
      if (fs.existsSync(dir)) await fs.promises.rm(dir, { recursive: true, force: true });
      console.log('cleaned up task=%d', created.id);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => sequelize.close());
