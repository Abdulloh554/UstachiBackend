import { Router } from 'express';
import { botAuth } from '../middleware/auth';
import * as botController from '../controllers/bot.controller';
import { create as createOrder } from '../controllers/orders.controller';

const router = Router();

router.get('/services/', botController.services);
router.post('/orders/', botAuth, createOrder);
router.post('/orders/classify/', botAuth, botController.classifyText);
router.post('/orders/from_text/', botAuth, botController.createOrderFromText);
router.get('/orders/active/', botAuth, botController.activeOrder);
router.post('/orders/cancel/', botAuth, botController.cancelActiveOrder);
router.get('/staff/today/', botAuth, botController.staffToday);
router.get('/report/daily/', botAuth, botController.ownerReport);
router.get('/inventory/low/', botAuth, botController.ownerReport);

export default router;
