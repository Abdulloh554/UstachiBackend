import { Router } from 'express';
import { authRequired } from '../middleware/auth';
import * as authController from '../controllers/auth.controller';
import { upload, verifyUpload } from '../middleware/upload';

const router = Router();

router.post('/register/', authController.register);
router.post('/login/', authController.login);
router.post('/refresh/', authController.refresh);
router.post('/logout/', authController.logout);
router.get('/profile/', authRequired, authController.profile);
router.patch('/profile/', authRequired, upload.single('avatar'), verifyUpload, authController.updateProfile);
router.put('/profile/', authRequired, upload.single('avatar'), verifyUpload, authController.updateProfile);
router.post('/change-password/', authRequired, authController.changePassword);
router.get('/professions/', authController.professions);

export default router;
