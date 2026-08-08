class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'ApiError';
  }
}

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const notFound = (req, res, next) => {
  res.status(404).json({ error: 'Endpoint topilmadi' });
};

const errorHandler = (err, req, res, next) => {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'Noto\'g\'ri ID format' });
  }
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ error: messages.join(', ') });
  }
  if (err.code === 11000) {
    return res.status(400).json({ error: 'Bu ma\'lumot allaqachon mavjud (takrorlangan maydon)' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Noto\'g\'ri JSON format' });
  }
  console.error('[error]', err);
  res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
};

module.exports = { ApiError, asyncHandler, notFound, errorHandler };
