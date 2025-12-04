const mongoose = require('mongoose');

const skillSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  skill: { 
    type: String, 
    required: true, 
    trim: true 
  },
  experienceLevel: { 
    type: String, 
    enum: ['beginner', 'intermediate', 'advanced'], 
    default: 'beginner' 
  },
  certifications: [{
    name: { type: String, trim: true },
    issuer: { type: String, trim: true },
    date: { type: Date },
  }],
  photos: [{ 
    type: String, 
    default: '', 
    validate: { 
      validator: (v) => !v || /^https?:\/\/.+/.test(v), 
      message: 'Invalid photo URL' 
    } 
  }],
  sampleWork: [{ 
    type: String, 
    validate: { 
      validator: (v) => /^https?:\/\/.+/.test(v), 
      message: 'Invalid sample work URL' 
    } 
  }],
  charges: {
    hourlyRate: { type: Number, min: 0, default: 0 },
    projectRate: { type: Number, min: 0, default: 0 },
    description: { type: String, trim: true, default: '' },
  },
  achievements: [{ type: String, trim: true }],
  reviews: [{
    rating: { type: Number, min: 0, max: 5, required: true },
    comment: { type: String, trim: true },
    reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdDate: { type: Date, default: Date.now },
  }],
  createdDate: { 
    type: Date, 
    default: Date.now 
  },
  updatedDate: { 
    type: Date, 
    default: Date.now 
  },
});

// स्किल्स के लिए इंडेक्स जोड़ना ताकि खोज तेज हो
skillSchema.index({ userId: 1 });
skillSchema.index({ skill: 1, experienceLevel: 1 });

skillSchema.pre('save', function (next) {
  this.updatedDate = Date.now();
  next();
});

module.exports = mongoose.model('Skill', skillSchema);