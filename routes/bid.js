const express = require('express');
const router = express.Router();
const { Project, Bid, Counter, User, UserSubscription,ProjectPayment } = require('../models');
const { auth } = require('../middleware/auth');

// Helper function to get the next sequence value
async function getNextSequence(name) {
  const counter = await Counter.findOneAndUpdate(
    { name },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true }
  );
  return counter.sequence;
}

// Check subscription or free bid limit
async function checkBidLimit(userId) {
  // Fetch all subscriptions for the user
  const subscriptions = await UserSubscription.find({ userId });

  // Update expired subscriptions
  const now = new Date();
  for (const sub of subscriptions) {
    if (sub.paymentStatus === 'verified' && sub.endDate < now) {
      sub.paymentStatus = 'expired';
      sub.bidsUsed = 0; // Reset bidsUsed for expired subscription
      await sub.save();
      console.log(`Updated subscription ${sub.subscriptionId} to expired`);
    }
  }

  // Check active subscriptions
  const activeSubscriptions = subscriptions.filter(
    sub => sub.paymentStatus === 'verified' && sub.endDate >= now
  );

  if (activeSubscriptions.length > 0) {
    let totalBidsUsed = 0;
    let totalBidLimit = 0;
    for (const sub of activeSubscriptions) {
      totalBidsUsed += sub.bidsUsed || 0;
      totalBidLimit += sub.planBidLimit || 0;
    }

    if (totalBidsUsed >= totalBidLimit) {
      return { allowed: false, message: `Bid limit reached. ${totalBidsUsed}/${totalBidLimit} bids used. Please upgrade your subscription.` };
    }

    return { allowed: true, isFree: false };
  }

  const user = await User.findById(userId);
  if (!user) {
    return { allowed: false, message: 'User not found.' };
  }

  // Check if 3 months (90 days) have passed since last reset
  const threeMonths = 90 * 24 * 60 * 60 * 1000;
  if (user.lastFreeBidReset && (new Date() - user.lastFreeBidReset) >= threeMonths) {
    user.freeBidsUsed = 0;
    user.lastFreeBidReset = new Date();
    await user.save();
    console.log(`Reset free bids for user ${userId}`);
  }

  if (user.freeBidsUsed >= 1) {
    return { allowed: false, message: 'Free bid limit reached. Please purchase a subscription to place more bids.' };
  }

  return { allowed: true, isFree: true };
}

// POST a new bid
router.post('/', auth, async (req, res) => {
  try {
    const { projectId, amount, proposal } = req.body;
    const userId = req.user.id;

    // Validate project exists and is open
    const project = await Project.findOne({ projectId: Number(projectId), status: 'open' });
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found or not open for bidding.' });
    }

    // Check if user has already bid on this project
    const existingBid = await Bid.findOne({ projectId: Number(projectId), userId });
    if (existingBid) {
      return res.status(400).json({ 
        success: false, 
        message: 'You have already placed a bid on this project. Please update your existing bid.',
        bidId: existingBid.bidId
      });
    }

    // Check bid limit
    const bidLimit = await checkBidLimit(userId);
    if (!bidLimit.allowed) {
      return res.status(403).json({ success: false, message: bidLimit.message });
    }

    // Generate unique bidId
    const bidId = await getNextSequence('bidId');

    const bid = new Bid({
      bidId,
      projectId: Number(projectId),
      userId,
      amount,
      proposal,
      status: 'pending',
    });

    await bid.save();

    // Add bid ID to Project.bids array
    await Project.findOneAndUpdate(
      { projectId: Number(projectId) },
      { $push: { bids: bid._id } },
      { new: true }
    );

    if (bidLimit.isFree) {
      const user = await User.findById(userId);
      user.freeBidsUsed = (user.freeBidsUsed || 0) + 1;
      user.lastFreeBidReset = new Date();
      await user.save();
    } else {
      const subscription = await UserSubscription.findOne({
        userId,
        paymentStatus: 'verified',
        endDate: { $gte: new Date() },
      }).sort({ createdAt: -1 });
      if (subscription) {
        subscription.bidsUsed = (subscription.bidsUsed || 0) + 1;
        await subscription.save();
      }
    }

    res.status(201).json({ success: true, data: bid });
  } catch (error) {
    console.error('Create bid error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// PUT /api/bid/:bidId - Update an existing bid
router.put('/:bidId', auth, async (req, res) => {
  try {
    const { amount, proposal } = req.body;
    const userId = req.user.id;
    const bidId = Number(req.params.bidId);

    const bid = await Bid.findOne({ bidId, userId });
    if (!bid) {
      return res.status(404).json({ success: false, message: 'Bid not found or unauthorized' });
    }

    // Validate project is still open
    const project = await Project.findOne({ projectId: bid.projectId, status: 'open' });
    if (!project) {
      return res.status(400).json({ success: false, message: 'Project is not open for bidding' });
    }

    // Update bid
    bid.amount = amount || bid.amount;
    bid.proposal = proposal || bid.proposal;
    bid.updatedAt = Date.now();

    await bid.save();
    console.log(`Updated bid ${bidId} for user ${userId}`);

    res.status(200).json({ success: true, data: bid });
  } catch (error) {
    console.error('Update bid error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// GET /api/bid/user - Get all bids by the logged-in user
router.get('/user', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const bids = await Bid.find({ userId }).lean();

    const enrichedBids = await Promise.all(
      bids.map(async (bid) => {
        const project = await Project.findOne({ projectId: bid.projectId })
          .select('projectId projectName status')
          .lean();
        const payment = await ProjectPayment.findOne({ projectId: bid.projectId, bidderId: userId })
          .select('paymentStatus paymentId')
          .lean();
        console.log(`Bid ${bid.bidId}: projectId=${bid.projectId}, userId=${userId}, paymentStatus=${payment ? payment.paymentStatus : 'pending'}`);
        return {
          ...bid,
          projectId: project
            ? { projectId: project.projectId, projectName: project.projectName, status: project.status }
            : { projectId: bid.projectId, projectName: 'Unknown Project', status: 'Unknown' },
          paymentStatus: payment ? payment.paymentStatus : 'pending',
          paymentId: payment ? payment.paymentId : null,
        };
      })
    );

    if (!enrichedBids || enrichedBids.length === 0) {
      return res.status(404).json({ success: false, message: 'No bids found' });
    }

    console.log('Fetched user bids:', enrichedBids);
    res.status(200).json({ success: true, data: enrichedBids });
  } catch (error) {
    console.error('Fetch user bids error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

router.get('/project/:projectId', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    const project = await Project.findOne({ projectId: parseInt(projectId) });
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    if (project.userId.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized to view bids' });
    }

    const bids = await Bid.find({ projectId: parseInt(projectId) })
      .populate('userId', 'fullName')
      .lean();
    res.status(200).json({ success: true, data: bids });
  } catch (error) {
    console.error('Fetch project bids error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

module.exports = router;