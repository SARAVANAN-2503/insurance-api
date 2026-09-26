const express = require('express');
const { scheduleMessage, listMessages } = require('../controllers/message-controller');

const router = express.Router();

router.post('/schedule', scheduleMessage);
router.get('/', listMessages);

module.exports = router;
