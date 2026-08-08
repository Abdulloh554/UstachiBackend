const express = require('express');
const { authRequired } = require('../middleware/auth');
const chatController = require('../controllers/chat.controller');

const router = express.Router();

router.get('/conversations/', authRequired, chatController.conversations);
router.get('/conversations/:id/messages/', authRequired, chatController.messages);
router.post('/conversations/:id/messages/', authRequired, chatController.sendMessage);

module.exports = router;
