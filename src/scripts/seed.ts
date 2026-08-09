import bcrypt from 'bcryptjs';
import { User, Profession, SiteSettings } from '../models';
import env from '../config/env';

const DEFAULT_PROFESSIONS = [
  { name_uz: 'Elektrik', name_ru: 'Электрик', icon: '⚡' },
  { name_uz: 'Santexnik', name_ru: 'Сантехник', icon: '🔧' },
  { name_uz: 'Quruvchi', name_ru: 'Строитель', icon: '🏗️' },
  { name_uz: "G'isht teruvchi", name_ru: 'Каменщик', icon: '🧱' },
  { name_uz: "Bo'yoqchi", name_ru: 'Маляр', icon: '🎨' },
  { name_uz: 'Duradgor', name_ru: 'Плотник', icon: '🪚' },
  { name_uz: 'Payvandchi', name_ru: 'Сварщик', icon: '🔥' },
  { name_uz: 'Konditsioner montajchi', name_ru: 'Монтажник кондиционеров', icon: '❄️' },
  { name_uz: 'Pol teruvchi', name_ru: 'Укладчик пола', icon: '🛠️' },
  { name_uz: 'Umumiy usta', name_ru: 'Мастер на все руки', icon: '🧰' },
];

export default async function seed(): Promise<void> {
  const created: string[] = [];

  const professionCount = await Profession.countDocuments();
  if (professionCount === 0) {
    await Profession.insertMany(DEFAULT_PROFESSIONS);
    created.push(`professions (${DEFAULT_PROFESSIONS.length})`);
  }

  const adminExists = await User.findOne({ phone: env.ADMIN_PHONE });
  if (!adminExists) {
    const hashed = await bcrypt.hash(env.ADMIN_PASSWORD, 10);
    await User.create({
      phone: env.ADMIN_PHONE,
      username: env.ADMIN_USERNAME,
      first_name: 'Admin',
      last_name: '',
      role: 'admin',
      is_staff: true,
      email: env.ADMIN_EMAIL,
      password: hashed,
    });
    created.push('admin user');
  }

  const settingsCount = await SiteSettings.countDocuments();
  if (settingsCount === 0) {
    await SiteSettings.create({});
    created.push('site settings');
  }

  if (created.length) {
    console.log('[seed] Yaratildi:', created.join(', '));
  } else {
    console.log('[seed] Hech narsa yaratilmadi (hammasi mavjud)');
  }
}
