import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, Workshop } from '../models';
import env from '../config/env';
import { ROLES } from '../config/constants';
import { ApiError, asyncHandler } from '../utils/http';
import { userSerializer } from '../utils/serializers';
import { toMediaUrl } from '../middleware/upload';

const PHONE_REGEX = /^\+998\d{9}$/;
const JWT_OPTIONS: jwt.VerifyOptions = { algorithms: ['HS256'] };

const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';

function expiresToSeconds(expires: string): number {
  const m = String(expires).match(/^(\d+)([smhdw])$/);
  if (!m) return 60 * 60 * 24;
  const n = parseInt(m[1], 10);
  const units: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  return n * (units[m[2]] || 1);
}

function cookieBase(seconds: number): Record<string, any> {
  const opts: Record<string, any> = {
    httpOnly: true,
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: seconds * 1000,
  };
  if (env.COOKIE_DOMAIN) opts.domain = env.COOKIE_DOMAIN;
  return opts;
}

function setAuthCookies(res: Response, access: string, refresh: string): void {
  res.cookie(ACCESS_COOKIE, access, cookieBase(expiresToSeconds(env.JWT_ACCESS_EXPIRES)));
  res.cookie(REFRESH_COOKIE, refresh, cookieBase(expiresToSeconds(env.JWT_REFRESH_EXPIRES)));
}

function clearAuthCookies(res: Response): void {
  const clear = (name: string) => {
    const opts: Record<string, any> = {
      httpOnly: true,
      sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/',
    };
    if (env.COOKIE_DOMAIN) opts.domain = env.COOKIE_DOMAIN;
    res.clearCookie(name, opts);
  };
  clear(ACCESS_COOKIE);
  clear(REFRESH_COOKIE);
}

const signAccess = (user: any): string =>
  jwt.sign(
    { user_id: String(user._id), role: user.role, token_version: user.token_version || 0 },
    env.JWT_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES as jwt.SignOptions['expiresIn'] }
  );

const signRefresh = (user: any): string =>
  jwt.sign(
    { user_id: String(user._id), role: user.role, type: 'refresh', token_version: user.token_version || 0 },
    env.JWT_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES as jwt.SignOptions['expiresIn'] }
  );

const validatePhone = (phone: string): void => {
  if (!PHONE_REGEX.test(phone)) {
    throw new ApiError(400, 'Telefon raqam formati: +998 XX XXX XX XX (masalan +998901234567)');
  }
};

// Ro'yxatdan o'tishda faqat mijoz yoki ustaxona egasi o'zi ro'yxatdan o'tadi.
// Xodim (staff) hisobini faqat ustaxona egasi qo'shadi.
export const register = asyncHandler(async (req: Request, res: Response) => {
  const { phone, password, username = '', first_name = '', last_name = '', role = 'client' } = req.body;

  validatePhone(phone);

  if (![ROLES.CLIENT, ROLES.OWNER].includes(role)) {
    throw new ApiError(400, "Ro'yxatdan o'tishda faqat 'client' yoki 'owner' roli tanlanishi mumkin. Xodimlarni egasi qo'shadi.");
  }
  if (!password || String(password).length < 6) {
    throw new ApiError(400, "Parol kamida 6 belgidan iborat bo'lishi kerak.");
  }

  const existing = await User.findOne({ phone });
  if (existing) {
    throw new ApiError(400, "Bu telefon raqam allaqachon ro'yxatdan o'tgan.");
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = await User.create({
    phone,
    username: username || phone,
    first_name,
    last_name,
    role,
    password: hashed,
  });

  if (role === ROLES.OWNER) {
    const hasWorkshop = await Workshop.findOne({ owner: user._id });
    if (!hasWorkshop) {
      await Workshop.create({
        name: [first_name, last_name].filter(Boolean).join(' ') || 'Ustaxona',
        owner: user._id,
      });
    }
  }

  res.status(201).json(userSerializer(user));
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { phone, password } = req.body;
  const user = await User.findOne({ phone });
  if (!user) {
    return res.status(401).json({ error: "Telefon raqam yoki parol noto'g'ri" });
  }
  const ok = await bcrypt.compare(password || '', user.password);
  if (!ok) {
    return res.status(401).json({ error: "Telefon raqam yoki parol noto'g'ri" });
  }
  const access = signAccess(user);
  const refresh = signRefresh(user);
  setAuthCookies(res, access, refresh);
  res.json({ access, refresh });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = (req.cookies && req.cookies[REFRESH_COOKIE]) || req.body.refresh;
  if (!token) {
    throw new ApiError(401, 'Refresh token berilmagan');
  }
  let payload: any;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, JWT_OPTIONS);
  } catch (err) {
    return res.status(401).json({ error: 'Refresh token yaroqsiz yoki muddati tugagan' });
  }
  if (!payload.user_id || payload.type !== 'refresh') {
    return res.status(401).json({ error: 'Refresh token yaroqsiz' });
  }
  const user = await User.findById(payload.user_id).select('-password');
  if (!user) {
    return res.status(401).json({ error: 'Foydalanuvchi topilmadi' });
  }
  if (user.token_version !== payload.token_version) {
    return res.status(401).json({ error: 'Sessiya yaroqsiz. Qayta kiring.' });
  }
  const access = signAccess(user);
  const newRefresh = signRefresh(user);
  setAuthCookies(res, access, newRefresh);
  res.json({ access });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  clearAuthCookies(res);
  res.status(204).end();
});

export const profile = asyncHandler(async (req: Request, res: Response) => {
  res.json(userSerializer(req.user));
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const allowed = ['username', 'first_name', 'last_name', 'language', 'theme'];
  for (const field of allowed) {
    if (field in req.body) {
      req.user[field] = req.body[field];
    }
  }
  if (req.file) {
    req.user.avatar = toMediaUrl(req.file);
  }
  if ('phone' in req.body && req.body.phone !== req.user.phone) {
    validatePhone(req.body.phone);
    const existing = await User.findOne({ phone: req.body.phone, _id: { $ne: req.user._id } });
    if (existing) {
      throw new ApiError(400, 'Bu telefon raqam allaqachon band.');
    }
    req.user.phone = req.body.phone;
  }
  await req.user.save();
  res.json(userSerializer(req.user));
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const { old_password, new_password } = req.body;
  if (!old_password || !new_password) {
    throw new ApiError(400, 'Eski va yangi parol kiritilishi kerak.');
  }
  if (String(new_password).length < 6) {
    throw new ApiError(400, "Yangi parol kamida 6 belgidan iborat bo'lishi kerak.");
  }
  const user = await User.findById(req.user._id);
  if (!user) {
    throw new ApiError(404, 'Foydalanuvchi topilmadi');
  }
  const ok = await bcrypt.compare(old_password, user.password);
  if (!ok) {
    throw new ApiError(400, "Eski parol noto'g'ri");
  }
  user.password = await bcrypt.hash(new_password, 10);
  user.token_version = (user.token_version || 0) + 1;
  await user.save();
  clearAuthCookies(res);
  res.json({ message: "Parol muvaffaqiyatli o'zgartirildi. Qayta kiring." });
});

// Telegram bot orqali chatId ni telefon raqami bilan bog'lash (bot uchun ochiq endpoint).
const normalizePhone = (raw: string): string => {
  let phone = String(raw).replace(/[\s\-\(\)]/g, '');
  if (/^8\d{9}$/.test(phone)) phone = `+998${phone.slice(1)}`;
  if (!/^\+998\d{9}$/.test(phone)) phone = `+${phone}`;
  return phone;
};

export const telegramLink = asyncHandler(async (req: Request, res: Response) => {
  const { telegramChatId, phone } = req.body;
  if (!telegramChatId) throw new ApiError(400, 'telegramChatId talab qilinadi');
  if (!phone) throw new ApiError(400, "Telefon raqam talab qilinadi");

  const normalized = normalizePhone(phone);
  const user = await User.findOne({ phone: normalized });
  if (!user) {
    throw new ApiError(404, "Bu telefon raqam tizimda topilmadi. Avval tizimda ro'yxatdan o'ting.");
  }

  await User.updateOne({ _id: user._id }, { $set: { telegram_chat_id: String(telegramChatId) } });

  const roleMap: Record<string, string> = { client: 'customer', owner: 'owner', staff: 'staff' };
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.username || user.phone;

  res.json({
    role: roleMap[user.role] || user.role,
    userId: String(user._id),
    name,
    phone: user.phone,
  });
});
