const express = require('express');
const { authRequired } = require('../middleware/auth');
const settingsController = require('../controllers/settings.controller');

const router = express.Router();

router.get('/', settingsController.getSettings);
router.put('/', authRequired, settingsController.updateSettings);

module.exports = router;
