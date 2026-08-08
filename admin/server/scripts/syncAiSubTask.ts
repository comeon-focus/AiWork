import { sequelize } from '../src/db/index.js';
import { AiSubTask } from '../src/models/index.js';

async function main() {
  await AiSubTask.sync();
  console.log('sys_ai_sub_task synced');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => sequelize.close());
