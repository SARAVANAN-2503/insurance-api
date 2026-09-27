const express = require('express');
const upload = require('../middleware/upload');
const { createImport, importStatus, downloadReport } = require('../controllers/import-controller');

const router = express.Router();
router.post('/', upload, createImport);
router.get('/:id', importStatus);
router.get('/:id/report', downloadReport);

module.exports = router;
