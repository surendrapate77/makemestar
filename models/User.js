const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true, 
    lowercase: true 
  },
  mobileNumber: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true 
  },
  password: { 
    type: String, 
    required: true 
  },
  fullName: { 
    type: String, 
    trim: true 
  },
  role: { 
    type: String, 
    required: true, 
    enum: ['user', 'studio', 'admin','manager','accountant'] 
  },
  studios: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Studio' 
  }],
  // Added rating fields
  averageRating: { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 },
  skills: [{ 
    type: String, 
    trim: true 
  }],
  skillsDetails: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Skill' 
  }],
  profilePicUrl: { 
    type: String, 
    default: '',     
  },
  profileVisibility: { 
    type: String, 
    enum: ['public', 'private'], 
    default: 'public' 
  },
  refreshTokens: [{ 
    type: String 
  }],
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
    default: '' 
  },
  address: { 
    type: String, 
    trim: true, 
    default: '' 
  },
  mapLocation: { 
    type: String, 
    trim: true, 
    default: '' 
  },
  freePostsUsed: { type: Number, default: 0, min: 0 },
  lastFreePostReset: { type: Date },
  freeBidsUsed: { type: Number, default: 0, min: 0 },
  lastFreeBidReset: { type: Date },
  ratings: [{
    rating: { type: Number, min: 1, max: 10, required: true },
    reviewText: { type: String, trim: true },
    reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdDate: { type: Date, default: Date.now },
  }],

  points: { type: Number, default: 0 },
totalPointsEarned: { type: Number, default: 0 },
level: { type: String, enum: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'], default: 'Bronze' },
streak: { type: Number, default: 0 },
lastActiveDate: { type: Date },
badges: [{ type: String }],
referralCode: { type: String, unique: true, sparse: true },
referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
totalEarnings: { type: Number, default: 0 },
bidsWon: { type: Number, default: 0 },
  createdDate: { 
    type: Date, 
    default: Date.now 
  },
  updatedDate: { 
    type: Date, 
    default: Date.now 
  },

});


// केवल skills पर इंडेक्स, क्योंकि email और mobileNumber पर unique: true पहले से ही इंडेक्स बनाता है
userSchema.index({ skills: 1 });

userSchema.pre('save', function (next) {
  this.updatedDate = Date.now();
  next();
});

module.exports = mongoose.model('User', userSchema);