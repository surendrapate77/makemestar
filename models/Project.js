const mongoose = require('mongoose');
const Counter = require('./Counter');

const ProjectSchema = new mongoose.Schema({
  projectId: {
    type: Number,
    unique: true,
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  projectName: {
    type: String,
    required: true,
    trim: true,
  },
  skills: {
    type: [String],
    default: [],
    validate: {
      validator: function (v) {
        return v.every(skill => typeof skill === 'string' && skill.length > 0);
      },
      message: 'Skills must be non-empty strings'
    }
  },
  description: {
    type: String,
    required: true,
    trim: true,
  },
  minBudget: {
    type: Number,
    required: true,
    min: 0,
  },
  maxBudget: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: function (value) {
        return value >= this.minBudget;
      },
      message: 'maxBudget must be greater than or equal to minBudget',
    },
  },
  durationDays: {
    type: Number,
    required: true,
    min: 1,
  },
  status: {
    type: String,
    enum: ['open', 'assigned','recived_payment', 'pending_approval', 'in_progress', 'work_submitted', 'payment_released', 'completed', 'closed','rejected'],
    default: 'open',
  },
  bids: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bid',
  }],
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  workUrl: {
    type: String,
    default: null,
  },
  additionalInfo: {
    type: String,
    trim: true,
    default: '',
  },
  chatRoomId: { 
    type: String 
  }, // New field for consistent chatRoomId
  reviewStatus: {
    type: Boolean,
    default: false, // Default to false (no review submitted)
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



module.exports = mongoose.model('Project', ProjectSchema);