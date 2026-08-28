import { Config } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';

/** 内存配置缓存：启动时加载，修改时刷新 */
const CONFIG_CACHE = new Map<string, string>();

/** AI 任务父级并发限制的配置键 */
export const AI_CONCURRENT_PARENT_LIMIT_KEY = 'ai.concurrent.parent.limit';

/** 启动时加载全部配置到内存 */
export async function loadConfigCache(): Promise<void> {
  const rows = await Config.findAll({ raw: true });
  CONFIG_CACHE.clear();
  for (const row of rows as { configKey: string; configValue: string }[]) {
    CONFIG_CACHE.set(row.configKey, row.configValue);
  }
  console.log(`[config] 已加载 ${CONFIG_CACHE.size} 条系统配置`);
}

/** 读取字符串配置 */
export function getConfigString(key: string): string | undefined {
  return CONFIG_CACHE.get(key);
}

/**
 * 读取数字配置
 * - 值为空字符串时视为未设置，返回 undefined
 * - 无法解析为数字时返回 undefined
 */
export function getConfigNumber(key: string): number | undefined {
  const raw = CONFIG_CACHE.get(key);
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** 列出全部配置 */
export async function listConfigs() {
  return Config.findAll({ order: [['configKey', 'ASC']] });
}

/** 按 key 查询配置 */
export async function getConfigByKey(key: string) {
  const cfg = await Config.findOne({ where: { configKey: key } });
  if (!cfg) throw ApiError.notFound('配置不存在');
  return cfg;
}

/** 新增配置 */
export async function createConfig(key: string, value: string, remark?: string | null) {
  const exists = await Config.findOne({ where: { configKey: key } });
  if (exists) throw ApiError.badRequest('配置键已存在');
  const cfg = await Config.create({
    configKey: key,
    configValue: value,
    remark: remark?.trim() || null,
  });
  CONFIG_CACHE.set(key, cfg.configValue);
  return cfg;
}

/** 更新配置值与说明，并同步刷新内存缓存 */
export async function updateConfig(key: string, value: string, remark?: string | null) {
  const cfg = await Config.findOne({ where: { configKey: key } });
  if (!cfg) throw ApiError.notFound('配置不存在');
  await cfg.update({
    configValue: value,
    ...(remark !== undefined ? { remark: remark?.trim() || null } : {}),
  });
  CONFIG_CACHE.set(key, cfg.configValue);
  return cfg;
}

/** 删除配置并同步刷新内存缓存 */
export async function removeConfig(key: string) {
  const cfg = await Config.findOne({ where: { configKey: key } });
  if (!cfg) throw ApiError.notFound('配置不存在');
  await cfg.destroy();
  CONFIG_CACHE.delete(key);
}

/** AI 任务父级并发限制：为空或未配置表示不限制；非法值兜底 2 */
export function getAiConcurrentParentLimit(): number {
  const raw = CONFIG_CACHE.get(AI_CONCURRENT_PARENT_LIMIT_KEY);
  if (raw === undefined || raw === '') return Infinity;
  const n = Number(raw);
  if (Number.isInteger(n) && n > 0) return n;
  console.warn(`[config] ${AI_CONCURRENT_PARENT_LIMIT_KEY} 值非法（${raw}），使用默认值 2`);
  return 2;
}

/** 内部暴露缓存，供测试或调试接口使用（不建议业务直接使用） */
export function getConfigCache(): ReadonlyMap<string, string> {
  return CONFIG_CACHE;
}
