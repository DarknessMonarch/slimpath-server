const express = require('express');
const router = express.Router();
const { initializeTracking, updateTracking, getTracking, getTrackingHistory } = require('../controllers/trackingController');

router.get('/history/:id', getTrackingHistory);

router.post('/initialize', initializeTracking);

router.post('/update', updateTracking);

router.get('/:id', getTracking);

module.exports = router;
