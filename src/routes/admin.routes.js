const express = require('express');
const { authRequired, requireAdmin } = require('../middleware/auth');
const adminController = require('../controllers/admin.controller');

const router = express.Router();

router.get('/dashboard/', authRequired, requireAdmin, adminController.dashboard);
router.get('/users/', authRequired, requireAdmin, adminController.users);
router.get('/masters/', authRequired, requireAdmin, adminController.masters);
router.get('/orders/', authRequired, requireAdmin, adminController.orders);
router.get('/map/', authRequired, requireAdmin, adminController.map);

module.exports = router;
