const express = require('express');
const upload = require('../middleware/upload');
const { createImport } = require('../controllers/import-controller');

const router = express.Router();
router.post('/', upload, createImport);

module.exports = router;
