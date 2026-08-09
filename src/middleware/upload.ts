import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import env from '../config/env';
import { ApiError } from '../utils/http';

const uploadDir = path.resolve(process.cwd(), env.MEDIA_DIR);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const IMAGE_SIGNATURES = [
  { magic: [0xff, 0xd8, 0xff], ext: 'jpg' },
  { magic: [0x89, 0x50, 0x4e, 0x47], ext: 'png' },
  { magic: [0x47, 0x49, 0x46, 0x38], ext: 'gif' },
  { magic: [0x52, 0x49, 0x46, 0x46], ext: 'webp' },
  { magic: [0x42, 0x4d], ext: 'bmp' },
];

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp']);

const imageFilter: multer.Options['fileFilter'] = (req, file, cb) => {
  if (ALLOWED_MIME.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ApiError(400, 'Faqat JPEG, PNG, GIF yoki WebP rasm fayllarini yuklash mumkin'));
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    const safeExt = allowedExt.includes(ext) ? ext : '.jpg';
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`;
    cb(null, unique);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: imageFilter,
});

function validateImageSignature(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 12) return false;
  for (const sig of IMAGE_SIGNATURES) {
    const matches = sig.magic.every((byte, i) => buffer[i] === byte);
    if (matches) return true;
  }
  return false;
}

function checkUploadedImage(file: Express.Multer.File): Express.Multer.File | null {
  if (!file) return null;
  let buf: Buffer | null = null;
  try {
    buf = fs.readFileSync(path.join(uploadDir, file.filename));
  } catch (err) {
    return null;
  }
  if (!validateImageSignature(buf)) {
    try {
      fs.unlinkSync(path.join(uploadDir, file.filename));
    } catch (err) {
      /* ignore */
    }
    throw new ApiError(400, 'Yuklangan fayl haqiqiy rasm emas. Boshqa fayl tanlang.');
  }
  return file;
}

export const toMediaUrl = (file?: Express.Multer.File | null): string | null => {
  if (!file) return null;
  return `${env.PUBLIC_MEDIA_URL}/${file.filename}`;
};

export function verifyUpload(req: Request, res: Response, next: NextFunction): void {
  try {
    if (req.file) req.file = checkUploadedImage(req.file) || undefined;
    next();
  } catch (err) {
    next(err);
  }
}

export { checkUploadedImage, uploadDir };
