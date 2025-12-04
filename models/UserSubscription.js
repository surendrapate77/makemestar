const mongoose = require('mongoose');

const userSubscriptionSchema = new mongoose.Schema({
  subscriptionId: {
    type: Number,
    unique: true,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription',
    required: true
  },
  planName: {
    type: String,
    required: true,
    enum: ['Basic', 'Pro', 'Premium']
  },
  planPrice: {
    type: Number,
    required: true,
    min: 0
  },
  planPostLimit: {
    type: Number,
    required: true,
    min: 0
  },
  planBidLimit: {
    type: Number,
    required: true,
    min: 0
  },
  planValidityMonths: {
    type: Number,
    required: true,
    min: 1
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'verified', 'failed','expired'],
    default: 'pending'
  },
  transactionId: {
    type: String,
    required: false,
    trim: true,
    default: ''
  },
  upiId: {
    type: String,
    required: false
  },
  postsUsed: {
    type: Number,
    default: 0,
    min: 0
  },
  bidsUsed: {
    type: Number,
    default: 0,
    min: 0
  },
  endDate: {
    type: Date,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

userSubscriptionSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.models.UserSubscription || mongoose.model('UserSubscription', userSubscriptionSchema);