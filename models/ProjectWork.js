const mongoose = require('mongoose');
const Counter = require('./Counter');

const ProjectWorkSchema = new mongoose.Schema({
  workId: {
    type: Number,
    unique: true,
    required: true,
  },
  submissionId: {
    type: Number,
    unique: true,
    required: true,
  },
  projectId: {
    type: Number,
    required: true,
    index: true,
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
  fileUrl: {
    type: String,
    required: true,
  },
  attemptNumber: {
    type: Number,
    required: true,
    default: 1,
    min: 1,
  },
  workStatus: {
    type: String,
    enum: ['pending', 'accepted', 'needs_improvement', 'welldone', 'rejected'],
    default: 'pending',
  },
  ownerComment: {
    type: String,
    trim: true,
    default: '',
  },
  disputeStatus: {
    type: String,
    enum: ['none', 'raised', 'resolved_accepted', 'resolved_rejected'],
    default: 'none',
  },
  disputeReason: {
    type: String,
    trim: true,
    default: '',
  },
  adminDecision: {
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
});

ProjectWorkSchema.pre('save', async function (next) {
  try {
    if (this.isNew) {
      const counter = await Counter.findOneAndUpdate(
        { name: 'workId' },
        { $inc: { sequence: 1 } },
        { new: true, upsert: true }
      );
      if (!counter) {
        throw new Error('Failed to generate workId: Counter not found');
      }
      this.workId = counter.sequence;

      const submissionCounter = await Counter.findOneAndUpdate(
        { name: 'submissionId' },
        { $inc: { sequence: 1 } },
        { new: true, upsert: true }
      );
      if (!submissionCounter) {
        throw new Error('Failed to generate submissionId: Counter not found');
      }
      this.submissionId = submissionCounter.sequence;
    }
    this.updatedAt = Date.now();
    next();
  } catch (error) {
    console.error('Pre-save hook error:', error);
    next(error);
  }
});

module.exports = mongoose.model('ProjectWork', ProjectWorkSchema);