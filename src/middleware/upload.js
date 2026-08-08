const path = require('path');
const fs = require('fs');
const multer = require('multer');
const env = require('../config/env');
const { ApiError } = require('../utils/http');

const uploadDir = path.resolve(process.cwd(), env.MEDIA_DIR);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const imageFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new ApiError(400, 'Faqat rasm fayllari yuklash mumkin'), false);
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFilter,
});

const toMediaUrl = (file) => {
  if (!file) return null;
  return `${env.PUBLIC_MEDIA_URL}/${file.filename}`;
};

module.exports = { upload, toMediaUrl, uploadDir };
