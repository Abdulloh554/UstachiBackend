import { Schema, model, Document, Model } from 'mongoose';

export interface ISiteSettings extends Document {
  site_name: string;
  site_description: string;
  contact_phone: string;
  contact_email: string;
  telegram_url: string;
  instagram_url: string;
  banner_title: string;
  banner_subtitle: string;
  min_order_price: number;
  max_order_price: number;
  currency_label: string;
  support_phone: string;
}

interface SiteSettingsModel extends Model<ISiteSettings> {
  load(): Promise<ISiteSettings>;
}

const siteSettingsSchema = new Schema<ISiteSettings>(
  {
    site_name: { type: String, default: 'Ustachi' },
    site_description: { type: String, default: '' },
    contact_phone: { type: String, default: '' },
    contact_email: { type: String, default: '' },
    telegram_url: { type: String, default: '' },
    instagram_url: { type: String, default: '' },
    banner_title: { type: String, default: '' },
    banner_subtitle: { type: String, default: '' },
    min_order_price: { type: Number, default: 0 },
    max_order_price: { type: Number, default: 0 },
    currency_label: { type: String, default: "so'm" },
    support_phone: { type: String, default: '' },
  },
  { timestamps: false }
);

siteSettingsSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete (ret as any)._id;
    return ret;
  },
});

siteSettingsSchema.statics.load = async function (): Promise<ISiteSettings> {
  const existing = await this.findOne();
  if (existing) return existing;
  return this.create({});
};

export default model<ISiteSettings, SiteSettingsModel>('SiteSettings', siteSettingsSchema);
