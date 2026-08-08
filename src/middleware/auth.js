const jwt = require('jsonwebtoken');
const { User } = require('../models');
const env = require('../config/env');
const { ApiError, asyncHandler } = require('../utils/http');

const authRequired = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    throw new ApiError(401, 'Avtorizatsiya talab qilinadi');
  }
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch (err) {
    throw new ApiError(401, 'Token yaroqsiz yoki muddati tugagan');
  }
  if (!payload.user_id) {
    throw new ApiError(401, 'Token yaroqsiz');
  }
  const user = await User.findById(payload.user_id);
  if (!user) {
    throw new ApiError(401, 'Foydalanuvchi topilmadi');
  }
  req.user = user;
  next();
});

const isAdmin = (user) => Boolean(user && (user.is_staff || user.role === 'admin'));

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Avtorizatsiya talab qilinadi' });
  }
  if (isAdmin(req.user) || roles.includes(req.user.role)) {
    return next();
  }
  return res.status(403).json({ error: 'Bu amal uchun huquqingiz yo\'q' });
};

const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Avtorizatsiya talab qilinadi' });
  }
  if (!isAdmin(req.user)) {
    return res.status(403).json({ error: 'Faqat admin uchun' });
  }
  next();
};

module.exports = { authRequired, requireRole, requireAdmin, isAdmin };
