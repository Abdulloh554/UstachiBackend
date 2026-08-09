import { Router } from 'express';
import { authRequired, requireAdmin } from '../middleware/auth';
import * as adminController from '../controllers/admin.controller';

const router = Router();

router.get('/dashboard/', authRequired, requireAdmin, adminController.dashboard);
router.get('/users/', authRequired, requireAdmin, adminController.users);
router.get('/masters/', authRequired, requireAdmin, adminController.masters);
router.get('/orders/', authRequired, requireAdmin, adminController.orders);
router.get('/map/', authRequired, requireAdmin, adminController.map);

export default router;
