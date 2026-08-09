import { Router } from 'express';
import { authRequired } from '../middleware/auth';
import * as settingsController from '../controllers/settings.controller';

const router = Router();

router.get('/', settingsController.getSettings);
router.put('/', authRequired, settingsController.updateSettings);

export default router;
