const express = require('express');
const { authRequired, requireRole } = require('../middleware/auth');
const clientsController = require('../controllers/clients.controller');

const router = express.Router();

router.get('/my-orders/', authRequired, requireRole('client'), clientsController.myOrders);

module.exports = router;
