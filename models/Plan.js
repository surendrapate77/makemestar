const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
  planName: { 
    type: String, 
    required: true, 
    trim: true, 
    minlength: 3, 
    maxlength: 50 
  },
  price: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  duration: { 
    type: Number, 
    required: true, 
    min: 0.5 
  }, // Duration in hours
  description: { 
    type: String, 
    trim: true, 
    default: '', 
    maxlength: 500 
  },
  instruments: [{ 
    type: String, 
    trim: true, 
  
  }],
  features: [{ 
    type: String, 
    trim: true 
  }],
  studioId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Studio', 
    required: true 
  },
  createdDate: { 
    type: Date, 
    default: Date.now 
  },
  updatedDate: { 
    type: Date, 
    default: Date.now 
  },
});

planSchema.pre('save', function (next) {
  this.updatedDate = Date.now();
  next();
});

module.exports = mongoose.model('Plan', planSchema);