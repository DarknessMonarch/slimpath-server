const Tracking = require('../models/trackingModel');
const User = require('../models/userModel');
const { performance } = require('perf_hooks');

// Helper function to convert units
function convertUnits(value, type) {
    switch(type) {
        case 'weight':
            // If value is less than 100, assume kilograms and convert to pounds
            return value < 100 ? value * 2.20462 : value;
        case 'height':
            // If value is less than 10, assume meters and convert to feet
            return value < 10 ? value * 3.28084 : value;
        default:
            return value;
    }
}

exports.getIntelligentAnalysis = (params) => {
    const {
        currentWeight,
        goalWeight,
        durationWeeks,
        age,
        height,
        activityLevel
    } = params;

    // Convert units if necessary
    const convertedCurrentWeight = convertUnits(currentWeight, 'weight');
    const convertedGoalWeight = convertUnits(goalWeight, 'weight');
    const convertedHeight = convertUnits(height, 'height');

    validateAnalysisParams({
        ...params,
        currentWeight: convertedCurrentWeight,
        goalWeight: convertedGoalWeight,
        height: convertedHeight
    });

    const activityMultipliers = {
        sedentary: 1.2,
        lightlyActive: 1.375,
        moderatelyActive: 1.55,
        veryActive: 1.725,
        extraActive: 1.9
    };

    // Convert height to total inches
    const heightInInches = Math.round(convertedHeight * 12);

    // BMR calculation using Mifflin-St Jeor Equation for Imperial units
    const weightInKg = convertedCurrentWeight * 0.453592;
    const heightInCm = heightInInches * 2.54;
    
    // Using a neutral gender factor (assumed male formula)
    const bmr = 10 * weightInKg + 6.25 * heightInCm - 5 * age + 5;
    
    const TDEE = bmr * activityMultipliers[activityLevel];
    
    const weightDelta = convertedCurrentWeight - convertedGoalWeight;
    
    // 3500 calories per pound of fat
    const dailyDeficit = Math.max((weightDelta * 3500) / (durationWeeks * 7), 0);

    const dailyCalories = Math.round(TDEE - dailyDeficit);
    const mealDistribution = calculateOptimalMealDistribution(dailyCalories, activityLevel);

    return {
        dailyCalories,
        mealDistribution,
        progressNotes: [{
            note: `Initial tracking started. Goal: ${convertedGoalWeight.toFixed(1)} lbs over ${durationWeeks} weeks`,
            date: new Date()
        }],
        // Store original and converted values for transparency
        originalParams: {
            currentWeight,
            goalWeight,
            height
        },
        convertedParams: {
            currentWeight: convertedCurrentWeight,
            goalWeight: convertedGoalWeight,
            height: convertedHeight
        }
    };
};

function validateAnalysisParams(params) {
    const requiredParams = ['currentWeight', 'goalWeight', 'durationWeeks', 'age', 'height', 'activityLevel'];

    for (const param of requiredParams) {
        if (params[param] === undefined || params[param] === null) {
            throw new Error(`Missing required parameter: ${param}`);
        }
    }

    const validActivityLevels = ['sedentary', 'lightlyActive', 'moderatelyActive', 'veryActive', 'extraActive'];
    if (!validActivityLevels.includes(params.activityLevel)) {
        throw new Error('Invalid activity level');
    }

    // Additional validations for units
    if (params.currentWeight <= 0) {
        throw new Error('Current weight must be a positive number');
    }
    if (params.height <= 0) {
        throw new Error('Height must be a positive number');
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
        morning: {
            calories: Math.round(dailyCalories * morningFactor),
            description: 'High-protein meal to kickstart metabolism',
            recommendedMeals: ['Protein smoothie']
        },
        afternoon: {
            calories: Math.round(dailyCalories * afternoonFactor),
            description: 'Balanced meal for sustained energy',
            recommendedMeals: ['Grilled chicken salad']
        },
        night: {
            calories: Math.round(dailyCalories * nightFactor),
            description: 'Light meal to support recovery',
            recommendedMeals: ['Turkey with sweet potato']
        },
        total: dailyCalories
    };
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

            dailyCalories: analysis.dailyCalories,
            mealDistribution: analysis.mealDistribution,
            progressNotes: analysis.progressNotes,
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

        const trackingDetails = {
            userId: tracking.user,
            currentWeight: tracking.currentWeight,
            goalWeight: tracking.goalWeight,
            dailyCalories: tracking.dailyCalories,
            mealDistribution: tracking.mealDistribution,
            weeklyProgress: await generateProgressProjection(userId),
            progressPercentage: tracking.progressPercentage,
            recommendations: tracking.recommendations,
            progressNotes: tracking.progressNotes
        };

        res.status(200).json(trackingDetails);
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
    res.status(500).json({
        error: logMessage.replace('Error', 'failed'),
        details: error.message
    });
}

module.exports = exports;
