const express = require('express');
const authRoutes = require('./auth.routes');
const clientsRoutes = require('./clients.routes');
const mastersRoutes = require('./masters.routes');
const ordersRoutes = require('./orders.routes');
const chatRoutes = require('./chat.routes');
const adminRoutes = require('./admin.routes');
const settingsRoutes = require('./settings.routes');
const storesRoutes = require('./stores.routes');

const router = express.Router();

router.get('/health/', (req, res) => {
  const mongoose = require('mongoose');
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

module.exports = router;
