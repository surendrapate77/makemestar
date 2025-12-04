const mongoose = require('mongoose');
const Counter = require('./Counter'); // Agar unique paymentId generate karna hai

const PaymentTransactionsSchema = new mongoose.Schema({
  paymentId: {
    type: Number,
    unique: true,
    required: true, // Auto-generate using Counter
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true, // Fast user-wise queries for account history
  },
  paymentType: {
    type: String,
    enum: [
      'studio_verification',  // Studio verification payment
      'studio_booking',       // Studio booking payment
      'subscription',         // Subscription payment
      'project_advance',      // Project advance payment
      'project_work',         // Project work payment
      'promotional_pack'      // Promotional pack payments
    ],
    required: true,
    index: true, // Filter by type
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  currency: {
    type: String,
    default: 'INR', // Assume INR, change if needed
  },
  status: {
    type: String,
    enum: ['pending', 'verified', 'failed', 'refunded'],
    default: 'pending',
    index: true,
  },
  transactionId: {
    type: String, // External gateway ID (e.g., Razorpay/Paytm transaction ID)
    required: true,
    unique: true,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed, // Flexible object for type-specific data
    default: {},
  }, // e.g., { studioId: '...', bookingId: '...', subscriptionPlan: 'basic', projectId: '...', etc. }
  notes: {
    type: String,
    trim: true,
    default: '',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  verifiedAt: {
    type: Date, // When status becomes 'verified'
  },
});

// Pre-save hook for auto-generating paymentId
PaymentTransactionsSchema.pre('save', async function (next) {
  if (this.isNew) {
    const counter = await Counter.findOneAndUpdate(
      { name: 'paymentId' },
      { $inc: { sequence: 1 } },
      { new: true, upsert: true }
    );
    this.paymentId = counter.sequence;
  }
  this.updatedAt = Date.now();
  if (this.isModified('status') && this.status === 'verified') {
    this.verifiedAt = new Date();
  }
  next();
});

// Indexes for performance
PaymentTransactionsSchema.index({ userId: 1, paymentType: 1 });
PaymentTransactionsSchema.index({ status: 1, createdAt: -1 }); // Recent verified transactions

module.exports = mongoose.model('PaymentTransactions', PaymentTransactionsSchema);