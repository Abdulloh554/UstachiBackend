const { SiteSettings } = require('../models');
const { ApiError, asyncHandler } = require('../utils/http');
const { isAdmin } = require('../middleware/auth');

const FIELDS = [
  'site_name',
  'site_description',
  'contact_phone',
  'contact_email',
  'telegram_url',
  'instagram_url',
  'banner_title',
  'banner_subtitle',
  'min_order_price',
  'max_order_price',
  'currency_label',
  'support_phone',
];

const getSettings = asyncHandler(async (req, res) => {
  const s = await SiteSettings.load();
  const out = {};
  for (const f of FIELDS) out[f] = s[f];
  res.json(out);
});

const updateSettings = asyncHandler(async (req, res) => {
  if (!isAdmin(req.user)) {
    throw new ApiError(403, 'Faqat admin uchun');
  }
  const s = await SiteSettings.load();
  for (const f of FIELDS) {
    if (f in req.body) s[f] = req.body[f];
  }
  await s.save();
  const out = {};
  for (const f of FIELDS) out[f] = s[f];
  res.json(out);
});

module.exports = { getSettings, updateSettings };
