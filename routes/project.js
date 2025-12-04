const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { Project, ProjectWork, Bid, Counter, User, UserSubscription, ProjectPayment , Notification,ChatMessage } = require('../models');
const { auth,authorizeAdmin,} = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const QRCode = require('qrcode');
const { sendBidAcceptedEmail } = require('../email_service');
const { generateWorkOrder } = require('./pdf_service');
const fs = require('fs');


// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'Uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'application/zip', 'video/mp4', 'audio/mpeg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed types: PDF, ZIP, MP4, MP3'), false);
    }
  },
});

// Helper function to get the next sequence value
async function getNextSequence(name) {
  const counter = await Counter.findOneAndUpdate(
    { name },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true }
  );
  return counter.sequence;
}

// Check subscription or free post limit
async function checkPostLimit(userId) {
  // Fetch all subscriptions for the user
  const subscriptions = await UserSubscription.find({ userId });

  // Update expired subscriptions
  const now = new Date();
  for (const sub of subscriptions) {
    if (sub.paymentStatus === 'verified' && sub.endDate < now) {
      sub.paymentStatus = 'expired';
      sub.postsUsed = 0; // Reset postsUsed for expired subscription
      await sub.save();
      console.log(`Updated subscription ${sub.subscriptionId} to expired`);
    }
  }

  // Check active subscriptions
  const activeSubscriptions = subscriptions.filter(
    sub => sub.paymentStatus === 'verified' && sub.endDate >= now
  );

  if (activeSubscriptions.length > 0) {
    let totalPostsUsed = 0;
    let totalPostLimit = 0;
    for (const sub of activeSubscriptions) {
      totalPostsUsed += sub.postsUsed || 0;
      totalPostLimit += sub.planPostLimit || 0;
    }

    if (totalPostsUsed >= totalPostLimit) {
      return { allowed: false, message: `Post limit reached. ${totalPostsUsed}/${totalPostLimit} posts used. Please upgrade your subscription.` };
    }

    return { allowed: true, isFree: false };
  }

  const user = await User.findById(userId);
  if (!user) {
    return { allowed: false, message: 'User not found.' };
  }

  // Check if 3 months (90 days) have passed since last reset
  const threeMonths = 90 * 24 * 60 * 60 * 1000;
  if (user.lastFreePostReset && (new Date() - user.lastFreePostReset) >= threeMonths) {
    user.freePostsUsed = 0;
    user.lastFreePostReset = new Date();
    await user.save();
    console.log(`Reset free posts for user ${userId}`);
  }

  if (user.freePostsUsed >= 1) {
    return { allowed: false, message: 'Free post limit reached. Please purchase a subscription to post more projects.' };
  }

  return { allowed: true, isFree: true };
}


// POST a new project
router.post('/', auth, async (req, res) => {
  try {
    const { projectName, description, minBudget, maxBudget, durationDays, skills } = req.body;
    const userId = req.user.id;

    const postLimit = await checkPostLimit(userId);
    if (!postLimit.allowed) {
      return res.status(403).json({ success: false, message: postLimit.message });
    }

    const projectId = await getNextSequence('projectId');

    const project = new Project({
      projectId,
      userId,
      projectName,
      description,
      minBudget,
      maxBudget,
      durationDays,
      skills: skills || [],
      status: 'open',
      chatRoomId: `chat_${projectId}`, // Assign consistent chatRoomId
    });

    await project.save();

    if (postLimit.isFree) {
      const user = await User.findById(userId);
      user.freePostsUsed += 1;
      user.lastFreePostReset = new Date();
      await user.save();
    } else {
      const subscription = await UserSubscription.findOne({
        userId,
        paymentStatus: 'verified',
        endDate: { $gte: new Date() },
      }).sort({ createdAt: -1 });
      if (subscription) {
        subscription.postsUsed += 1;
        await subscription.save();
      }
    }

    res.status(201).json({ success: true, data: project });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// GET /api/project/chat/list - Get list of projects with chat rooms for the user
router.get('/chat/list', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch projects where user is the owner, project is assigned, and payment is verified
    const ownedPayments = await ProjectPayment.find({ projectId: { $in: (await Project.find({ userId, status: 'assigned' })).map(p => p.projectId) }, paymentStatus: 'verified' }).lean();
    const ownedProjectIds = ownedPayments.map(payment => payment.projectId);
    const ownedProjects = await Project.find({
      userId,
      status: 'assigned',
      projectId: { $in: ownedProjectIds },
    }).lean();

    // Fetch projects where user is an accepted bidder with verified payment
    const bids = await Bid.find({
      userId,
      status: 'accepted',
    }).lean();

    const projectIds = bids.map(bid => bid.projectId);
    const payments = await ProjectPayment.find({
      bidderId: userId,
      projectId: { $in: projectIds },
      paymentStatus: 'verified',
    }).lean();

    const verifiedProjectIds = payments.map(payment => payment.projectId);
    const bidProjects = await Project.find({
      projectId: { $in: verifiedProjectIds },
      status: 'assigned',
    }).lean();

    // Combine and categorize projects
    const chatList = [
      ...ownedProjects.map(project => ({
        projectId: project.projectId,
        projectName: project.projectName,
        chatRoomId: project.chatRoomId,
        category: 'Project',
      })),
      ...bidProjects.map(project => ({
        projectId: project.projectId,
        projectName: project.projectName,
        chatRoomId: project.chatRoomId,
        category: 'Bid',
      })),
    ];

    console.log(`Fetched chat list for user ${userId}, count: ${chatList.length}`);
    res.status(200).json({ success: true, data: chatList });
  } catch (error) {
    console.error('Fetch chat list error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// for get users project
router.get('/', auth, async (req, res) => {
  try {
    const projects = await Project.find({
      $or: [{ userId: req.user.id }],
    })
      .populate('userId', 'name')
      .populate('assignedTo', 'name')
      .lean();
    const formattedProjects = projects.map(project => ({
      ...project,
      userId: project.userId?._id.toString(),
      assignedTo: project.assignedTo?._id.toString(),
    }));
    res.json({ success: true, data: formattedProjects });
  } catch (error) {
    console.error('Fetch projects error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

router.put('/:projectId/info', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { additionalInfo } = req.body;
    const userId = req.user.id;

    const project = await Project.findOne({ projectId: parseInt(projectId) });
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    if (project.userId.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized to update project info' });
    }
    if (project.status !== 'open') {
      return res.status(400).json({ success: false, message: 'Cannot update info for non-open project' });
    }

    project.additionalInfo = additionalInfo || project.additionalInfo;
    await project.save();
    res.json({ success: true, data: project });
  } catch (error) {
    console.error('Update project info error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

router.post('/finalize/:projectId', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { bidId, bidAmount } = req.body;
    const userId = req.user.id;

    const project = await Project.findOne({ projectId: parseInt(projectId) });
    if (!project) {
      console.log('Project not found for projectId:', projectId);
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    if (project.userId.toString() !== userId) {
      console.log('Unauthorized to finalize bid:', { projectUserId: project.userId, userId });
      return res.status(403).json({ success: false, message: 'Unauthorized to finalize bid' });
    }
    if (project.status !== 'open') {
      console.log('Project not open for finalization:', project.status);
      return res.status(400).json({ success: false, message: 'Project is not open for bidding' });
    }

    const bid = await Bid.findOne({ bidId, projectId: parseInt(projectId) });
    if (!bid) {
      console.log('Bid not found for bidId:', bidId);
      return res.status(404).json({ success: false, message: 'Bid not found' });
    }

    project.status = 'assigned';
    project.assignedTo = bid.userId;
    await project.save();

    bid.status = 'accepted';
    await bid.save();

    const paymentId = await getNextSequence('paymentId');
    const adminCut = Math.round(bidAmount * 0.2);
    const finalAmount = Math.round(bidAmount - adminCut);
    const upiId = process.env.UPI_ID || 'default@upi';
    const note = `ProjId_${project.projectId}_PayId_${paymentId}`;
    const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=RecordingStudio&am=${bidAmount}&tn=${encodeURIComponent(note)}`;
    let qrCode;
    try {
      qrCode = await QRCode.toDataURL(upiUri);
    } catch (error) {
      console.error('QR code generation error:', error);
      return res.status(500).json({ success: false, message: 'Failed to generate QR code', error: error.message });
    }

    const payment = new ProjectPayment({
      paymentId,
      projectId: project.projectId,
      bidderId: bid.userId,
      ownerId: project.userId,
      bidAmount,
      adminCut,
      finalAmount,
      paymentStatus: 'pending',
    });
    await payment.save();

    console.log('Bid finalized and payment created:', { projectId, bidId, paymentId, upiUri });
    res.status(200).json({
      success: true,
      data: {
        project,
        payment: {
          paymentId,
          projectId: project.projectId,
          upiUri,
          qrCode,
          note,
        },
      },
    });
  } catch (error) {
    console.error('Finalize bid error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});



router.post('/:projectId/submit', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { workUrl } = req.body;
    const project = await Project.findById(projectId);
    if (!project || project.status !== 'assigned') {
      return res.status(400).json({ success: false, message: 'Invalid project status' });
    }
    if (project.assignedTo.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    project.status = 'work_submitted';
    project.workUrl = workUrl;
    await project.save();
    res.json({ success: true, data: project });
  } catch (error) {
    console.error('Submit work error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    res.json({ success: true, fileUrl });
  } catch (error) {
    console.error('Upload file error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// GET all projects except those posted by the logged-in user (for browsing)
router.get('/browse', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { skills, dateRange, minBudget, maxBudget } = req.query;

    // Build query
    const query = {
      userId: { $ne: userId },
      status: 'open',
    };

    // Filter by skills if provided
    if (skills) {
      const skillsArray = Array.isArray(skills) ? skills : skills.split(',');
      query.skills = { $in: skillsArray };
    }

    // Filter by date range if provided
    if (dateRange && dateRange !== 'all') {
      let startDate;
      const now = new Date();
      if (dateRange === 'this_week') {
        const firstDayOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
        startDate = new Date(firstDayOfWeek.setHours(0, 0, 0, 0));
      } else if (dateRange === 'last_week') {
        const lastWeek = new Date(now.setDate(now.getDate() - now.getDay() - 7));
        startDate = new Date(lastWeek.setHours(0, 0, 0, 0));
        query.createdAt = { $gte: startDate, $lte: new Date(lastWeek.setDate(lastWeek.getDate() + 6)) };
      } else if (dateRange === 'this_month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (dateRange === 'last_month') {
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        startDate = lastMonth;
        query.createdAt = { $gte: startDate, $lte: new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0) };
      }
      if (startDate && dateRange !== 'last_week' && dateRange !== 'last_month') {
        query.createdAt = { $gte: startDate };
      }
    }

    // Filter by budget range if provided
    if (minBudget) {
      query.maxBudget = { $gte: parseFloat(minBudget) };
    }
    if (maxBudget) {
      query.minBudget = { $lte: parseFloat(maxBudget) };
    }

    const projects = await Project.find(query)
      .populate('userId', 'username')
      .populate('bids')
      .sort({ createdAt: -1 })
      .lean();
    console.log('Fetched browse projects:', projects);
    res.json({ success: true, data: projects });
  } catch (error) {
    console.error('Get browse projects error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});
// Bellow QR image submit trasaction id by userafter payment
router.post('/pay/:paymentId', auth, async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { transactionId } = req.body;
    const userId = req.user.id;

    if (!transactionId) {
      return res.status(400).json({ success: false, message: 'Transaction ID is required' });
    }

    const payment = await ProjectPayment.findOne({ paymentId: parseInt(paymentId) });
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }
    if (payment.ownerId.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized to submit transaction ID' });
    }

    payment.transactionId = transactionId;
    await payment.save();

    console.log('Transaction ID submitted:', { paymentId, transactionId });
    res.status(200).json({ success: true, data: payment });
  } catch (error) {
    console.error('Submit transaction ID error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

router.get('/projectPayment/:projectId', auth, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    if (isNaN(projectId)) {
      return res.status(400).json({ success: false, message: 'Invalid project ID' });
    }
    const payment = await ProjectPayment.findOne({ projectId })
      .populate('bidderId', 'name')
      .populate('ownerId', 'name');
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found for this project' });
    }
    const upiId = process.env.UPI_ID || 'default@upi';
    const note = `ProjId_${payment.projectId}_PayId_${payment.paymentId}`;
    const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=RecordingStudio&am=${payment.bidAmount}&tn=${encodeURIComponent(note)}`;
    let qrCode;
    try {
      qrCode = await QRCode.toDataURL(upiUri);
    } catch (error) {
      console.error('QR code generation error:', error);
      return res.status(500).json({ success: false, message: 'Failed to generate QR code', error: error.message });
    }
    res.json({
      success: true,
      data: {
        ...payment.toObject(),
        upiUri,
        qrCode,
        note,
      },
    });
  } catch (error) {
    console.error('Get payment status error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});
// New route for admin to update payment status
// New route for admin to update payment status
router.post('/admin/pay/:paymentId', auth, async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { paymentStatus } = req.body;
    const userId = req.user.id;

    // Verify user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admins can update payment status' });
    }

    const payment = await ProjectPayment.findOne({ paymentId: parseInt(paymentId) });
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    // Update payment status
    payment.paymentStatus = paymentStatus;
    if (paymentStatus === 'verified') {
      // Send notification and email to bidder
      const project = await Project.findOne({ projectId: payment.projectId });
      const bidder = await User.findById(payment.bidderId);
      const notification = new Notification({
        userId: payment.bidderId,
        message: `Your bid for project "${project.projectName}" (Project ID: ${payment.projectId}) has been accepted. Payment will be released after work verification.`,
        type: 'bid_accepted',
        projectId: payment.projectId,
        read: false,
      });
      await notification.save();

      // Attempt to send email, but don't fail the request if it errors
      try {
        await sendBidAcceptedEmail(
          bidder.email,
          project.projectName,
          payment.projectId,
          payment.bidAmount
        );
      } catch (emailError) {
        console.error('Failed to send email, but continuing with response:', emailError);
        // Optionally log to a monitoring system or database
      }
    }
    await payment.save();

    console.log('Payment status updated by admin:', { paymentId, paymentStatus });
    res.status(200).json({ success: true, data: payment }); // Return updated payment
  } catch (error) {
    console.error('Update payment status error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// New route to fetch all pending payments for admin
router.get('/admin/payments', auth, async (req, res) => {
  try {
    // Verify user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admins can view pending payments' });
    }

    const payments = await ProjectPayment.find({ paymentStatus: 'pending' })
      .populate('bidderId', 'name email')
      .populate('ownerId', 'name')
      .lean();
    res.json({ success: true, data: payments }); // Return pending payments
  } catch (error) {
    console.error('Fetch pending payments error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

//  download work order shifted to projectWork.js......

// POST /api/project/chat/initiate/:projectId - Initiate chat
router.post('/chat/initiate/:projectId', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    const project = await Project.findOne({ projectId: parseInt(projectId) });
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const payment = await ProjectPayment.findOne({ projectId: parseInt(projectId) });
    if (!payment || payment.paymentStatus !== 'verified') {
      return res.status(403).json({ success: false, message: 'Payment not verified' });
    }

    // Allow project owner (userId) or assigned bidder (bidderId)
    if (project.userId.toString() !== userId && payment.bidderId.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized to initiate chat' });
    }

   // Use consistent chatRoomId from Project
    let chatRoomId = project.chatRoomId;
    if (!chatRoomId) {
      chatRoomId = `chat_${projectId}`;
      project.chatRoomId = chatRoomId;
      await project.save();
    }

    const messages = await ChatMessage.find({ projectId: parseInt(projectId) }).lean();

    console.log(`Chat initiated for project ${projectId}, chatRoomId: ${chatRoomId}`);
    res.status(200).json({ success: true, data: { chatRoomId, messages } });
  } catch (error) {
    console.error('Initiate chat error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// GET /api/project/chat/messages/:projectId - Get chat messages for a project
router.get('/chat/messages/:projectId', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 30;
    const skip = parseInt(req.query.skip) || 0;

    const project = await Project.findOne({ projectId: parseInt(projectId) });
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const bid = await Bid.findOne({ projectId: parseInt(projectId), userId });
    const payment = await ProjectPayment.findOne({ projectId: parseInt(projectId), bidderId: userId });
    const isOwner = project.userId.toString() === userId;
    const isBidder = bid && bid.status === 'accepted' && payment && payment.paymentStatus === 'verified';

    if (!isOwner && !isBidder) {
      return res.status(403).json({ success: false, message: 'Unauthorized to view chat messages' });
    }

    const messages = await ChatMessage.find({ projectId: parseInt(projectId) })
      .sort({ createdAt: -1 }) // Latest messages first
      .skip(skip)
      .limit(limit)
      .lean();
    console.log(`Fetched ${messages.length} messages for project ${projectId}, skip: ${skip}, limit: ${limit}`);
    res.status(200).json({ success: true, data: messages });
  } catch (error) {
    console.error('Fetch chat messages error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

//get upi id from env
router.get('/config/upi', auth, async (req, res) => {
  try {
    const upiId = process.env.UPI_ID || 'default@upi';
    res.json({ success: true, upiId });
  } catch (error) {
    console.error('Get UPI ID error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});
// for users notification
router.get('/notifications', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const notifications = await Notification.find({ userId }).sort({ createdAt: -1 });
    res.json({ success: true, data: notifications });
  } catch (error) {
    console.error('Fetch notifications error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});



module.exports = router;