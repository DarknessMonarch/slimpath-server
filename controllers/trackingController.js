const Tracking = require('../models/trackingModel');
const User = require('../models/userModel');
const { performance } = require('perf_hooks');

function convertUnits(value, type) {
    switch (type) {
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
    const requiredParams = ['currentWeight', 'goalWeight', 'durationWeeks', 'height', 'activityLevel'];

    for (const param of requiredParams) {
        if (params[param] === undefined || params[param] === null) {
            throw new Error(`Missing required parameter: ${param}`);
        }
    }

    const validActivityLevels = ['sedentary', 'lightlyActive', 'moderatelyActive', 'veryActive', 'extraActive'];
    if (!validActivityLevels.includes(params.activityLevel)) {
        throw new Error('Invalid activity level');
    }

    if (params.currentWeight <= 0) {
        throw new Error('Current weight must be a positive number');
    }
    if (params.height <= 0) {
        throw new Error('Height must be a positive number');
    }
}

function calculateOptimalMealDistribution(dailyCalories, activityLevel, isUpdate = false) {
    const distributionFactors = {
        sedentary: [0.25, 0.35, 0.4],
        lightlyActive: [0.3, 0.4, 0.3],
        moderatelyActive: [0.35, 0.4, 0.25],
        veryActive: [0.4, 0.35, 0.25],
        extraActive: [0.4, 0.3, 0.3]
    };

    const [morningFactor, afternoonFactor, nightFactor] = distributionFactors[activityLevel];
    
    const adjustedMorningFactor = isUpdate ? Math.min(morningFactor, 0.25) : morningFactor;

    return {
        morning: {
            calories: Math.round(dailyCalories * adjustedMorningFactor),
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
            height: height,
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

function detectProgressPatterns(weeklyProgress) {
    if (!weeklyProgress || weeklyProgress.length < 3) {
        return {
            overallTrend: 'Insufficient data',
            patternType: 'N/A',
            consistencyScore: 0
        };
    }

    const weights = weeklyProgress.map(week => week.currentWeight);

    const weightChanges = weights.slice(1).map((weight, index) => weight - weights[index]);

    const trendDirection = weightChanges.reduce((acc, change) => {
        if (change > 0) acc.positive++;
        else if (change < 0) acc.negative++;
        else acc.neutral++;
        return acc;
    }, { positive: 0, negative: 0, neutral: 0 });

    const averageChange = weightChanges.reduce((a, b) => a + b, 0) / weightChanges.length;
    const consistencyScore = calculateConsistencyScore(weightChanges, averageChange);

    let patternType = 'Inconsistent';
    if (trendDirection.positive > trendDirection.negative && trendDirection.positive > trendDirection.neutral) {
        patternType = 'Gradual Gain';
    } else if (trendDirection.negative > trendDirection.positive && trendDirection.negative > trendDirection.neutral) {
        patternType = 'Steady Decline';
    } else if (trendDirection.neutral > trendDirection.positive && trendDirection.neutral > trendDirection.negative) {
        patternType = 'Stable';
    }

    const volatility = calculateVolatility(weightChanges);

    return {
        overallTrend: patternType,
        patternType,
        consistencyScore,
        volatility,
        averageWeeklyChange: averageChange,
        trendDetails: {
            positiveChanges: trendDirection.positive,
            negativeChanges: trendDirection.negative,
            neutralChanges: trendDirection.neutral
        }
    };
}

function calculateConsistencyScore(changes, averageChange) {
    const deviations = changes.map(change => Math.abs(change - averageChange));
    const averageDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;

    const consistencyScore = Math.max(0, 100 - (averageDeviation * 20));

    return Math.round(consistencyScore);
}

function calculateVolatility(changes) {
    if (changes.length < 2) return 0;

    const mean = changes.reduce((a, b) => a + b, 0) / changes.length;
    const variance = changes.reduce((acc, change) => acc + Math.pow(change - mean, 2), 0) / changes.length;
    const standardDeviation = Math.sqrt(variance);

    const volatilityScore = Math.min(100, standardDeviation * 10);

    return Math.round(volatilityScore);
}

async function generateProgressProjection(userId, trackingData, lastUpdateDate) {
    if (!trackingData) {
        const tracking = await Tracking.findOne({ user: userId })
            .select('currentWeight goalWeight durationWeeks age height activityLevel createdAt')
            .sort({ createdAt: -1 });
            
        if (!tracking) return [];
        trackingData = tracking;
    }

    const startDate = lastUpdateDate || trackingData.createdAt;
    const currentDate = new Date();
    const daysSinceStart = Math.floor((currentDate - startDate) / (1000 * 60 * 60 * 24));
    const currentWeek = Math.floor(daysSinceStart / 7) + 1;

    if (currentWeek > trackingData.durationWeeks) {
        return [];
    }

    const weightDelta = trackingData.currentWeight - trackingData.goalWeight;
    const weeklyWeightLoss = weightDelta / trackingData.durationWeeks;

    return [{
        week: currentWeek,
        currentWeight: trackingData.currentWeight,
        predictedDate: new Date(startDate.getTime() + (currentWeek * 7 * 24 * 60 * 60 * 1000)),
        dailyCalories: trackingData.dailyCalories,
        calorieAdjustment: calculateCalorieAdjustment(currentWeek, weightDelta, trackingData.durationWeeks)
    }];
}

function generateChartData(tracking) {
    const { weeklyProgress, progressNotes } = tracking;
    
    const weightChartData = progressNotes.map(note => ({
        date: note.date,
        weight: parseFloat(note.note.match(/\d+(\.\d+)?/)[0]),
        isActual: true
    }));

    const calorieChartData = {
        labels: ['Morning', 'Afternoon', 'Night'],
        data: [
            tracking.mealDistribution.morning.calories,
            tracking.mealDistribution.afternoon.calories,
            tracking.mealDistribution.night.calories
        ]
    };

    const trendChartData = weeklyProgress.map(week => ({
        week: week.week,
        actual: week.currentWeight,
        predicted: tracking.goalWeight + ((tracking.currentWeight - tracking.goalWeight) * 
            (1 - week.week / tracking.durationWeeks))
    }));

    return {
        weightProgress: weightChartData,
        calorieDistribution: calorieChartData,
        progressTrend: trendChartData
    };
}


function calculateCalorieAdjustment(currentWeek, totalWeightLoss, totalWeeks) {
    const progressPercentage = (currentWeek / totalWeeks) * 100;

    if (progressPercentage < 25) {
        return 50;
    } else if (progressPercentage < 50) {
        return 25;
    } else if (progressPercentage < 75) {
        return -25;
    } else {
        return -50;
    }
}

exports.updateTracking = async (req, res) => {
    const startTime = performance.now();
    try {
        const { userId, updatedWeight } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const tracking = await Tracking.findOne({ user: userId })
            .select('currentWeight goalWeight durationWeeks age height activityLevel dailyCalories mealDistribution progressNotes weeklyProgress recommendations progressPatterns createdAt')
            .sort({ createdAt: -1 });
            
        if (!tracking) {
            return res.status(404).json({ error: 'Tracking data not found' });
        }

        const height = tracking.height || user.height || req.body.height;

        if (!user.height && !req.body.height && !tracking.height) {
            return res.status(400).json({ error: 'User height data is missing in profile' });
        }

        const trackingData = {
            currentWeight: updatedWeight,
            goalWeight: tracking.goalWeight,
            durationWeeks: tracking.durationWeeks,
            age: tracking.age || user.age,
            height: height,
            activityLevel: tracking.activityLevel || user.activityLevel
        };

        tracking.currentWeight = updatedWeight;
        tracking.progressNotes.push({
            note: `Weight updated to ${updatedWeight} ${tracking.currentWeight < 100 ? 'kg' : 'lbs'}`,
            date: new Date(),
        });

        const analysis = exports.getIntelligentAnalysis(trackingData);
        
        tracking.dailyCalories = analysis.dailyCalories;
        tracking.mealDistribution = calculateOptimalMealDistribution(analysis.dailyCalories, trackingData.activityLevel, true);
        tracking.weeklyProgress = await generateProgressProjection(userId, trackingData, tracking.createdAt);
        tracking.recommendations = generateRecommendations(tracking);
        tracking.progressPatterns = detectProgressPatterns(tracking.weeklyProgress);
        tracking.chartData = generateChartData(tracking);

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

        const weeklyProgress = await generateProgressProjection(userId, tracking, tracking.createdAt);

        const trackingDetails = {
            userId: tracking.user,
            currentWeight: tracking.currentWeight,
            goalWeight: tracking.goalWeight,
            dailyCalories: tracking.dailyCalories,
            mealDistribution: tracking.mealDistribution,
            weeklyProgress,
            progressPercentage: tracking.progressPercentage,
            recommendations: tracking.recommendations,
            progressNotes: tracking.progressNotes,
            progressPatterns: detectProgressPatterns(weeklyProgress),
            chartData: generateChartData(tracking)
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


exports.getAllTracking = async (req, res) => {
    const startTime = performance.now();
    try {
        const { userId } = req.params;

        // Find user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get latest tracking data
        const tracking = await Tracking.findOne({ user: userId })
            .select('-__v')
            .sort({ createdAt: -1 });

        if (!tracking) {
            return res.status(404).json({ error: 'No tracking data found' });
        }
     

        const weeklyProgress = await generateProgressProjection(userId, tracking, tracking.createdAt);
        const progressPatterns = detectProgressPatterns(weeklyProgress);
        const chartData = generateChartData(tracking);
        const recommendations = generateRecommendations(tracking);
        const adherenceMetrics = calculateAdherenceMetrics(tracking, weeklyProgress);

        const standardizedTracking = {
            tracking: {
                user: tracking.user,
                userId: tracking.user,
                currentWeight: tracking.currentWeight,
                age: tracking.age,
                height: tracking.height,
                activityLevel: tracking.activityLevel,
                goalWeight: tracking.goalWeight,
                durationWeeks: tracking.durationWeeks,
                dailyCalories: tracking.dailyCalories,
                mealDistribution: tracking.mealDistribution,
                weeklyProgress: weeklyProgress,
                recommendations: recommendations,
                progressNotes: tracking.progressNotes,
                progressPatterns: progressPatterns,
                adherenceMetrics: adherenceMetrics,
                chartData: chartData,
                _id: tracking._id,
                createdAt: tracking.createdAt,
                updatedAt: tracking.updatedAt,
                __v: tracking.__v,
                id: tracking._id
            },
            processingTime: performance.now() - startTime
        };

        res.status(200).json(standardizedTracking);
    } catch (error) {
        handleError(res, error, 'All Tracking Retrieval Error');
    }
};
function calculateWeightChanges(trackingHistory) {
    if (trackingHistory.length < 2) {
        return {
            totalChange: 0,
            averageWeeklyChange: 0,
            fastestChange: 0,
            slowestChange: 0
        };
    }

    const changes = [];
    for (let i = 1; i < trackingHistory.length; i++) {
        const weeklyChange = trackingHistory[i-1].currentWeight - trackingHistory[i].currentWeight;
        const daysDiff = (new Date(trackingHistory[i-1].createdAt) - new Date(trackingHistory[i].createdAt)) / (1000 * 60 * 60 * 24);
        const weeklyRate = (weeklyChange / daysDiff) * 7;
        changes.push(weeklyRate);
    }

    return {
        totalChange: trackingHistory[0].currentWeight - trackingHistory[trackingHistory.length - 1].currentWeight,
        averageWeeklyChange: changes.reduce((a, b) => a + b, 0) / changes.length,
        fastestChange: Math.max(...changes),
        slowestChange: Math.min(...changes)
    };
}

function calculateAdherenceMetrics(tracking, weeklyProgress) {
    const goalWeight = tracking.goalWeight;
    const initialWeight = tracking.currentWeight;
    const expectedWeeklyChange = (initialWeight - goalWeight) / tracking.durationWeeks;
    
    const adherenceScores = weeklyProgress.map(week => {
        const expectedWeight = initialWeight - (expectedWeeklyChange * week.week);
        const actualWeight = week.currentWeight;
        const difference = Math.abs(expectedWeight - actualWeight);
        return Math.max(0, 100 - (difference * 10));
    });

    return {
        overallAdherence: Math.round(adherenceScores.reduce((a, b) => a + b, 0) / adherenceScores.length),
        weeklyAdherence: adherenceScores,
        streak: calculateStreak(adherenceScores),
        consistencyScore: calculateConsistencyScore(weeklyProgress.map(w => w.currentWeight), 
            weeklyProgress.length > 0 ? weeklyProgress[0].currentWeight : initialWeight)
    };
}

function calculateStreak(adherenceScores) {
    let currentStreak = 0;
    let bestStreak = 0;

    for (const score of adherenceScores) {
        if (score >= 80) {
            currentStreak++;
            bestStreak = Math.max(bestStreak, currentStreak);
        } else {
            currentStreak = 0;
        }
    }

    return {
        current: currentStreak,
        best: bestStreak
    };
}

module.exports = exports;
