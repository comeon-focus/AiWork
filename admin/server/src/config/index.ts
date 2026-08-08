import 'dotenv/config';

function required(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`缺少必需的环境变量: ${key}，请参考 .env.example 创建 .env`);
  }
  return value;
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  db: {
    host: required('DB_HOST', '127.0.0.1'),
    port: Number(required('DB_PORT', '3306')),
    user: required('DB_USER', 'root'),
    password: process.env.DB_PASSWORD ?? '',
    name: required('DB_NAME', 'admin_rbac'),
  },
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    accessExpires: process.env.JWT_ACCESS_EXPIRES ?? '2h',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES ?? '7d',
  },
  ai: {
    /** 本机 CodeBuddy CLI 可执行文件路径 */
    codebuddyBin: process.env.CODEBUDDY_BIN ?? '/usr/local/bin/codebuddy',
    /** 可选：指定模型，留空则使用 CLI 默认 */
    model: process.env.CODEBUDDY_MODEL ?? '',
    /** 单次润色超时（毫秒） */
    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 180000),
  },
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

export const isProd = config.env === 'production';
