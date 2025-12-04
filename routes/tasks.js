const express = require('express');
const router = express.Router();
const { Task, User, Booking, Reward } = require('../models');
const { auth } = require('../middleware/auth');

router.get('/daily', auth, async (req, res) => {
  const today = new Date().setHours(0,0,0,0);
  let tasks = await Task.find({ userId: req.user.id, createdAt: { $gte: today } });

  if (tasks.length === 0) {
    tasks = await Task.insertMany([
      { userId: req.user.id, taskType: 'daily_login', points: 5, target: 1 },
      { userId: req.user.id, taskType: 'watch_video', points: 10, target: 30 },
      { userId: req.user.id, taskType: 'rate_studio', points: 20, target: 1 }
    ]);
  }

  const user = await User.findById(req.user.id).select('points');
  res.json({ success: true, tasks, points: user.points });
});

router.post('/watch', auth, async (req, res) => {
  const { bookingId, seconds } = req.body;
  const task = await Task.findOneAndUpdate(
    { userId: req.user.id, taskType: 'watch_video', targetId: bookingId, completed: false },
    { $inc: { progress: seconds } },
    { new: true }
  );

  if (task && task.progress >= task.target) {
    task.completed = true; task.completedAt = new Date(); await task.save();
    await User.findByIdAndUpdate(req.user.id, { $inc: { points: task.points } });
  }

  await Booking.findOneAndUpdate(
    { bookingId: parseInt(bookingId) },
    { $inc: { youtubeViews: seconds, taskViews: seconds } }
  );

  res.json({ success: true });
});

router.post('/redeem', auth, async (req, res) => {
  const { value } = req.body;
  const user = await User.findById(req.user.id);
  if (user.points < value) return res.status(400).json({ success: false, message: 'Low points' });

  await User.findByIdAndUpdate(req.user.id, { $inc: { points: -value } });
  await Reward.create({ userId: req.user.id, type: 'discount', value, status: 'redeemed' });

  res.json({ success: true });
});

module.exports = router;