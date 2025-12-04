const mongoose = require('mongoose');

const studioSchema = new mongoose.Schema({
  studioName: { 
    type: String, 
    required: true, 
    trim: true, 
    minlength: 3, 
    maxlength: 100 
  },
  // Add rating fields
  averageRating: { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 },
  albumsDisabled: { type: Boolean, default: false },
  city: { 
    type: String, 
    trim: true, 
    default: '' 
  },
  location: { 
    type: String, 
    trim: true, 
    default: '' 
  },
  contactNumber: { 
    type: String, 
    trim: true, 
    default: '', 
    validate: { 
      validator: (v) => !v || /^\d{10}$/.test(v), 
      message: 'Invalid contact number' 
    } 
  },
  address: { 
    type: String, 
    trim: true, 
    default: '' 
  },
  rating: { 
    type: Number, 
    default: 0.0, 
    min: 0, 
    max: 5 
  },
  extra1: { 
    type: String, 
    trim: true, 
    default: '' 
  },
  extra2: { 
    type: String, 
    trim: true, 
    default: '' 
  },
  extra3: { 
    type: String, 
    trim: true, 
    default: '' 
  },
  isVerified: { 
    type: Boolean, 
    default: false 
  },
  verificationFee: { type: Number, default: 1000 },
  profilePicUrl: { 
    type: String, 
    default: '',
  },
  mapLocation: { 
    type: String, 
    trim: true, 
    default: '' 
  },
  youtubeLink1: { 
    type: String, 
    default: '', 
    validate: { 
      validator: (v) => !v || /^https?:\/\/.+/.test(v), 
      message: 'Invalid YouTube link 1' 
    } 
  },
  youtubeLink2: { 
    type: String, 
    default: '', 
    validate: { 
      validator: (v) => !v || /^https?:\/\/.+/.test(v), 
      message: 'Invalid YouTube link 2' 
    } 
  },
  youtubeLink3: { 
    type: String, 
    default: '', 
    validate: { 
      validator: (v) => !v || /^https?:\/\/.+/.test(v), 
      message: 'Invalid YouTube link 3' 
    } 
  },
  recordingPlans: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Plan' 
  }],
  albums: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Album' 
  }],
  createdDate: { 
    type: Date, 
    default: Date.now 
  },
  updatedDate: { 
    type: Date, 
    default: Date.now 
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
});

studioSchema.pre('save', function (next) {
  this.updatedDate = Date.now();
  next();
});

module.exports = mongoose.models.Studio || mongoose.model('Studio', studioSchema);