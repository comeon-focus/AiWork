-- 需求空间（id=29）下：需求列表排最前，任务列表、智能文档顺延
UPDATE sys_menu SET sort = 2 WHERE id = 30;
UPDATE sys_menu SET sort = 3 WHERE id = 44;

-- 任务列表按钮改名：新增/编辑/删除需求 → 任务
UPDATE sys_menu SET name = '新增任务' WHERE id = 31;
UPDATE sys_menu SET name = '编辑任务' WHERE id = 32;
UPDATE sys_menu SET name = '删除任务' WHERE id = 33;

-- 新增「需求列表」菜单
INSERT INTO sys_menu (parent_id, name, type, path, component, perms, icon, sort, visible, status, keep_alive, redirect)
VALUES (29, '需求列表', 'MENU', '/orchestration/demand', 'orchestration/demand/index', 'orchestration:demand:list', 'ProfileOutlined', 1, 1, 1, 0, NULL);

SET @demand_menu = LAST_INSERT_ID();

INSERT INTO sys_menu (parent_id, name, type, perms, sort, visible, status, keep_alive)
VALUES
  (@demand_menu, '新增需求', 'BUTTON', 'orchestration:demand:add', 1, 1, 1, 0),
  (@demand_menu, '编辑需求', 'BUTTON', 'orchestration:demand:edit', 2, 1, 1, 0),
  (@demand_menu, '删除需求', 'BUTTON', 'orchestration:demand:remove', 3, 1, 1, 0);

-- 给超级管理员角色授权新菜单与按钮
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT (SELECT id FROM sys_role WHERE role_key = 'admin'), id
FROM sys_menu
WHERE id IN (@demand_menu,
             (SELECT id FROM sys_menu m WHERE m.parent_id = @demand_menu AND m.perms = 'orchestration:demand:add'),
             (SELECT id FROM sys_menu m WHERE m.parent_id = @demand_menu AND m.perms = 'orchestration:demand:edit'),
             (SELECT id FROM sys_menu m WHERE m.parent_id = @demand_menu AND m.perms = 'orchestration:demand:remove'))
ON DUPLICATE KEY UPDATE menu_id = VALUES(menu_id);
