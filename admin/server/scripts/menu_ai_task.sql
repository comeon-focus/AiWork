-- 新增一级目录「智能编排」与二级菜单「AI任务」及按钮
INSERT INTO sys_menu (parent_id, name, type, path, component, perms, icon, sort, visible, status, keep_alive, redirect)
VALUES (0, '智能编排', 'CATALOG', '/ai-orchestration', NULL, NULL, 'NodeIndexOutlined', 6, 1, 1, 0, NULL);

SET @ai_catalog = LAST_INSERT_ID();

INSERT INTO sys_menu (parent_id, name, type, path, component, perms, icon, sort, visible, status, keep_alive, redirect)
VALUES (@ai_catalog, 'AI任务', 'MENU', '/ai-orchestration/ai-task', 'aiOrchestration/aiTask/index', 'orchestration:aiTask:list', 'ThunderboltOutlined', 1, 1, 1, 0, NULL);

SET @ai_task_menu = LAST_INSERT_ID();

INSERT INTO sys_menu (parent_id, name, type, perms, sort, visible, status, keep_alive)
VALUES
  (@ai_task_menu, '新增任务', 'BUTTON', 'orchestration:aiTask:add', 1, 1, 1, 0),
  (@ai_task_menu, '编辑任务', 'BUTTON', 'orchestration:aiTask:edit', 2, 1, 1, 0),
  (@ai_task_menu, '删除任务', 'BUTTON', 'orchestration:aiTask:remove', 3, 1, 1, 0);

-- 给超级管理员角色授权新菜单与按钮
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT (SELECT id FROM sys_role WHERE role_key = 'admin'), id
FROM sys_menu
WHERE id IN (@ai_catalog,
             @ai_task_menu,
             (SELECT id FROM sys_menu m WHERE m.parent_id = @ai_task_menu AND m.perms = 'orchestration:aiTask:add'),
             (SELECT id FROM sys_menu m WHERE m.parent_id = @ai_task_menu AND m.perms = 'orchestration:aiTask:edit'),
             (SELECT id FROM sys_menu m WHERE m.parent_id = @ai_task_menu AND m.perms = 'orchestration:aiTask:remove'))
ON DUPLICATE KEY UPDATE menu_id = VALUES(menu_id);
