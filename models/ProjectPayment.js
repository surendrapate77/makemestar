const mongoose = require('mongoose');

const ProjectPaymentSchema = new mongoose.Schema({
  paymentId: {
    type: Number,
    required: true,
    unique: true,
  },
  projectId: {
    type: Number,
    required: true,
  },
  bidderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  bidAmount: {
    type: Number,
    required: true,
  },
  adminCut: {
    type: Number,
    required: true,
  },
  finalAmount: {
    type: Number,
    required: true,
  },
  
  paymentStatus: {
    type: String,
    enum: ['pending', 'verified', 'released'],
    default: 'pending',
  },
  transactionId: {
    type: String,
  },
  verifiedAt: { type: Date },

  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

ProjectPaymentSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  if (this.isModified('paymentStatus') && this.paymentStatus === 'verified') {
    this.verifiedAt = Date.now();
  }
  next();
});

module.exports = mongoose.model('ProjectPayment', ProjectPaymentSchema);