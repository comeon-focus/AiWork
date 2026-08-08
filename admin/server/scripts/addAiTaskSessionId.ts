import { randomBytes } from 'crypto';
import { sequelize } from '../src/db/index.js';

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function genId(len = 16): string {
  const bytes = randomBytes(len);
  let id = '';
  for (let i = 0; i < len; i++) id += CHARSET[bytes[i] % CHARSET.length];
  return id;
}

async function main() {
  // 1. 新增可空列
  await sequelize.query(
    'ALTER TABLE sys_ai_task ADD COLUMN session_id VARCHAR(16) NULL COMMENT \'会话 ID（创建时自动生成）\'',
  );
  console.log('added session_id column (nullable)');

  // 2. 为已有行回填唯一 sessionId
  const [rows] = await sequelize.query('SELECT id FROM sys_ai_task WHERE session_id IS NULL');
  const taken = new Set<string>();
  for (const r of rows as { id: number }[]) {
    let sid = genId();
    while (taken.has(sid)) sid = genId();
    taken.add(sid);
    await sequelize.query('UPDATE sys_ai_task SET session_id = ? WHERE id = ?', {
      replacements: [sid, r.id],
    });
  }
  console.log('backfilled %d rows', (rows as unknown[]).length);

  // 3. 设为 NOT NULL + UNIQUE
  await sequelize.query('ALTER TABLE sys_ai_task MODIFY COLUMN session_id VARCHAR(16) NOT NULL');
  await sequelize.query('ALTER TABLE sys_ai_task ADD UNIQUE KEY uk_session_id (session_id)');
  console.log('set NOT NULL + UNIQUE');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => sequelize.close());
