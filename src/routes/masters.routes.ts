import { Router } from 'express';
import { authRequired, requireRole } from '../middleware/auth';
import * as mastersController from '../controllers/masters.controller';

const router = Router();

router.get('/', mastersController.list);
router.get('/available-orders/', authRequired, requireRole('master'), mastersController.availableOrders);
router.get('/me/profile/', authRequired, requireRole('master'), mastersController.myProfile);
router.patch('/me/profile/', authRequired, requireRole('master'), mastersController.updateMyProfile);
router.put('/me/profile/', authRequired, requireRole('master'), mastersController.updateMyProfile);
router.get('/reviews/', authRequired, requireRole('master'), mastersController.reviewsList);
router.post('/reviews/', authRequired, requireRole('client'), mastersController.createReview);
router.get('/:id/orders/', mastersController.works);
router.get('/:id/', mastersController.detail);

export default router;
