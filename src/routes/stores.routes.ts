import { Router } from 'express';
import { authRequired, requireRole } from '../middleware/auth';
import * as storesController from '../controllers/stores.controller';
import { upload, verifyUpload } from '../middleware/upload';

const router = Router();

router.get('/products/', authRequired, storesController.productList);
router.get('/products/:id', authRequired, storesController.productDetail);
router.get('/favorites/', authRequired, storesController.favoriteList);
router.post('/favorites/toggle/', authRequired, storesController.toggleFavorite);
router.get('/cart/', authRequired, storesController.cartGet);
router.post('/cart/', authRequired, storesController.cartAdd);
router.delete('/cart/:id', authRequired, storesController.cartRemove);
router.post('/cart/checkout/', authRequired, storesController.checkout);

router.get('/me/store/', authRequired, requireRole('seller'), storesController.myStoreGet);
router.put(
  '/me/store/',
  authRequired,
  requireRole('seller'),
  upload.single('logo'),
  verifyUpload,
  storesController.myStoreUpdate
);
router.patch(
  '/me/store/',
  authRequired,
  requireRole('seller'),
  upload.single('logo'),
  verifyUpload,
  storesController.myStoreUpdate
);
router.get('/me/products/', authRequired, requireRole('seller'), storesController.myProductList);
router.post(
  '/me/products/',
  authRequired,
  requireRole('seller'),
  upload.single('image'),
  verifyUpload,
  storesController.myProductCreate
);
router.get('/me/products/:id', authRequired, requireRole('seller'), storesController.myProductDetail);
router.patch(
  '/me/products/:id',
  authRequired,
  requireRole('seller'),
  upload.single('image'),
  verifyUpload,
  storesController.myProductUpdate
);
router.put(
  '/me/products/:id',
  authRequired,
  requireRole('seller'),
  upload.single('image'),
  verifyUpload,
  storesController.myProductUpdate
);
router.delete('/me/products/:id', authRequired, requireRole('seller'), storesController.myProductDelete);
router.get('/me/statistics/', authRequired, requireRole('seller'), storesController.statistics);

export default router;
