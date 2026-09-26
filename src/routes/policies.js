const express = require('express');
const { searchPolicies, aggregatePolicies } = require('../controllers/policy-controller');

const router = express.Router();

router.get('/search', searchPolicies);
router.get('/aggregate', aggregatePolicies);

module.exports = router;
