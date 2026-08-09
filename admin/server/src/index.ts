import { createApp } from './app.js';
import { config } from './config/index.js';
import { sequelize } from './db/index.js';
import { recoverStaleCompileLogs } from './modules/aiCompileLog/aiCompileLog.service.js';
import { killAllRuns } from './utils/codebuddy.js';

async function bootstrap() {
  try {
    await sequelize.authenticate();
    console.log(`[db] 已连接 ${config.db.host}:${config.db.port}/${config.db.name}`);
  } catch (err) {
    console.error('[db] 连接失败，请检查 .env 配置或先执行 npm run db:init');
    console.error(err);
    process.exit(1);
  }

  // 上次进程被杀（tsx watch 热重启也算）留下的「编译中」永远等不到回调，必须回收，
  // 否则 isTaskLocked 会把这些任务永久锁死：不能编辑、结束、删除、重跑
  await recoverStaleCompileLogs().catch((e: Error) =>
    console.error('[compileLog] 回收残留编译记录失败:', e.message),
  );

  createApp().listen(config.port, () => {
    console.log(`[server] http://localhost:${config.port}/api  (${config.env})`);
  });
}

// 退出时收割 codebuddy 子进程，避免变成孤儿继续改代码
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sig, () => {
    killAllRuns();
    process.exit(0);
  });
}

void bootstrap();
