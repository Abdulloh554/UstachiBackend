const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Profession, MasterProfile } = require('../models');
const env = require('../config/env');
const { MASTER_CONSTANTS } = require('../config/constants');
const { ApiError, asyncHandler } = require('../utils/http');
const { userSerializer, professionSerializer } = require('../utils/serializers');
const { toMediaUrl } = require('../middleware/upload');

const PHONE_REGEX = /^\+998\d{9}$/;

const signAccess = (userId) =>
  jwt.sign({ user_id: String(userId) }, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES,
  });

const signRefresh = (userId) =>
  jwt.sign({ user_id: String(userId), type: 'refresh' }, env.JWT_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES,
  });

const validatePhone = (phone) => {
  if (!PHONE_REGEX.test(phone)) {
    throw new ApiError(
      400,
      'Telefon raqam formati: +998 XX XXX XX XX (masalan +998901234567)'
    );
  }
};

const register = asyncHandler(async (req, res) => {
  const { phone, password, username = '', first_name = '', last_name = '', role = 'client' } = req.body;
  const profession_ids = req.body.profession_ids || [];
  const bio = req.body.bio || '';
  const experience_years = parseInt(req.body.experience_years, 10) || 0;

  validatePhone(phone);

  if (!['client', 'master', 'seller'].includes(role)) {
    throw new ApiError(400, 'Ro\'yxatdan o\'tishda faqat client, master yoki seller roli tanlanishi mumkin.');
  }
  if (!password || String(password).length < 6) {
    throw new ApiError(400, 'Parol kamida 6 belgidan iborat bo\'lishi kerak.');
  }

  const existing = await User.findOne({ phone });
  if (existing) {
    throw new ApiError(400, { phone: ['Bu telefon raqam allaqachon ro\'yxatdan o\'tgan.'] });
  }

  if (role === 'master' && (!profession_ids || profession_ids.length === 0)) {
    throw new ApiError(400, 'Master ro\'yxatdan o\'tishda kamida bitta kategoriya tanlashi kerak.');
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

  if (role === 'master') {
    const professions = await Profession.find({ _id: { $in: profession_ids } });
    await MasterProfile.create({
      user: user._id,
      professions: professions.map((p) => p._id),
      bio,
      experience_years,
      balance: MASTER_CONSTANTS.INITIAL_BALANCE,
    });
  }

  res.status(201).json(userSerializer(user));
});

const login = asyncHandler(async (req, res) => {
  const { phone, password } = req.body;
  const user = await User.findOne({ phone });
  if (!user) {
    return res.status(401).json({ detail: 'Telefon raqam yoki parol noto\'g\'ri' });
  }
  const ok = await bcrypt.compare(password || '', user.password);
  if (!ok) {
    return res.status(401).json({ detail: 'Telefon raqam yoki parol noto\'g\'ri' });
  }
  res.json({
    access: signAccess(user._id),
    refresh: signRefresh(user._id),
  });
});

const refresh = asyncHandler(async (req, res) => {
  const { refresh: token } = req.body;
  if (!token) {
    throw new ApiError(400, 'Refresh token berilmagan');
  }
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ detail: 'Refresh token yaroqsiz yoki muddati tugagan' });
  }
  if (!payload.user_id) {
    return res.status(401).json({ detail: 'Refresh token yaroqsiz' });
  }
  res.json({ access: signAccess(payload.user_id) });
});

const profile = asyncHandler(async (req, res) => {
  res.json(userSerializer(req.user));
});

const updateProfile = asyncHandler(async (req, res) => {
  const allowed = ['username', 'first_name', 'last_name', 'language', 'theme', 'location_lat', 'location_lng'];
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

const changePassword = asyncHandler(async (req, res) => {
  const { old_password, new_password } = req.body;
  if (!old_password || !new_password) {
    throw new ApiError(400, 'Eski va yangi parol kiritilishi kerak.');
  }
  if (String(new_password).length < 6) {
    throw new ApiError(400, 'Yangi parol kamida 6 belgidan iborat bo\'lishi kerak.');
  }
  const ok = await bcrypt.compare(old_password, req.user.password);
  if (!ok) {
    throw new ApiError(400, 'Eski parol noto\'g\'ri');
  }
  req.user.password = await bcrypt.hash(new_password, 10);
  await req.user.save();
  res.json({ message: 'Parol muvaffaqiyatli o\'zgartirildi' });
});

const professions = asyncHandler(async (req, res) => {
  const list = await Profession.find().sort({ name_uz: 1 });
  res.json(list.map(professionSerializer));
});

module.exports = {
  register,
  login,
  refresh,
  profile,
  updateProfile,
  changePassword,
  professions,
};
