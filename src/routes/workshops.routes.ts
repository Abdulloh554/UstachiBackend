import { Router } from 'express';
import { authRequired, requireRole, attachWorkshop } from '../middleware/auth';
import * as workshopsController from '../controllers/workshops.controller';
import * as reportsController from '../controllers/reports.controller';
import { upload, verifyUpload } from '../middleware/upload';

const router = Router();

router.get('/public/', workshopsController.publicWorkshop);

router.use(authRequired, attachWorkshop);

router.get('/me/', workshopsController.myWorkshop);
router.put('/me/', requireRole('owner'), workshopsController.updateMyWorkshop);
router.patch('/me/', requireRole('owner'), workshopsController.updateMyWorkshop);

router.get('/me/dashboard/', workshopsController.dashboard);

router.get('/me/staff/', requireRole('owner'), workshopsController.staffList);
router.post('/me/staff/', requireRole('owner'), workshopsController.staffCreate);
router.patch('/me/staff/:id', requireRole('owner'), workshopsController.staffUpdate);
router.put('/me/staff/:id', requireRole('owner'), workshopsController.staffUpdate);
router.delete('/me/staff/:id', requireRole('owner'), workshopsController.staffRemove);

router.get('/me/services/', workshopsController.serviceList);
router.post('/me/services/', requireRole('owner'), workshopsController.serviceCreate);
router.patch('/me/services/:id', requireRole('owner'), workshopsController.serviceUpdate);
router.put('/me/services/:id', requireRole('owner'), workshopsController.serviceUpdate);
router.delete('/me/services/:id', requireRole('owner'), workshopsController.serviceRemove);

router.get('/me/inventory/', workshopsController.inventoryList);
router.post(
  '/me/inventory/',
  requireRole('owner'),
  upload.single('image'),
  verifyUpload,
  workshopsController.inventoryCreate
);
router.patch(
  '/me/inventory/:id',
  requireRole('owner'),
  upload.single('image'),
  verifyUpload,
  workshopsController.inventoryUpdate
);
router.put(
  '/me/inventory/:id',
  requireRole('owner'),
  upload.single('image'),
  verifyUpload,
  workshopsController.inventoryUpdate
);
router.delete('/me/inventory/:id', requireRole('owner'), workshopsController.inventoryRemove);

router.get('/me/reports/', requireRole('owner'), reportsController.report);

export default router;
