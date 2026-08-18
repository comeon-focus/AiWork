/** 业务错误码，前端据此做特殊处理（尤其 40100/40300） */
export const ErrorCode = {
  BAD_REQUEST: 40000,
  UNAUTHORIZED: 40100,
  /** access token 过期，前端据此触发刷新 */
  TOKEN_EXPIRED: 40101,
  FORBIDDEN: 40300,
  NOT_FOUND: 40400,
  CONFLICT: 40900,
  /** 操作需要用户二次确认（如删除含未提交代码的任务），前端据此弹确认框而非错误提示 */
  NEED_CONFIRM: 40901,
  INTERNAL: 50000,
} as const;

export class ApiError extends Error {
  readonly code: number;
  readonly httpStatus: number;

  constructor(code: number, message: string, httpStatus?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.httpStatus = httpStatus ?? Math.floor(code / 100);
  }

  static badRequest(msg = '请求参数有误') {
    return new ApiError(ErrorCode.BAD_REQUEST, msg, 400);
  }
  static unauthorized(msg = '未登录或登录已失效') {
    return new ApiError(ErrorCode.UNAUTHORIZED, msg, 401);
  }
  static tokenExpired(msg = '登录状态已过期') {
    return new ApiError(ErrorCode.TOKEN_EXPIRED, msg, 401);
  }
  static forbidden(msg = '没有权限执行该操作') {
    return new ApiError(ErrorCode.FORBIDDEN, msg, 403);
  }
  static notFound(msg = '资源不存在') {
    return new ApiError(ErrorCode.NOT_FOUND, msg, 404);
  }
  static conflict(msg = '数据冲突') {
    return new ApiError(ErrorCode.CONFLICT, msg, 409);
  }
  static needConfirm(msg = '该操作需要二次确认') {
    return new ApiError(ErrorCode.NEED_CONFIRM, msg, 409);
  }
}
