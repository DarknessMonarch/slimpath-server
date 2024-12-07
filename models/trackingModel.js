const mongoose = require('mongoose');

const trackingSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    currentWeight: {
        type: Number,
        required: true,
        min: [0, 'Weight cannot be negative']
    },
    age: {
        type: Number,
        required: true,
        min: [0, 'Age cannot be negative']
    },
    height: {
        type: Number,
        required: true,
        min: [0, 'Height cannot be negative']
    },
    activityLevel: {
        type: String,
        required: true,
        enum: ['sedentary', 'lightlyActive', 'moderatelyActive', 'veryActive', 'extraActive']
    },
    goalWeight: {
        type: Number,
        required: true,
        min: [0, 'Goal weight cannot be negative']
    },
    durationWeeks: {
        type: Number,
        required: true,
        min: [1, 'Duration must be at least 1 week']
    },
    dailyCalories: {
        type: Number,
        min: [0, 'Calories cannot be negative']
    },
    mealDistribution: {
        morning: {
            calories: Number,
            description: String,
            recommendedMeals: [String]
        },
        afternoon: {
            calories: Number,
            description: String,
            recommendedMeals: [String]
        },
        night: {
            calories: Number,
            description: String,
            recommendedMeals: [String]
        },
        total: Number
    },
    weeklyProgress: [{
        week: {
            type: Number,
            min: [0, 'Week number cannot be negative']
        },
        currentWeight: {
            type: Number,
            min: [0, 'Weight cannot be negative']
        },
        predictedDate: {
            type: Date
        },
        dailyCalories: Number,
        calorieAdjustment: Number
    }],
    recommendations: {
        bestDays: {
            type: [String],
            enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        },
        sleepCorrelation: {
            type: String,
            enum: ['Positive', 'Negative', 'Neutral']
        },
        focusAreas: String
    },
    progressNotes: [{
        note: { type: String },
        date: { type: Date, default: Date.now }
    }],
    progressPatterns: {
        overallTrend: String,
        patternType: String,
        consistencyScore: Number,
        volatility: Number,
        averageWeeklyChange: Number,
        trendDetails: {
            positiveChanges: Number,
            negativeChanges: Number,
            neutralChanges: Number
        }
    },
    chartData: {
        weightProgress: [{
            date: Date,
            weight: Number,
            isActual: Boolean
        }],
        calorieDistribution: {
            labels: [String],
            data: [Number]
        },
        progressTrend: [{
            week: Number,
            actual: Number,
            predicted: Number
        }]
    },
    progressPercentage: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual to calculate progress percentage
trackingSchema.virtual('calculateProgressPercentage').get(function() {
    if (this.currentWeight && this.goalWeight) {
        const totalWeightDifference = Math.abs(this.currentWeight - this.goalWeight);
        const progressMade = Math.abs(this.currentWeight - (this.weeklyProgress[this.weeklyProgress.length - 1]?.currentWeight || this.currentWeight));
        return Math.min((progressMade / totalWeightDifference) * 100, 100);
    }
    return 0;
});

// Pre-save middleware to update progress percentage
trackingSchema.pre('save', function(next) {
    this.progressPercentage = this.calculateProgressPercentage;
    next();
});

// Add indexes to improve query performance
trackingSchema.index({ user: 1, createdAt: -1 });
trackingSchema.index({ userId: 1 });

module.exports = mongoose.model('Tracking', trackingSchema);