import { Router } from 'express';
import mongoose from 'mongoose';

import authRoutes from './auth.routes';
import clientsRoutes from './clients.routes';
import mastersRoutes from './masters.routes';
import ordersRoutes from './orders.routes';
import chatRoutes from './chat.routes';
import adminRoutes from './admin.routes';
import settingsRoutes from './settings.routes';
import storesRoutes from './stores.routes';

const router = Router();

router.get('/health/', (req, res) => {
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

router.use('/auth/', authRoutes);
router.use('/clients/', clientsRoutes);
router.use('/masters/', mastersRoutes);
router.use('/orders/', ordersRoutes);
router.use('/chat/', chatRoutes);
router.use('/admin/', adminRoutes);
router.use('/settings/', settingsRoutes);
router.use('/stores/', storesRoutes);

export default router;
