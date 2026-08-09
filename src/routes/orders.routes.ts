import { Router } from 'express';
import { authRequired, requireRole } from '../middleware/auth';
import * as ordersController from '../controllers/orders.controller';

const router = Router();

router.get('/', authRequired, ordersController.list);
router.post('/', authRequired, requireRole('client'), ordersController.create);
router.get('/:id', authRequired, ordersController.detail);
router.put('/:id', authRequired, ordersController.update);
router.patch('/:id', authRequired, ordersController.update);
router.delete('/:id', authRequired, ordersController.remove);
router.post('/:id/accept/', authRequired, requireRole('master'), ordersController.accept);
router.post('/:id/cancel/', authRequired, ordersController.cancel);
router.post('/:id/update_status/', authRequired, requireRole('master'), ordersController.updateStatus);
router.get('/:id/logs/', authRequired, ordersController.logs);

export default router;
