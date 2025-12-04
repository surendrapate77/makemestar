const mongoose = require('mongoose');
const taskSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  taskType: { type: String, enum: ['daily_login', 'watch_video', 'upload_video', 'refer_friend', 'rate_studio'], required: true },
  targetId: { type: String },
  progress: { type: Number, default: 0 },
  target: { type: Number, default: 30 },
  points: { type: Number, default: 10 },
  completed: { type: Boolean, default: false },
  completedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 24*60*60*1000) }
}, { timestamps: false });

taskSchema.index({ userId: 1, createdAt: 1 });
taskSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Task', taskSchema);