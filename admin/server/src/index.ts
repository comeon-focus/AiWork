import { createApp } from './app.js';
import { config } from './config/index.js';
import { sequelize } from './db/index.js';

async function bootstrap() {
  try {
    await sequelize.authenticate();
    console.log(`[db] 已连接 ${config.db.host}:${config.db.port}/${config.db.name}`);
  } catch (err) {
    console.error('[db] 连接失败，请检查 .env 配置或先执行 npm run db:init');
    console.error(err);
    process.exit(1);
  }

  createApp().listen(config.port, () => {
    console.log(`[server] http://localhost:${config.port}/api  (${config.env})`);
  });
}

void bootstrap();
