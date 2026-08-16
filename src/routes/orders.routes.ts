import { Router } from 'express';
import { authRequired, requireRole, attachWorkshop } from '../middleware/auth';
import * as ordersController from '../controllers/orders.controller';

const router = Router();

router.use(authRequired, attachWorkshop);

router.get('/', ordersController.list);
router.post('/', requireRole('owner', 'client'), ordersController.create);
router.get('/queue/', ordersController.queue);
router.get('/:id', ordersController.detail);
router.put('/:id', ordersController.update);
router.patch('/:id', ordersController.update);
router.post('/:id/assign/', requireRole('owner'), ordersController.assign);
router.post('/:id/update_status/', ordersController.updateStatus);
router.post('/:id/cancel/', ordersController.cancel);
router.post('/:id/consume/', ordersController.consume);
router.get('/:id/logs/', ordersController.logs);

export default router;
