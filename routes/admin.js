const express = require('express');
const router = express.Router();
const { Studio, Settings, Payment } = require('../models');
const { auth,authorizeAdmin,} = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const restrictAdmin = require('../middleware/restrictAdmin');


async function initSettings() {
  await Settings.findOneAndUpdate(
    { key: 'verificationFee' },
    { key: 'verificationFee', value: 1000, updatedDate: Date.now() },
    { upsert: true }
  );
}
// Route: POST /admin/settings/verification-fee
// Description: Admin sets the verification fee
router.post('/settings/verification-fee', auth, restrictAdmin, [
  body('fee').isNumeric().withMessage('Verification fee must be a number'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { fee } = req.body;
    await Settings.findOneAndUpdate(
      { key: 'verificationFee' },
      { key: 'verificationFee', value: fee, updatedDate: Date.now() },
      { upsert: true }
    );

    res.json({ success: true, message: 'Verification fee updated successfully', data: { fee } });
  } catch (error) {
    console.error('Set Verification Fee Error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Route: POST /admin/studio/:id/verify
// Description: Admin manually verifies the payment and sets studio as verified
router.post('/studio/:id/verify', auth, restrictAdmin, [
  body('paymentId').notEmpty().withMessage('Payment ID is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { paymentId } = req.body;
    const studio = await Studio.findById(req.params.id);
    if (!studio) {
      return res.status(404).json({ success: false, message: 'Studio not found' });
    }
    if (studio.isVerified) {
      return res.status(400).json({ success: false, message: 'Studio is already verified' });
    }

    const payment = await Payment.findById(paymentId);
    if (!payment || payment.studioId.toString() !== req.params.id || payment.type !== 'verification') {
      return res.status(404).json({ success: false, message: 'Invalid or missing payment' });
    }
    if (payment.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Payment already processed' });
    }

    payment.status = 'completed';
    await payment.save();

    studio.isVerified = true;
    studio.updatedDate = Date.now();
    await studio.save();

    res.json({
      success: true,
      message: 'Studio verified successfully',
      data: { isVerified: studio.isVerified },
    });
  } catch (error) {
    console.error('Verify Studio Error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});
router.post('/skills', auth, restrictAdmin, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Only admins can add skill categories' });
    const { name, description, fields, vocalRangeOptions, genreOptions, instrumentOptions } = req.body;
    if (!name || !fields) return res.status(400).json({ success: false, message: 'Name and fields are required' });
    const category = new SkillCategory({
      name,
      description,
      fields,
      vocalRangeOptions: vocalRangeOptions || { scaleNotes: [], highestNotes: [], lowestNotes: [] },
      genreOptions: genreOptions || [],
      instrumentOptions: instrumentOptions || [],
    });
    await category.save();
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    console.error('Error in addSkillCategory:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

// POST /api/subscription/plans - Add a new subscription plan (Admin only)
router.post('/plans', auth, isAdmin, async (req, res) => {
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
router.put('/plans/:id', auth, isAdmin, async (req, res) => {
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
// POST /api/subscription/verify/:id - Verify payment (Admin only)
router.post('/verify/:id', auth, authorizeAdmin, async (req, res) => {
  try {
    const { transactionId, paymentStatus } = req.body;
    const userSubscription = await UserSubscription.findByIdAndUpdate(
      req.params.id,
      { transactionId, paymentStatus, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );
    if (!userSubscription) {
      return res.status(404).json({ success: false, message: 'User subscription not found' });
    }
    res.status(200).json({ success: true, data: userSubscription });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;