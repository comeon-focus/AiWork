-- AI 任务 Coding 状态枚举扩展迁移
-- 将 暂无状态 → 暂无，新增 编译成功 / 编译失败，并增加 coding_error 失败原因列
-- 注意：模型使用 underscored，列名为 snake_case（coding_status / coding_error）
-- 执行前请先备份数据库；在 MySQL 客户端中 source 本文件即可。

-- 1. 先扩展 ENUM（保留旧值 '暂无状态' 避免截断），并新增 coding_error 列
ALTER TABLE sys_ai_task
  MODIFY COLUMN coding_status ENUM('暂无状态','编译中','暂无','编译成功','编译失败') NOT NULL DEFAULT '暂无',
  ADD COLUMN coding_error VARCHAR(512) NULL COMMENT 'AICoding 编译失败原因';
ALTER TABLE sys_ai_sub_task
  MODIFY COLUMN coding_status ENUM('暂无状态','编译中','暂无','编译成功','编译失败') NOT NULL DEFAULT '暂无',
  ADD COLUMN coding_error VARCHAR(512) NULL COMMENT 'AICoding 编译失败原因';

-- 2. 旧值迁移到新值
UPDATE sys_ai_task SET coding_status = '暂无' WHERE coding_status = '暂无状态';
UPDATE sys_ai_sub_task SET coding_status = '暂无' WHERE coding_status = '暂无状态';

-- 3. 收缩 ENUM 到最终取值
ALTER TABLE sys_ai_task
  MODIFY COLUMN coding_status ENUM('暂无','编译中','编译成功','编译失败') NOT NULL DEFAULT '暂无';
ALTER TABLE sys_ai_sub_task
  MODIFY COLUMN coding_status ENUM('暂无','编译中','编译成功','编译失败') NOT NULL DEFAULT '暂无';
