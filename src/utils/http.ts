import { Request, Response, NextFunction, RequestHandler } from 'express';

export class ApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'ApiError';
  }
}

type AsyncHandlerFn = (req: Request, res: Response, next: NextFunction) => Promise<any>;

export const asyncHandler = (fn: AsyncHandlerFn): RequestHandler => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: 'Endpoint topilmadi' });
};

export const errorHandler: (err: any, req: Request, res: Response, next: NextFunction) => Response | void = (
  err,
  req,
  res
) => {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ error: "Noto'g'ri ID format" });
  }
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors || {}).map((e: any) => e.message);
    return res.status(400).json({ error: messages.join(', ') });
  }
  if (err.code === 11000) {
    return res.status(400).json({ error: "Bu ma'lumot allaqachon mavjud (takrorlangan maydon)" });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: "Noto'g'ri JSON format" });
  }
  console.error('[error]', err);
  res.status(500).json({ error: 'Serverda xatolik yuz berdi' });
};
