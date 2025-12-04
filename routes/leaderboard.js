const express = require('express');
const router = express.Router();
const { User, Booking } = require('../models');
const { auth } = require('../middleware/auth');

router.get('/top-earners', auth, async (req, res) => {
  const top = await User.find({ role: 'user' }).sort({ totalEarnings: -1 }).limit(10).select('fullName totalEarnings');
  res.json({ success: true, data: top });
});

router.get('/top-studios', auth, async (req, res) => {
  const top = await Booking.aggregate([
    { $match: { status: 'completed' } },
    { $group: { _id: '$studioId', count: { $sum: 1 } } },
    { $lookup: { from: 'studios', localField: '_id', foreignField: '_id', as: 's' } },
    { $project: { studioName: { $arrayElemAt: ['$s.studioName', 0] }, count: 1 } },
    { $sort: { count: -1 } }, { $limit: 10 }
  ]);
  res.json({ success: true, data: top });
});

router.get('/top-videos', auth, async (req, res) => {
  const top = await Booking.find({ hasVideo: true }).sort({ youtubeViews: -1 }).limit(10)
    .populate('userId', 'fullName').populate('studioId', 'studioName');
  const formatted = top.map(b => ({
    videoId: b.youtubeLink?.match(/v=([^&]+)/)?.[1] || '',
    title: `${b.userId?.fullName || 'User'} @ ${b.studioId?.studioName || 'Studio'}`,
    views: b.youtubeViews
  }));
  res.json({ success: true, data: formatted });
});

module.exports = router;