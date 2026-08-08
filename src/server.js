const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const env = require('./config/env');
const connectDB = require('./config/db');
const routes = require('./routes');
const { notFound, errorHandler } = require('./utils/http');
const { setupChatWebSocket } = require('./ws/chat');
const seed = require('./scripts/seed');

async function main() {
  await connectDB();

  const app = express();
  app.set('trust proxy', 1);

  const corsOrigins =
    env.CORS_ALLOWED_ORIGINS === '*' ? true : env.CORS_ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  if (env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  app.use(env.PUBLIC_MEDIA_URL, express.static(path.resolve(process.cwd(), env.MEDIA_DIR)));

  app.get('/', (req, res) => {
    res.json({ name: 'Ustachi API', status: 'running', docs: '/api/health/' });
  });

  app.use('/api', routes);

  app.use(notFound);
  app.use(errorHandler);

  const server = http.createServer(app);
  setupChatWebSocket(server);

  await new Promise((resolve) => server.listen(env.PORT, resolve));
  console.log(`[server] Ustachi backend http://localhost:${env.PORT}`);
  console.log(`[server] WebSocket ws://localhost:${env.PORT}/ws/chat/:id/`);

  seed().catch((err) => console.error('[seed] Xatolik:', err));
  return server;
}

module.exports = { main };

if (require.main === module) {
  main().catch((err) => {
    console.error('[server] Ishga tushirishda xatolik:', err);
    process.exit(1);
  });
}
