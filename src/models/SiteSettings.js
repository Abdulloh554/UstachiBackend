const mongoose = require('mongoose');

const siteSettingsSchema = new mongoose.Schema(
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
    delete ret._id;
    return ret;
  },
});

siteSettingsSchema.statics.load = async function () {
  const existing = await this.findOne();
  if (existing) return existing;
  return this.create({});
};

module.exports = mongoose.model('SiteSettings', siteSettingsSchema);
