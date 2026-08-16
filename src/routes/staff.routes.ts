import { Router } from 'express';
import { authRequired, requireRole, attachWorkshop } from '../middleware/auth';
import * as staffController from '../controllers/staff.controller';

const router = Router();

router.use(authRequired, requireRole('staff'), attachWorkshop);

router.get('/me/', staffController.myProfile);
router.patch('/me/', staffController.updateMyProfile);
router.put('/me/', staffController.updateMyProfile);
router.get('/me/orders/', staffController.myOrders);
router.get('/me/today/', staffController.myToday);

export default router;
