const express = require('express');
const router = express.Router();
const {
    initializeTracking,
    updateTracking,
    getTracking,
    getTrackingHistory,
    getAllTracking
} = require('../controllers/trackingController');

router.post('/initialize', initializeTracking);

router.post('/update', updateTracking);

router.get('/:userId', getTracking);

router.get('/history/:id', getTrackingHistory);

router.get('/all/:userId', getAllTracking);

module.exports = router;