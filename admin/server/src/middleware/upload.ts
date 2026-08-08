import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 上传根目录：server/uploads/requirements，启动时确保存在 */
export const REQUIREMENT_UPLOAD_DIR = path.resolve(__dirname, '../../uploads/requirements');
fs.mkdirSync(REQUIREMENT_UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, REQUIREMENT_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const safe = path.basename(file.originalname, ext).replace(/[^\w一-龥-]/g, '_').slice(0, 40);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const ALLOWED = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed',
]);

export const uploadRequirement = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      return cb(ApiError.badRequest(`不支持的文件类型: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

export function fileTypeOf(mimetype: string): 'image' | 'doc' {
  return mimetype.startsWith('image/') ? 'image' : 'doc';
}
