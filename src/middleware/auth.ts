import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models';
import env from '../config/env';
import { ApiError, asyncHandler } from '../utils/http';

const JWT_OPTIONS: jwt.VerifyOptions = { algorithms: ['HS256'] };

function extractToken(req: Request): string | null {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  if (req.cookies && req.cookies.access_token) return req.cookies.access_token as string;
  return null;
}

export const authRequired = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    throw new ApiError(401, 'Avtorizatsiya talab qilinadi');
  }
  let payload: any;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, JWT_OPTIONS);
  } catch (err) {
    throw new ApiError(401, 'Token yaroqsiz yoki muddati tugagan');
  }
  if (!payload.user_id) {
    throw new ApiError(401, 'Token yaroqsiz');
  }
  const user = await User.findById(payload.user_id).select('-password');
  if (!user) {
    throw new ApiError(401, 'Foydalanuvchi topilmadi');
  }
  if (payload.token_version !== undefined && user.token_version !== payload.token_version) {
    throw new ApiError(401, 'Sessiya yaroqsiz. Qayta kiring.');
  }
  req.user = user;
  next();
});

export const isAdmin = (user: any): boolean => Boolean(user && (user.is_staff || user.role === 'admin'));

export const requireRole = (...roles: string[]) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Avtorizatsiya talab qilinadi' });
  }
  if (isAdmin(req.user) || roles.includes(req.user.role)) {
    return next();
  }
  return res.status(403).json({ error: "Bu amal uchun huquqingiz yo'q" });
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Avtorizatsiya talab qilinadi' });
  }
  if (!isAdmin(req.user)) {
    return res.status(403).json({ error: 'Faqat admin uchun' });
  }
  next();
};

export { extractToken };
