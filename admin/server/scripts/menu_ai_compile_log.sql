-- 在已存在的「智能编排」目录下新增二级菜单「编译详情」及删除按钮
-- 幂等：重复执行不会产生重复菜单
SET @ai_catalog = (SELECT id FROM sys_menu WHERE type = 'CATALOG' AND path = '/ai-orchestration' LIMIT 1);

INSERT INTO sys_menu (parent_id, name, type, path, component, perms, icon, sort, visible, status, keep_alive, redirect)
SELECT @ai_catalog, '编译详情', 'MENU', '/ai-orchestration/compile-log', 'aiOrchestration/compileLog/index',
       'orchestration:compileLog:list', 'FileSearchOutlined', 2, 1, 1, 0, NULL
WHERE @ai_catalog IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM sys_menu WHERE perms = 'orchestration:compileLog:list') t);

SET @compile_menu = (SELECT id FROM sys_menu WHERE perms = 'orchestration:compileLog:list' LIMIT 1);

INSERT INTO sys_menu (parent_id, name, type, perms, sort, visible, status, keep_alive)
SELECT @compile_menu, '删除记录', 'BUTTON', 'orchestration:compileLog:remove', 1, 1, 1, 0
WHERE @compile_menu IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM sys_menu WHERE perms = 'orchestration:compileLog:remove') t);

-- 给超级管理员角色授权新菜单与按钮
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT (SELECT id FROM sys_role WHERE role_key = 'admin'), id
FROM sys_menu
WHERE perms IN ('orchestration:compileLog:list', 'orchestration:compileLog:remove')
ON DUPLICATE KEY UPDATE menu_id = VALUES(menu_id);
