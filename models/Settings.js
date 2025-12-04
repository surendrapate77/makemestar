const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  verificationFee: { type: Number, default: 1000 },
  defaultPostLimit: { type: Number, default: 5 },
  defaultBidLimit: { type: Number, default: 10 },
 
});

const Settings = mongoose.model('Settings', settingsSchema);

const initSettings = async () => {
  const settings = await Settings.findOne();
  if (!settings) {
    await new Settings({ verificationFee: 1000, defaultPostLimit: 5, defaultBidLimit: 10 }).save();
  }
};

initSettings();

module.exports = Settings;


