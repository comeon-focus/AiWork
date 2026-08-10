-- 在已存在的「智能编排」目录下新增二级菜单「任务队列」及其操作按钮
-- 幂等：重复执行不会产生重复菜单
SET @ai_catalog = (SELECT id FROM sys_menu WHERE type = 'CATALOG' AND path = '/ai-orchestration' LIMIT 1);

INSERT INTO sys_menu (parent_id, name, type, path, component, perms, icon, sort, visible, status, keep_alive, redirect)
SELECT @ai_catalog, '任务队列', 'MENU', '/ai-orchestration/task-queue', 'aiOrchestration/taskQueue/index',
       'orchestration:taskQueue:list', 'OrderedListOutlined', 4, 1, 1, 0, NULL
WHERE @ai_catalog IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM sys_menu WHERE perms = 'orchestration:taskQueue:list') t);

SET @queue_menu = (SELECT id FROM sys_menu WHERE perms = 'orchestration:taskQueue:list' LIMIT 1);

INSERT INTO sys_menu (parent_id, name, type, perms, sort, visible, status, keep_alive)
SELECT @queue_menu, '新增队列', 'BUTTON', 'orchestration:taskQueue:add', 1, 1, 1, 0
WHERE @queue_menu IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM sys_menu WHERE perms = 'orchestration:taskQueue:add') t);

INSERT INTO sys_menu (parent_id, name, type, perms, sort, visible, status, keep_alive)
SELECT @queue_menu, '编辑队列', 'BUTTON', 'orchestration:taskQueue:edit', 2, 1, 1, 0
WHERE @queue_menu IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM sys_menu WHERE perms = 'orchestration:taskQueue:edit') t);

INSERT INTO sys_menu (parent_id, name, type, perms, sort, visible, status, keep_alive)
SELECT @queue_menu, '删除队列', 'BUTTON', 'orchestration:taskQueue:remove', 3, 1, 1, 0
WHERE @queue_menu IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM sys_menu WHERE perms = 'orchestration:taskQueue:remove') t);

INSERT INTO sys_menu (parent_id, name, type, perms, sort, visible, status, keep_alive)
SELECT @queue_menu, '执行队列', 'BUTTON', 'orchestration:taskQueue:execute', 4, 1, 1, 0
WHERE @queue_menu IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM sys_menu WHERE perms = 'orchestration:taskQueue:execute') t);

-- 给超级管理员角色授权新菜单与按钮
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT (SELECT id FROM sys_role WHERE role_key = 'admin'), id
FROM sys_menu
WHERE perms IN (
  'orchestration:taskQueue:list',
  'orchestration:taskQueue:add',
  'orchestration:taskQueue:edit',
  'orchestration:taskQueue:remove',
  'orchestration:taskQueue:execute'
)
ON DUPLICATE KEY UPDATE menu_id = VALUES(menu_id);
