import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../config/index.js';

export interface AccessPayload {
  sub: number;
  username: string;
  type: 'access';
}

export interface RefreshPayload {
  sub: number;
  /** 随机串，配合白名单表定位具体这一枚 token */
  jti: string;
  type: 'refresh';
}

export function signAccessToken(userId: number, username: string): string {
  const payload: AccessPayload = { sub: userId, username, type: 'access' };
  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpires,
  } as SignOptions);
}

export function signRefreshToken(userId: number): { token: string; expiresAt: Date } {
  const payload: RefreshPayload = { sub: userId, jti: crypto.randomUUID(), type: 'refresh' };
  const token = jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpires,
  } as SignOptions);
  const decoded = jwt.decode(token) as { exp: number };
  return { token, expiresAt: new Date(decoded.exp * 1000) };
}

export function verifyAccessToken(token: string): AccessPayload {
  const payload = jwt.verify(token, config.jwt.accessSecret) as unknown as AccessPayload;
  if (payload.type !== 'access') throw new jwt.JsonWebTokenError('token 类型不正确');
  return payload;
}

export function verifyRefreshToken(token: string): RefreshPayload {
  const payload = jwt.verify(token, config.jwt.refreshSecret) as unknown as RefreshPayload;
  if (payload.type !== 'refresh') throw new jwt.JsonWebTokenError('token 类型不正确');
  return payload;
}

/** 白名单表只存摘要，避免明文 token 落库 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
