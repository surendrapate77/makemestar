const mongoose = require('mongoose');
const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  prize: { type: Number, default: 0 },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['upcoming', 'live', 'completed'], default: 'upcoming' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Event', eventSchema);