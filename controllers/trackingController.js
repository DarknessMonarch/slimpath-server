const Tracking = require('../models/trackingModel');
const User = require('../models/userModel');
const { performance } = require('perf_hooks');

exports.getIntelligentAnalysis = (params) => {
    const {
        currentWeight,
        goalWeight,
        durationWeeks,
        age,
        height,
        activityLevel
    } = params;

    validateAnalysisParams(params);

    const activityMultipliers = {
        sedentary: 1.2,
        lightlyActive: 1.375,
        moderatelyActive: 1.55,
        veryActive: 1.725,
        extraActive: 1.9
    };

    const bmr = 10 * currentWeight + 6.25 * height - 5 * age;
    const TDEE = bmr * activityMultipliers[activityLevel];
    const weightDelta = currentWeight - goalWeight;
    const dailyDeficit = Math.max((weightDelta * 7700) / (durationWeeks * 7), 0);

    const dailyCalories = Math.round(TDEE - dailyDeficit);
    const mealDistribution = calculateOptimalMealDistribution(dailyCalories, activityLevel);

    return {
        dailyCalories,
        mealDistribution,
        progressNotes: [{
            note: `Initial tracking started. Goal: ${goalWeight} kg over ${durationWeeks} weeks`,
            date: new Date()
        }]
    };
};

function validateAnalysisParams(params) {
    const requiredParams = ['currentWeight', 'goalWeight', 'durationWeeks', 'age', 'height', 'activityLevel'];

    for (const param of requiredParams) {
        if (!params[param]) {
            throw new Error(`Missing required parameter: ${param}`);
        }
    }

    const validActivityLevels = ['sedentary', 'lightlyActive', 'moderatelyActive', 'veryActive', 'extraActive'];
    if (!validActivityLevels.includes(params.activityLevel)) {
        throw new Error('Invalid activity level');
    }
}

function calculateOptimalMealDistribution(dailyCalories, activityLevel) {
    const distributionFactors = {
        sedentary: [0.25, 0.35, 0.4],
        lightlyActive: [0.3, 0.4, 0.3],
        moderatelyActive: [0.35, 0.4, 0.25],
        veryActive: [0.4, 0.35, 0.25],
        extraActive: [0.4, 0.3, 0.3]
    };

    const [morningFactor, afternoonFactor, nightFactor] = distributionFactors[activityLevel];

    return {
        morning: Math.round(dailyCalories * morningFactor),
        afternoon: Math.round(dailyCalories * afternoonFactor),
        night: Math.round(dailyCalories * nightFactor)
    };
}

async function generateProgressProjection(userId) {
    const trackingHistory = await Tracking.find({ user: userId }).sort({ createdAt: 1 });

    return trackingHistory.map((entry, index) => ({
        week: index + 1,
        weight: entry.currentWeight,
    }));
}

exports.initializeTracking = async (req, res) => {
    const startTime = performance.now();
    try {
        const { userId, currentWeight, goalWeight, durationWeeks, age, height, activityLevel } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const analysis = exports.getIntelligentAnalysis({
            currentWeight,
            goalWeight,
            durationWeeks,
            age,
            height,
            activityLevel
        });

        const tracking = await Tracking.create({
            user: user._id,
            userId: user._id,
            ...req.body,
            ...analysis,
            weeklyProgress: [],
        });

        const endTime = performance.now();
        res.status(201).json({
            tracking,
            processingTime: endTime - startTime
        });
    } catch (error) {
        handleError(res, error, 'Tracking Initialization Error');
    }
};

exports.updateTracking = async (req, res) => {
    const startTime = performance.now();
    try {
        const { userId, updatedWeight } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const tracking = await Tracking.findOne({ user: userId }).sort({ createdAt: -1 });
        if (!tracking) {
            return res.status(404).json({ error: 'Tracking data not found' });
        }

        // Update tracking with new weight
        tracking.currentWeight = updatedWeight;
        tracking.progressNotes.push({
            note: `Weight updated to ${updatedWeight} kg`,
            date: new Date(),
        });

        await tracking.save();

        // Recalculate weekly progress
        const weeklyProgress = await generateProgressProjection(userId);
        tracking.weeklyProgress = weeklyProgress;

        // Update recommendations dynamically
        tracking.recommendations = generateRecommendations(tracking);

        await tracking.save();

        const endTime = performance.now();
        res.status(200).json({
            tracking,
            processingTime: endTime - startTime,
        });
    } catch (error) {
        handleError(res, error, 'Tracking Update Error');
    }
};

function generateRecommendations(tracking) {
    const { weeklyProgress, currentWeight, goalWeight } = tracking;

    if (!weeklyProgress.length) {
        return {
            message: 'No progress data available to generate recommendations.',
        };
    }

    const lastProgress = weeklyProgress.slice(-1)[0];
    const weightLeft = currentWeight - goalWeight;

    return {
        bestDays: weightLeft > 5 ? ['Monday', 'Wednesday', 'Friday'] : ['Tuesday', 'Thursday'],
        sleepCorrelation: weightLeft < 2 ? 'Positive' : 'Negative',
        focusAreas: weightLeft > 5 ? 'Increase physical activity' : 'Maintain consistency',
    };
}


exports.getTracking = async (req, res) => {
    try {
        const { userId } = req.params;
        const tracking = await Tracking.findOne({ user: userId }).sort({ createdAt: -1 });

        if (!tracking) {
            return res.status(404).json({ error: 'No tracking data found' });
        }

        tracking.weeklyProgress = await generateProgressProjection(userId);
        await tracking.save();

        res.status(200).json(tracking);
    } catch (error) {
        handleError(res, error, 'Tracking Retrieval Error');
    }
};

exports.getTrackingHistory = async (req, res) => {
    try {
        const { id: userId } = req.params;

        const trackingHistory = await Tracking.find({ user: userId }).sort({ createdAt: -1 });

        if (!trackingHistory.length) {
            return res.status(404).json({ error: 'No tracking history found' });
        }

        res.status(200).json(trackingHistory);
    } catch (error) {
        handleError(res, error, 'Tracking History Retrieval Error');
    }
};

function handleError(res, error, logMessage) {
    console.error(logMessage, error);
    res.status(500).json({
        error: logMessage.replace('Error', 'failed'),
        details: error.message
    });
}

module.exports = exports;
