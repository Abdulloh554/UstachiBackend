const express = require('express');
const { authRequired, requireRole } = require('../middleware/auth');
const mastersController = require('../controllers/masters.controller');

const router = express.Router();

router.get('/', mastersController.list);
router.get('/available-orders/', authRequired, requireRole('master'), mastersController.availableOrders);
router.get('/me/profile/', authRequired, requireRole('master'), mastersController.myProfile);
router.patch('/me/profile/', authRequired, requireRole('master'), mastersController.updateMyProfile);
router.put('/me/profile/', authRequired, requireRole('master'), mastersController.updateMyProfile);
router.get('/reviews/', authRequired, requireRole('master'), mastersController.reviewsList);
router.post('/reviews/', authRequired, requireRole('client'), mastersController.createReview);
router.get('/:id/orders/', mastersController.works);
router.get('/:id/', mastersController.detail);

module.exports = router;
