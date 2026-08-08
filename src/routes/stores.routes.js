const express = require('express');
const { authRequired, requireRole } = require('../middleware/auth');
const storesController = require('../controllers/stores.controller');
const { upload } = require('../middleware/upload');

const router = express.Router();

router.get('/products/', authRequired, storesController.productList);
router.get('/products/:id', authRequired, storesController.productDetail);
router.get('/favorites/', authRequired, storesController.favoriteList);
router.post('/favorites/toggle/', authRequired, storesController.toggleFavorite);
router.get('/cart/', authRequired, storesController.cartGet);
router.post('/cart/', authRequired, storesController.cartAdd);
router.delete('/cart/:id', authRequired, storesController.cartRemove);
router.post('/cart/checkout/', authRequired, storesController.checkout);

router.get('/me/store/', authRequired, requireRole('seller'), storesController.myStoreGet);
router.put('/me/store/', authRequired, requireRole('seller'), upload.single('logo'), storesController.myStoreUpdate);
router.patch('/me/store/', authRequired, requireRole('seller'), upload.single('logo'), storesController.myStoreUpdate);
router.get('/me/products/', authRequired, requireRole('seller'), storesController.myProductList);
router.post('/me/products/', authRequired, requireRole('seller'), upload.single('image'), storesController.myProductCreate);
router.get('/me/products/:id', authRequired, requireRole('seller'), storesController.myProductDetail);
router.patch('/me/products/:id', authRequired, requireRole('seller'), upload.single('image'), storesController.myProductUpdate);
router.put('/me/products/:id', authRequired, requireRole('seller'), upload.single('image'), storesController.myProductUpdate);
router.delete('/me/products/:id', authRequired, requireRole('seller'), storesController.myProductDelete);
router.get('/me/statistics/', authRequired, requireRole('seller'), storesController.statistics);

module.exports = router;
