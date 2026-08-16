import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const isProd = process.env.NODE_ENV === 'production';

const env: {
  NODE_ENV: string;
  PORT: number;
  MONGODB_URI: string;
  JWT_SECRET: string;
  JWT_ACCESS_EXPIRES: string;
  JWT_REFRESH_EXPIRES: string;
  MEDIA_DIR: string;
  PUBLIC_MEDIA_URL: string;
  CORS_ALLOWED_ORIGINS: string;
  COOKIE_DOMAIN: string;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX: number;
  ADMIN_USERNAME: string;
  ADMIN_PHONE: string;
  ADMIN_PASSWORD: string;
  ADMIN_EMAIL: string;
  BOT_TOKEN: string;
  AI_API_KEY: string;
  AI_MODEL: string;
} = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '8000', 10),
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ustachi',
  JWT_SECRET: process.env.JWT_SECRET || (isProd ? '' : 'dev-secret-change-me'),
  JWT_ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES || '1d',
  JWT_REFRESH_EXPIRES: process.env.JWT_REFRESH_EXPIRES || '30d',
  MEDIA_DIR: process.env.MEDIA_DIR || 'uploads',
  PUBLIC_MEDIA_URL: process.env.PUBLIC_MEDIA_URL || '/uploads',
  CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS || '*',
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || '',
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  ADMIN_PHONE: process.env.ADMIN_PHONE || '+998900000000',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || (isProd ? '' : 'AdminPass123!'),
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@example.com',
  BOT_TOKEN: process.env.BOT_TOKEN || '',
  AI_API_KEY: process.env.AI_API_KEY || '',
  AI_MODEL: process.env.AI_MODEL || 'gemini-2.5-flash',
};

if (isProd) {
  const missing: string[] = [];
  if (!env.JWT_SECRET) missing.push('JWT_SECRET');
  if (!env.MONGODB_URI) missing.push('MONGODB_URI');
  if (!env.ADMIN_PASSWORD) missing.push('ADMIN_PASSWORD');
  if (!env.CORS_ALLOWED_ORIGINS || env.CORS_ALLOWED_ORIGINS === '*') {
    missing.push("CORS_ALLOWED_ORIGINS (frontend domenlar ro'yxati, masalan https://app.ustachi.uz,http://localhost:3000)");
  }
  if (missing.length) {
    throw new Error(`[env] Ishlab chiqarish muhiti uchun quyidagi o'zgaruvchilar majburiy: ${missing.join(', ')}`);
  }
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
    throw new Error("[env] JWT_SECRET kamida 32 belgidan iborat tasodifiy string bo'lishi kerak.");
  }
}

export default env;
