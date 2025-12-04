const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const UserSubscription = require('../models/UserSubscription');
const Subscription = require('../models/Subscription');
const Counter = require('../models/Counter');
const { auth, authorizeAdmin } = require('../middleware/auth');
const QRCode = require('qrcode'); // Added missing import

// Helper function to get the next sequence value
async function getNextSequence(name) {
  const counter = await Counter.findOneAndUpdate(
    { name },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true }
  );
  return counter.sequence;
}

// GET /api/subscription/plans - Get all subscription plans
router.get('/plans', async (req, res) => {
  try {
    const plans = await Subscription.find().lean();
    console.log('Fetched subscription plans:', plans);
    res.status(200).json({ success: true, data: plans });
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/subscription/purchase - Purchase a subscription plan
router.post('/purchase', auth, async (req, res) => {
  try {
    const { planId } = req.body;
    const userId = req.user.id;

    // Validate planId
    if (!planId) {
      console.log('Missing planId in request');
      return res.status(400).json({ success: false, message: 'Plan ID is required' });
    }

    // Validate planId is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(planId)) {
      console.log('Invalid planId format:', planId);
      return res.status(400).json({ success: false, message: 'Invalid plan ID format' });
    }

    // Fetch plan without lean() to ensure Mongoose document
    const plan = await Subscription.findById(planId);
    if (!plan) {
      console.log('Plan not found for planId:', planId);
      return res.status(404).json({ success: false, message: 'Subscription plan not found' });
    }

    console.log('Fetched plan:', plan.toObject());

    // Validate validityMonths
    if (plan.validityMonths == null || !Number.isInteger(plan.validityMonths) || plan.validityMonths < 1) {
      console.log('Invalid validityMonths:', plan.validityMonths);
      return res.status(400).json({ success: false, message: `Invalid validity months in subscription plan: ${plan.validityMonths}` });
    }

    const validityMonths = plan.validityMonths;
    console.log('Validated validityMonths:', validityMonths);

    // Check for existing pending subscription
    const existingSubscription = await UserSubscription.findOne({
      userId,
      planId,
      paymentStatus: 'pending',
    });

    let userSubscription;
    let subscriptionId;

    if (existingSubscription) {
      // Use existing pending subscription
      userSubscription = existingSubscription;
      subscriptionId = userSubscription.subscriptionId;
    } else {
      // Generate unique subscriptionId
      subscriptionId = await getNextSequence('subscriptionId');

      // Calculate endDate based on validityMonths
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + validityMonths);
      if (isNaN(endDate.getTime())) {
        console.log('Invalid endDate calculation for validityMonths:', validityMonths);
        return res.status(500).json({ success: false, message: 'Invalid end date calculation' });
      }

      console.log('Calculated endDate:', endDate);

      // Create new user subscription
      userSubscription = new UserSubscription({
        subscriptionId,
        userId,
        planId,
        planName: plan.planName,
        planPrice: plan.price,
        planPostLimit: plan.postLimit,
        planBidLimit: plan.bidLimit,
        planValidityMonths: validityMonths,
        paymentStatus: 'pending',
        upiId: process.env.UPI_ID || 'your-upi-id@upi',
        postsUsed: 0,
        bidsUsed: 0,
        endDate,
      });
      await userSubscription.save();
      console.log('Created UserSubscription:', userSubscription.toObject());
    }

    // Generate UPI URI
    const upiId = process.env.UPI_ID || 'your-upi-id@upi';
    const note = `SubId_${subscriptionId}`;
    const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent('RecordingStudioApp')}&am=${plan.price}&cu=INR&tn=${encodeURIComponent(note)}`;
    const qrCodeBase64 = await QRCode.toDataURL(upiUri, {
      scale: 4, // Consistent with studio.js and booking.js
      margin: 2,
    });

    res.status(201).json({
      success: true,
      data: {
        userSubscription,
        upiUri,
        qrCode: qrCodeBase64,
        note, // Include note in response
      },
    });
  } catch (error) {
    console.error('Error purchasing subscription:', error);
    res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// POST /api/subscription/verify/:id - User submits transaction ID
router.post('/verify/:id', auth, async (req, res) => {
  try {
    const { transactionId } = req.body;
    const userId = req.user.id;
    const userSubscription = await UserSubscription.findOne({ _id: req.params.id, userId });
    if (!userSubscription) {
      return res.status(404).json({ success: false, message: 'User subscription not found or unauthorized' });
    }
    userSubscription.transactionId = transactionId;
    userSubscription.updatedAt = Date.now();
    await userSubscription.save();
    res.status(200).json({ success: true, data: userSubscription });
  } catch (error) {
    console.error('Error submitting transaction ID:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/subscription/admin/verify/:id - Admin verifies payment
router.post('/admin/verify/:id', auth, authorizeAdmin, async (req, res) => {
  try {
    const { paymentStatus } = req.body;
    const userSubscription = await UserSubscription.findByIdAndUpdate(
      req.params.id,
      { paymentStatus, updatedAt: Date.now() },
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

// GET /api/subscription/user - Get user's subscriptions
router.get('/user', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();

    // Update expired subscriptions
    const subscriptions = await UserSubscription.find({ userId });
    for (const sub of subscriptions) {
      if (sub.paymentStatus === 'verified' && sub.endDate < now) {
        sub.paymentStatus = 'expired';
        sub.bidsUsed = 0;
        sub.postsUsed = 0;
        await sub.save();
        console.log(`Updated subscription ${sub.subscriptionId} to expired`);
      }
    }

    // Fetch updated subscriptions
    const userSubscriptions = await UserSubscription.find({ userId })
      .populate('planId')
      .sort({ createdAt: -1 });

    if (!userSubscriptions || userSubscriptions.length === 0) {
      return res.status(404).json({ success: false, message: 'No subscriptions found' });
    }

    res.status(200).json({ success: true, data: userSubscriptions });
  } catch (error) {
    console.error('Error fetching user subscriptions:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;