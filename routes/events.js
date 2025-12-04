// routes/events.js
const express = require('express');
const router = express.Router();
const { Event, User } = require('../models');
const { auth, authorizeAdmin } = require('../middleware/auth');

// 1. Get All Events (Public + Upcoming + Winners)
router.get('/all', async (req, res) => {
  try {
    const events = await Event.find()
      .populate('winner', 'fullName')
      .populate('createdBy', 'fullName')
      .sort({ startDate: -1 });

    res.json({ success: true, events });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Get Live/Upcoming Events
router.get('/live', async (req, res) => {
  try {
    const now = new Date();
    const events = await Event.find({
      startDate: { $lte: now },
      endDate: { $gte: now },
      status: 'live'
    }).populate('participants', 'fullName');

    res.json({ success: true, events });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// 3. Join Event (User)
router.post('/join/:eventId', auth, async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);
    if (!event || event.status !== 'live') {
      return res.status(400).json({ success: false, message: 'Event not live' });
    }

    if (!event.participants.includes(req.user.id)) {
      event.participants.push(req.user.id);
      await event.save();
    }

    res.json({ success: true, message: 'Joined!' });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// 4. Admin: Create Event
router.post('/create', auth, authorizeAdmin, async (req, res) => {
  try {
    const { title, description, startDate, endDate, prize } = req.body;
    const event = new Event({
      title, description, startDate, endDate, prize,
      createdBy: req.user.id,
      status: new Date(startDate) > new Date() ? 'upcoming' : 'live'
    });
    await event.save();
    res.json({ success: true, event });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Admin: Announce Winner
router.post('/winner/:eventId', auth, authorizeAdmin, async (req, res) => {
  try {
    const { winnerId } = req.body;
    const event = await Event.findById(req.params.eventId);
    if (!event || !event.participants.includes(winnerId)) {
      return res.status(400).json({ success: false, message: 'Invalid winner' });
    }

    event.winner = winnerId;
    event.status = 'completed';
    await event.save();

    // Give prize points
    await User.findByIdAndUpdate(winnerId, { $inc: { points: event.prize } });

    res.json({ success: true, message: 'Winner announced!' });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// 6. Admin: Get Event Stats
router.get('/stats', auth, authorizeAdmin, async (req, res) => {
  try {
    const stats = await Event.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 }, totalPrize: { $sum: '$prize' } } }
    ]);
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

module.exports = router;