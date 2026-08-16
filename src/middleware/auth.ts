import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User, Workshop, Staff } from '../models';
import env from '../config/env';
import { ROLES } from '../config/constants';
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

// Ustaxona scope'ini foydalanuvchiga biriktiradi: owner o'z ustaxonasi,
// staff o'zi ishlaydigan ustaxonasiga bog'lanadi. Mijozga tegishli emas.
export const attachWorkshop = asyncHandler(async (req, res, next) => {
  if (!req.user) return next();
  if (req.user.role === ROLES.OWNER) {
    const workshop = await Workshop.findOne({ owner: req.user._id });
    req.user._workshop_id = workshop ? String(workshop._id) : null;
  } else if (req.user.role === ROLES.STAFF) {
    const staff = await Staff.findOne({ user: req.user._id });
    req.user._workshop_id = staff ? String(staff.workshop) : null;
  }
  next();
});

// Telegram bot uchun: foydalanuvchi telegram_chat_id orqali aniqlanadi.
// BOT_TOKEN env'da o'rnatilgan bo'lsa tekshiriladi (xavfsizlik uchun tavsiya etiladi).
export const botAuth = asyncHandler(async (req, res, next) => {
  const headerToken = (req.headers['x-bot-token'] as string) || '';
  if (env.BOT_TOKEN && headerToken !== env.BOT_TOKEN) {
    throw new ApiError(403, "Noto'g'ri bot token");
  }

  const chatId = String(req.body?.telegram_chat_id || req.query?.telegram_chat_id || '');
  if (!chatId) {
    throw new ApiError(400, 'telegram_chat_id talab qilinadi');
  }
  const user = await User.findOne({ telegram_chat_id: chatId });
  if (!user) {
    throw new ApiError(404, "Telegram hisob bog'lanmagan. Avval /start orqali raqamingizni ulashing.");
  }
  req.user = user;
  next();
});

export { extractToken };
