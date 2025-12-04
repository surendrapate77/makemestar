const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  paymentId: {
    type: Number,
    unique: true,
    required: true,
  },
  studioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Studio', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['booking', 'verification'], required: true },
  status: { type: String, enum: ['pending', 'verified', 'completed', 'failed'], default: 'pending' },
  transactionId: { type: String, default: '', trim: true }, // Added for UPI transaction ID
  createdDate: { type: Date, default: Date.now },
  updatedDate: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Payment', paymentSchema);