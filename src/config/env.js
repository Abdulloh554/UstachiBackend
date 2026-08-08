const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '8000', 10),
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ustachi',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-me',
  JWT_ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES || '1d',
  JWT_REFRESH_EXPIRES: process.env.JWT_REFRESH_EXPIRES || '30d',
  MEDIA_DIR: process.env.MEDIA_DIR || 'uploads',
  PUBLIC_MEDIA_URL: process.env.PUBLIC_MEDIA_URL || '/uploads',
  CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS || '*',
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  ADMIN_PHONE: process.env.ADMIN_PHONE || '+998900000000',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'AdminPass123!',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@example.com',
};

module.exports = env;
