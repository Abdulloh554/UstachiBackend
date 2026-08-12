import path from 'path';
import http, { Server } from 'http';
import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import env from './config/env';
import connectDB from './config/db';
import routes from './routes';
import { notFound, errorHandler } from './utils/http';
import { setupChatWebSocket } from './ws/chat';
import seed from './scripts/seed';

export async function main(): Promise<Server> {
  await connectDB();

  const app: Express = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cookieParser());

  const corsOrigins = env.CORS_ALLOWED_ORIGINS === '*'
    ? true
    : env.CORS_ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  app.use(cors({ origin: corsOrigins, credentials: true }));

  // Bearer-token clients are not susceptible to CSRF, but browser requests
  // authenticated by the HttpOnly cookie are. CORS alone does not prevent a
  // cross-site request from reaching this server, so reject unsafe methods
  // whose Origin is not one of the configured frontend origins.
  app.use((req, res, next) => {
    const isUnsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    const hasAuthCookie = Boolean(req.cookies?.access_token || req.cookies?.refresh_token);
    if (!isUnsafe || !hasAuthCookie || corsOrigins === true) return next();
    const origin = req.get('origin');
    if (!origin || !corsOrigins.includes(origin)) {
      return res.status(403).json({ error: 'Noto\'g\'ri so\'rov manbasi' });
    }
    next();
  });

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  if (env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  const apiLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Juda ko'p so'rov yuborildi. Birozdan so'ng qayta urinib ko'ring." },
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Juda ko'p urinish. 15 daqiqadan so'ng qayta urinib ko'ring." },
  });

  app.use(
    env.PUBLIC_MEDIA_URL,
    express.static(path.resolve(process.cwd(), env.MEDIA_DIR), {
      setHeaders(res) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    })
  );

  app.get('/', (req, res) => {
    res.json({ name: 'Ustachi API', status: 'running', docs: '/api/health/' });
  });

  app.use('/api/auth/', authLimiter);
  app.use('/api', apiLimiter, routes);

  app.use(notFound);
  app.use(errorHandler);

  const server = http.createServer(app);
  setupChatWebSocket(server);

  await new Promise<void>((resolve) => server.listen(env.PORT, resolve));
  console.log(`[server] Ustachi backend http://localhost:${env.PORT}`);
  console.log(`[server] WebSocket ws://localhost:${env.PORT}/ws/chat/:id/`);

  // Production data must be initialized explicitly with `npm run seed`.
  // Running it on every boot can accidentally create a default admin account.
  if (env.NODE_ENV !== 'production') {
    seed().catch((err) => console.error('[seed] Xatolik:', err));
  }
  return server;
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[server] Ishga tushirishda xatolik:', err);
    process.exit(1);
  });
}
