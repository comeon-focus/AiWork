-- 在已存在的「AI任务」菜单下新增「提交代码」按钮
-- 幂等：重复执行不会产生重复菜单
SET @ai_task_menu = (SELECT id FROM sys_menu WHERE perms = 'orchestration:aiTask:list' LIMIT 1);

INSERT INTO sys_menu (parent_id, name, type, perms, sort, visible, status, keep_alive)
SELECT @ai_task_menu, '提交代码', 'BUTTON', 'orchestration:aiTask:commit', 4, 1, 1, 0
WHERE @ai_task_menu IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM sys_menu WHERE perms = 'orchestration:aiTask:commit') t);

-- 给超级管理员角色授权新按钮
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT (SELECT id FROM sys_role WHERE role_key = 'admin'), id
FROM sys_menu
WHERE perms = 'orchestration:aiTask:commit'
ON DUPLICATE KEY UPDATE menu_id = VALUES(menu_id);
