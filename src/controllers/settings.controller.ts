import { Request, Response } from 'express';
import { SiteSettings } from '../models';
import { ApiError, asyncHandler } from '../utils/http';
import { isAdmin } from '../middleware/auth';

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

export const getSettings = asyncHandler(async (req: Request, res: Response) => {
  const s: any = await SiteSettings.load();
  const out: Record<string, any> = {};
  for (const f of FIELDS) out[f] = s[f];
  res.json(out);
});

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  if (!isAdmin(req.user)) {
    throw new ApiError(403, 'Faqat admin uchun');
  }
  const s: any = await SiteSettings.load();
  for (const f of FIELDS) {
    if (f in req.body) s[f] = req.body[f];
  }
  await s.save();
  const out: Record<string, any> = {};
  for (const f of FIELDS) out[f] = s[f];
  res.json(out);
});
