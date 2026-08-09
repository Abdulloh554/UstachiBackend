import { Router } from 'express';
import { authRequired, requireRole } from '../middleware/auth';
import * as clientsController from '../controllers/clients.controller';

const router = Router();

router.get('/my-orders/', authRequired, requireRole('client'), clientsController.myOrders);

export default router;
