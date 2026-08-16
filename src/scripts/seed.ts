import bcrypt from 'bcryptjs';
import { User, Workshop, Service, Product, SiteSettings } from '../models';
import env from '../config/env';

const DEFAULT_SERVICES = [
  { name: 'Kran tuzatish', price: 80000, duration_minutes: 30 },
  { name: 'Smesitel o\'rnatish', price: 150000, duration_minutes: 60 },
  { name: 'Hojatxona bakachasi tuzatish', price: 70000, duration_minutes: 40 },
  { name: 'Quvur almashtirish (metr)', price: 50000, duration_minutes: 60 },
  { name: 'Isitish batareyasi o\'rnatish', price: 250000, duration_minutes: 120 },
  { name: 'Suv filtri o\'rnatish', price: 90000, duration_minutes: 45 },
  { name: 'Sim o\'tkazish (nuqta)', price: 120000, duration_minutes: 60 },
  { name: 'Rozetka o\'rnatish', price: 50000, duration_minutes: 30 },
  { name: 'Kalit va lyustra o\'rnatish', price: 60000, duration_minutes: 40 },
  { name: 'Konditsioner o\'rnatish', price: 350000, duration_minutes: 120 },
  { name: 'Suv isitgich (boyler) o\'rnatish', price: 180000, duration_minutes: 90 },
  { name: 'Qo\'ng\'iroq chaqiruvi (diagnostika)', price: 30000, duration_minutes: 20 },
];

const DEFAULT_PRODUCTS = [
  { name: 'Kran (o\'tiruvchi)', category: 'santexnika', price: 120000, cost_price: 90000, quantity: 8, min_threshold: 2, unit: 'dona' },
  { name: 'Silikon germetik', category: 'material', price: 15000, cost_price: 10000, quantity: 30, min_threshold: 5, unit: 'dona' },
  { name: 'Rozetka (ichki)', category: 'elektrik', price: 25000, cost_price: 18000, quantity: 20, min_threshold: 5, unit: 'dona' },
  { name: 'Sim VVG 2.5', category: 'elektrik', price: 9000, cost_price: 7000, quantity: 100, min_threshold: 20, unit: 'metr' },
];

export default async function seed(): Promise<void> {
  const created: string[] = [];

  const settingsCount = await SiteSettings.countDocuments();
  if (settingsCount === 0) {
    await SiteSettings.create({});
    created.push('site settings');
  }

  // Bitta asosiy ustaxona: egasi (env orqali) + xizmat turlari + boshlang'ich ombor
  let owner: any = await User.findOne({ phone: env.ADMIN_PHONE });
  if (!owner) {
    const hashed = await bcrypt.hash(env.ADMIN_PASSWORD, 10);
    owner = await User.create({
      phone: env.ADMIN_PHONE,
      username: env.ADMIN_USERNAME,
      first_name: 'Tohir',
      last_name: 'Ustoz',
      role: 'owner',
      is_staff: true,
      email: env.ADMIN_EMAIL,
      password: hashed,
    });
    created.push('owner');
  }

  let workshop: any = await Workshop.findOne({ owner: owner._id });
  if (!workshop) {
    workshop = await Workshop.create({
      name: '«Ustachi» santexnika va elektr ustaxonasi',
      address: 'Toshkent, Chilonzor 20-mavze',
      phone: env.ADMIN_PHONE,
      owner: owner._id,
      work_schedule: 'Du — Sha: 09:00–18:00',
    });
    created.push('workshop');
  }

  // Xizmatlar: mavjud bo'lmaganlari nomi bo'yicha qo'shiladi (takrorlashsiz).
  const existingServices = await Service.find({ workshop: workshop._id }).select('name');
  const existingServiceNames = new Set(existingServices.map((s: any) => s.name));
  const newServices = DEFAULT_SERVICES.filter((s) => !existingServiceNames.has(s.name));
  if (newServices.length) {
    await Service.insertMany(newServices.map((s) => ({ workshop: workshop._id, ...s })));
    created.push(`services (+${newServices.length}, jami ${existingServices.length + newServices.length})`);
  }

  // Ombor: mavjud bo'lmagan mahsulotlar qo'shiladi (takrorlashsiz).
  const existingProducts = await Product.find({ workshop: workshop._id }).select('name');
  const existingProductNames = new Set(existingProducts.map((p: any) => p.name));
  const newProducts = DEFAULT_PRODUCTS.filter((p) => !existingProductNames.has(p.name));
  if (newProducts.length) {
    await Product.insertMany(newProducts.map((p) => ({ workshop: workshop._id, image: null, ...p })));
    created.push(`products (+${newProducts.length})`);
  }

  if (created.length) {
    console.log('[seed] Yaratildi:', created.join(', '));
  } else {
    console.log('[seed] Hech narsa yaratilmadi (hammasi mavjud)');
  }
}
