const express = require('express');
const router = express.Router();
const Subscription = require('../models/Subscription');
const { auth, authorizeAdmin } = require('../middleware/auth'); // Updated import

// POST /api/subscription/plans - Add a new subscription plan (Admin only)
router.post('/plans', auth, authorizeAdmin, async (req, res) => {
  try {
    const { planName, price, postLimit, bidLimit } = req.body;
    const subscription = new Subscription({
      planName,
      price,
      postLimit,
      bidLimit
    });
    await subscription.save();
    res.status(201).json({ success: true, data: subscription });
  } catch (error) {
    console.error('Error adding subscription plan:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/subscription/plans/:id - Edit a subscription plan (Admin only)
router.put('/plans/:id', auth, authorizeAdmin, async (req, res) => {
  try {
    const { planName, price, postLimit, bidLimit } = req.body;
    const subscription = await Subscription.findByIdAndUpdate(
      req.params.id,
      { planName, price, postLimit, bidLimit, updatedDate: Date.now() },
      { new: true, runValidators: true }
    );
    if (!subscription) {
      return res.status(404).json({ success: false, message: 'Subscription plan not found' });
    }
    res.status(200).json({ success: true, data: subscription });
  } catch (error) {
    console.error('Error updating subscription plan:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/subscription/plans - Get all subscription plans (Public)
router.get('/plans', async (req, res) => {
  try {
    const subscriptions = await Subscription.find();
    res.status(200).json({ success: true, data: subscriptions });
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;