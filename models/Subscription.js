const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  planName: { 
    type: String, 
    required: true, 
    enum: ['Basic', 'Pro', 'Premium'] 
  },
  price: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  postLimit: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  bidLimit: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  validityMonths: {
    type: Number,
    required: true,
    min: 1
  },
  updatedDate: { 
    type: Date, 
    default: Date.now 
  },
});

subscriptionSchema.pre('save', function (next) {
  this.updatedDate = Date.now();
  next();
});

// Prevent model overwrite by checking if the model is already compiled
module.exports = mongoose.models.Subscription || mongoose.model('Subscription', subscriptionSchema);