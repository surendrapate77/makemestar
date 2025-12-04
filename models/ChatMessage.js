const mongoose = require('mongoose');

const ChatMessageSchema = new mongoose.Schema({
  projectId: { type: Number, required: true },
  chatRoomId: { type: String, required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true, trim: true, maxlength: 1000 },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('ChatMessage', ChatMessageSchema);