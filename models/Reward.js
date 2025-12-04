
const mongoose = require('mongoose');
const rewardSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['discount', 'free_booking', 'cash'], required: true },
  value: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'redeemed', 'expired'], default: 'pending' },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 30*24*60*60*1000) }
});

module.exports = mongoose.model('Reward', rewardSchema);