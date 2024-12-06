const mongoose = require('mongoose');
const trackingSchema = new mongoose.Schema({
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    currentWeight: {
      type: Number,
      required: true,
      min: [0, 'Weight cannot be negative']
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
    weeklyProgress: [
      {
        week: {
          type: Number,
          min: [0, 'Week number cannot be negative']
        },
        weight: {
          type: Number,
          min: [0, 'Weight cannot be negative']
        },
        date: {
          type: Date,
          default: Date.now
        }
      }
    ],
    recommendations: {
      bestDays: {
        type: [String],
        enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
      },
      sleepCorrelation: {
        type: String,
        enum: ['Positive', 'Negative', 'Neutral']
      },
      mealTiming: {
        type: String,
        enum: ['Optimal', 'Suboptimal', 'Needs Improvement']
      }
    },
    progressNotes: [
      {
        note: { type: String },
        date: { type: Date, default: Date.now }
      }
    ],
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
      const progressMade = Math.abs(this.currentWeight - (this.weeklyProgress[this.weeklyProgress.length - 1]?.weight || this.currentWeight));
      return Math.min((progressMade / totalWeightDifference) * 100, 100);
    }
    return 0;
  });
  
  // Pre-save middleware to update progress percentage
  trackingSchema.pre('save', function(next) {
    this.progressPercentage = this.calculateProgressPercentage;
    next();
  });
  
  // Add an index to improve query performance
  trackingSchema.index({ user: 1, createdAt: -1 });
  
  module.exports = mongoose.model('Tracking', trackingSchema);