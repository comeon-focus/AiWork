import { Sequelize } from 'sequelize';
import { config, isProd } from '../config/index.js';

export const sequelize = new Sequelize(config.db.name, config.db.user, config.db.password, {
  host: config.db.host,
  port: config.db.port,
  dialect: 'mysql',
  timezone: '+08:00',
  logging: isProd ? false : (sql) => console.log(`[sql] ${sql}`),
  define: {
    underscored: true,
    charset: 'utf8mb4',
    collate: 'utf8mb4_general_ci',
  },
  pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
  dialectOptions: {
    dateStrings: true,
    typeCast: true,
  },
});
