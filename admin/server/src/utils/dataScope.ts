import { Op, literal, type WhereOptions } from 'sequelize';
import { DataScope, type AuthUser, type RoleScope } from '../types/index.js';

export interface DataScopeOptions {
  /** 目标模型上表示「归属部门」的属性名 */
  deptField?: string;
  /** 目标模型上表示「归属人」的属性名。用户表本身传 'id'，业务表一般传 'createBy' */
  userField?: string;
}

function fragmentOf(
  roleScope: RoleScope,
  user: AuthUser,
  deptField: string,
  userField: string,
): WhereOptions | null {
  const deptId = user.deptId;

  switch (roleScope.scope) {
    case DataScope.DEPT_AND_CHILD: {
      if (deptId == null) return { [userField]: user.id };
      // 借助 ancestors 冗余路径，一条子查询取出整棵子树，无需递归
      return {
        [deptField]: {
          [Op.in]: literal(
            `(SELECT id FROM sys_dept WHERE del_flag = 0 AND (id = ${Number(deptId)} OR FIND_IN_SET(${Number(deptId)}, ancestors)))`,
          ),
        },
      };
    }

    case DataScope.DEPT:
      return deptId == null ? { [userField]: user.id } : { [deptField]: deptId };

    case DataScope.CUSTOM: {
      const ids = roleScope.customDeptIds.filter(Number.isInteger);
      // 未配置任何部门的 CUSTOM 角色不贡献任何可见行
      return ids.length === 0 ? null : { [deptField]: { [Op.in]: ids } };
    }

    case DataScope.SELF:
      return { [userField]: user.id };

    default:
      return null;
  }
}

/**
 * 根据登录用户生效的数据范围，生成注入到查询里的 where 片段。
 *
 * 这是「数据权限」的唯一实现处：所有列表查询都把它 AND 进 where，
 * 业务代码无需各自判断，也就不存在漏判或多处规则不一致的问题。
 *
 * 多角色语义为**并集**：任一角色可见即可见，用 OR 连接各角色的条件，
 * 比「按宽窄排序取一档」更贴近直觉，也不会因排序假设而误放/误拦。
 */
export function buildDataScopeWhere(user: AuthUser, options: DataScopeOptions = {}): WhereOptions {
  const deptField = options.deptField ?? 'deptId';
  const userField = options.userField ?? 'id';

  // 超管不受任何数据范围限制
  if (user.isSuper) return {};
  // 只要有一个角色是「全部数据」，就无需再叠加其它条件
  if (user.dataScopes.some((s) => s.scope === DataScope.ALL)) return {};

  // 没有任何角色时收敛到「仅本人」，默认最小可见面
  if (user.dataScopes.length === 0) return { [userField]: user.id };

  const fragments = user.dataScopes
    .map((s) => fragmentOf(s, user, deptField, userField))
    .filter((f): f is WhereOptions => f !== null);

  if (fragments.length === 0) return { [userField]: user.id };
  if (fragments.length === 1) return fragments[0]!;
  return { [Op.or]: fragments };
}

/** 把业务条件与数据权限条件安全地合并（两者可能命中同一字段，故用 Op.and） */
export function withDataScope(business: WhereOptions, scope: WhereOptions): WhereOptions {
  if (Object.getOwnPropertyNames(scope).length === 0 && Object.getOwnPropertySymbols(scope).length === 0) {
    return business;
  }
  return { [Op.and]: [business, scope] };
}
