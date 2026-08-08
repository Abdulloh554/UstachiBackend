const express = require('express');
const { authRequired } = require('../middleware/auth');
const authController = require('../controllers/auth.controller');
const { upload } = require('../middleware/upload');

const router = express.Router();

router.post('/register/', authController.register);
router.post('/login/', authController.login);
router.post('/refresh/', authController.refresh);
router.get('/profile/', authRequired, authController.profile);
router.patch('/profile/', authRequired, upload.single('avatar'), authController.updateProfile);
router.put('/profile/', authRequired, upload.single('avatar'), authController.updateProfile);
router.post('/change-password/', authRequired, authController.changePassword);
router.get('/professions/', authController.professions);

module.exports = router;
