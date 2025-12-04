const mongoose = require('mongoose');

const skillCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  description: { type: String, default: '', trim: true },
  fields: [{
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['string', 'number', 'url', 'array', 'dropdown'], required: true },
    required: { type: Boolean, default: false },
  }],
  vocalRangeOptions: {
    scaleNotes: [{ type: String, trim: true }],
    highestNotes: [{ type: String, trim: true }],
    lowestNotes: [{ type: String, trim: true }],
  },
  genreOptions: [{ type: String, trim: true }],
  instrumentOptions: [{ type: String, trim: true }],
});

module.exports = mongoose.model('SkillCategory', skillCategorySchema);