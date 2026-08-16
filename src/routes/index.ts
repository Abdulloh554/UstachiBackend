import { Router } from 'express';
import mongoose from 'mongoose';

import authRoutes from './auth.routes';
import ordersRoutes from './orders.routes';
import staffRoutes from './staff.routes';
import workshopsRoutes from './workshops.routes';
import chatRoutes from './chat.routes';
import settingsRoutes from './settings.routes';
import botRoutes from './bot.routes';

const router = Router();

router.get('/health/', (req, res) => {
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

router.use('/auth/', authRoutes);
router.use('/orders/', ordersRoutes);
router.use('/staff/', staffRoutes);
router.use('/workshops/', workshopsRoutes);
router.use('/chat/', chatRoutes);
router.use('/settings/', settingsRoutes);
router.use('/bot/', botRoutes);

export default router;
