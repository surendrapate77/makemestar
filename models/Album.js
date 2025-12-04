const mongoose = require('mongoose');

const photoSchema = new mongoose.Schema({
  url: { type: String, required: true },
  description: { type: String, trim: true, default: '' },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  reports: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, enum: ['nudity', 'violence', 'other'], required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});

const albumSchema = new mongoose.Schema({
  studioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Studio', required: true },
  albumName: { type: String, required: true },
  description: { type: String, trim: true, default: '' },
  photos: { type: [photoSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

albumSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

albumSchema.statics.checkAlbumLimit = async function (studioId) {
  const count = await this.countDocuments({ studioId });
  return count < 10;
};

albumSchema.methods.checkPhotoLimit = function () {
  return this.photos.length < 20;
};

module.exports = mongoose.models.Album || mongoose.model('Album', albumSchema);