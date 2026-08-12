import { Router } from 'express';
import { authRequired } from '../middleware/auth';
import * as chatController from '../controllers/chat.controller';

const router = Router();

router.get('/conversations/', authRequired, chatController.conversations);
router.get('/conversations/:id/messages/', authRequired, chatController.messages);
router.post('/conversations/:id/messages/', authRequired, chatController.sendMessage);
router.patch('/conversations/:id/messages/:mid/', authRequired, chatController.editMessage);
router.delete('/conversations/:id/messages/:mid/', authRequired, chatController.deleteMessage);

export default router;
