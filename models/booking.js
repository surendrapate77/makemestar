const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  bookingId: { 
    type: Number, 
    unique: true, 
    required: true 
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  studioId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Studio', 
    required: true 
  },
  city: { 
    type: String, 
    required: true, 
    trim: true 
  },
  plan: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Plan', 
    required: true 
  },
  planDetails: { // Snapshot of plan at booking time
    planName: { type: String, required: true },
    price: { type: Number, required: true },
    duration: { type: Number, required: true },
    description: { type: String, default: '' },
    instruments: [{ type: String }],
    features: [{ type: String }],
  },
  recordingDate: { 
    type: Date, 
    required: true 
  },
  paymentStatus: { 
    type: String, 
    enum: ['pending', 'verified', 'completed', 'failed'], 
    default: 'pending' 
  },
  transactionId: { 
    type: String, 
    default: '', 
    trim: true 
  },
  specialRequest: { 
    type: String, 
    default: '', 
    trim: true 
  },
statusbyStudio: { 
    type: String, 
    enum: ['pending', 'confirmed', 'completed'], 
    default: 'pending' 
  },
  status: { 
    type: String, 
    enum: ['pending', 'confirmed', 'completed', 'disputed'], 
    default: 'pending' 
  },
  disputeStatus: {
    type: String,
    enum: ['none', 'raised', 'resolved', 'rejected'],
    default: 'none'
  },
  disputeDetails: {
    raisedBy: { type: String }, // 'user' or 'studio'
    reason: { type: String },
    raisedDate: { type: Date },
    resolvedBy: { type: String }, // 'admin'
    resolution: { type: String },
    resolvedDate: { type: Date }
  },
youtubeLink: { type: String },
youtubeUploadedAt: { type: Date },
youtubeViews: { type: Number, default: 0 },
hasVideo: { type: Boolean, default: false },
  createdDate: { 
    type: Date, 
    default: Date.now 
  },
});

module.exports = mongoose.model('Booking', bookingSchema);