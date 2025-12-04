const express = require('express');
const router = express.Router();
const { PaymentTransactions } = require('../models');
const { auth } = require('../middleware/auth');

// Helper to get next sequence (if Counter use kar rahe ho)
async function getNextSequence(name) {
  const Counter = require('../models/Counter'); // Import inside if needed
  const counter = await Counter.findOneAndUpdate(
    { name },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true }
  );
  return counter.sequence;
}

// POST /api/payments/create - Create final verified payment (unified for all types)
router.post('/create', auth, async (req, res) => {
  const session = await PaymentTransactions.startSession();
  session.startTransaction();
  try {
    const { paymentType, amount, transactionId, metadata = {} } = req.body;
    const userId = req.user.id;

    // Validation
    if (!paymentType || !['studio_verification', 'studio_booking', 'subscription', 'project_advance', 'project_work', 'promotional_pack'].includes(paymentType)) {
      throw new Error('Invalid payment type');
    }
    if (!amount || amount <= 0) {
      throw new Error('Invalid amount');
    }
    if (!transactionId) {
      throw new Error('Transaction ID required');
    }

    // Check if already exists (avoid duplicates)
    const existing = await PaymentTransactions.findOne({ transactionId, userId }).session(session);
    if (existing) {
      throw new Error('Payment already processed');
    }

    const paymentId = await getNextSequence('paymentId');
    const payment = new PaymentTransactions({
      paymentId,
      userId,
      paymentType,
      amount,
      transactionId,
      metadata, // Type-specific: e.g., { studioId: '123' } for studio_verification
      status: 'verified', // Sirf final payments
    });

    await payment.save({ session });

    // Optional: User balance update ya other ops (atomic)
    // e.g., await User.findByIdAndUpdate(userId, { $inc: { balance: -amount } }, { session });

    await session.commitTransaction();
    res.status(201).json({ success: true, data: payment });
  } catch (error) {
    await session.abortTransaction();
    console.error('Payment create error:', error);
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});

// GET /api/payments/user/:userId/history - User ke account mein transactions dikhane ke liye
router.get('/user/:userId/history', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { type, limit = 10, page = 1 } = req.query;
    const skip = (page - 1) * limit;

    const query = { userId, status: 'verified' }; // Sirf final payments
    if (type) query.paymentType = type;

    const [transactions, total] = await Promise.all([
      PaymentTransactions.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .populate('userId', 'fullName email') // Optional for display
        .lean(),
      PaymentTransactions.countDocuments(query),
    ]);

    // Summary for account: e.g., total spent
    const summary = await PaymentTransactions.aggregate([
      { $match: query },
      { $group: { _id: '$paymentType', totalAmount: { $sum: '$amount' } } },
    ]);

    res.json({
      success: true,
      data: { transactions, summary, total, page: parseInt(page), limit: parseInt(limit) },
    });
  } catch (error) {
    console.error('Payment history error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/payments/:paymentId/update - Update status (e.g., from pending to verified)
router.put('/:paymentId/update', auth, async (req, res) => {
  const session = await PaymentTransactions.startSession();
  session.startTransaction();
  try {
    const { paymentId } = req.params;
    const { status, metadata } = req.body;

    const payment = await PaymentTransactions.findOne({ paymentId: parseInt(paymentId) }).session(session);
    if (!payment) {
      throw new Error('Payment not found');
    }

    payment.status = status || payment.status;
    if (metadata) payment.metadata = { ...payment.metadata, ...metadata };
    await payment.save({ session });

    // Optional: If status 'verified', user balance update
    if (payment.status === 'verified') {
      // e.g., await User.findByIdAndUpdate(payment.userId, { $inc: { credits: payment.amount } }, { session });
    }

    await session.commitTransaction();
    res.json({ success: true, data: payment });
  } catch (error) {
    await session.abortTransaction();
    console.error('Payment update error:', error);
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});

module.exports = router;