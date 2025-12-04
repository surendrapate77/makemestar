const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const { Review, User, Studio, Project, Booking } = require('../models');

const router = express.Router();

// Submit a review
router.post(
  '/review',
  auth,
  [
    body('targetId').notEmpty().withMessage('Target ID is required'),
    body('targetType').isIn(['user', 'studio']).withMessage('Target type must be user or studio'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('reviewText').optional().isLength({ max: 1000 }).withMessage('Review text must not exceed 1000 characters'),
    body('projectId').optional().isInt().withMessage('Invalid project ID'),
    body('bookingId').optional().isInt().withMessage('Invalid booking ID'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('Validation errors:', errors.array());
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    try {
      const { targetId, targetType, projectId, bookingId, rating, reviewText } = req.body;
      const reviewerId = req.user.id;

      if (req.user.role !== 'user') {
        console.error('Invalid role for review:', req.user.role);
        return res.status(403).json({ success: false, message: 'Only users can submit reviews' });
      }

      // Check for existing review
      if (projectId) {
        const existingReview = await Review.findOne({ projectId: parseInt(projectId), userId: reviewerId });
        if (existingReview) {
          console.error('Existing review found for project:', { projectId, reviewerId });
          return res.status(400).json({ success: false, message: 'You have already submitted a review for this project' });
        }

        const project = await Project.findOne({ projectId: parseInt(projectId) });
        if (!project || project.status !== 'completed') {
          console.error('Invalid project status:', { projectId, status: project?.status });
          return res.status(400).json({ success: false, message: 'Invalid project status for review' });
        }
        if (project.userId.toString() !== req.user.id || project.assignedTo.toString() !== targetId) {
          console.error('Unauthorized project review:', { userId: req.user.id, projectUserId: project.userId, targetId });
          return res.status(403).json({ success: false, message: 'Unauthorized to review this project' });
        }
      }

      if (bookingId) {
        const existingReview = await Review.findOne({ bookingId: parseInt(bookingId), userId: reviewerId });
        if (existingReview) {
          console.error('Existing review found for booking:', { bookingId, reviewerId });
          return res.status(400).json({ success: false, message: 'You have already submitted a review for this booking' });
        }

        const booking = await Booking.findOne({ bookingId: parseInt(bookingId) })
          .populate('studioId', 'studioName userId')
          .populate('userId', 'fullName');
        if (!booking || booking.status !== 'completed' || booking.statusbyStudio !== 'completed') {
          console.error('Invalid booking status:', { bookingId, status: booking?.status, statusbyStudio: booking?.statusbyStudio });
          return res.status(400).json({ success: false, message: 'Booking must be completed to submit a review' });
        }
        if (booking.disputeStatus !== 'none') {
          console.error('Booking has dispute:', { bookingId, disputeStatus: booking.disputeStatus });
          return res.status(400).json({ success: false, message: 'Cannot submit review for disputed booking' });
        }
        if (booking.userId._id.toString() !== req.user.id || booking.studioId._id.toString() !== targetId) {
          console.error('Unauthorized booking review:', { userId: req.user.id, bookingUserId: booking.userId._id, targetId });
          return res.status(403).json({ success: false, message: 'Unauthorized to review this booking' });
        }
      }

      const review = new Review({
        userId: reviewerId,
        targetId,
        targetType,
        projectId: projectId ? parseInt(projectId) : undefined,
        bookingId: bookingId ? parseInt(bookingId) : undefined,
        rating,
        reviewText: reviewText || '',
        createdAt: new Date(),
      });
      await review.save();

      // Update target averageRating and reviewCount
      const targetModel = targetType === 'user' ? User : Studio;
      const target = await targetModel.findById(targetId);
      if (!target) {
        console.error(`${targetType} not found:`, { targetId });
        return res.status(404).json({ success: false, message: `${targetType} not found` });
      }

      const reviews = await Review.find({ targetId, targetType });
      const avgRating = reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0;
      target.averageRating = avgRating;
      target.reviewCount = reviews.length;
      await target.save();

      res.status(201).json({ success: true, data: review });
    } catch (error) {
      console.error('Submit review error:', error);
      res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
  }
);

// Request review (unchanged)
router.post('/request', auth, [
  body('projectId').isInt().withMessage('Invalid project ID'),
], async (req, res) => {
  try {
    const { projectId } = req.body;
    const project = await Project.findOne({ projectId: parseInt(projectId) });
    if (!project || project.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Invalid project status' });
    }
    if (project.assignedTo.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // Notify project owner (placeholder for email/notification logic)
    res.json({ success: true, message: 'Review request sent' });
  } catch (error) {
    console.error('Request review error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});




router.get('/reviews/check/:bookingId', auth, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.id;

    console.log('Check review request:', { bookingId, userId });

    if (req.user.role !== 'user') {
      console.error('Invalid role for review check:', req.user.role);
      return res.status(403).json({ success: false, message: 'Only users can check reviews' });
    }

    // Validate bookingId
    if (!bookingId || isNaN(parseInt(bookingId))) {
      console.error('Invalid bookingId:', { bookingId });
      return res.status(400).json({ success: false, message: 'Invalid booking ID' });
    }

    // Check if booking exists
    const booking = await Booking.findOne({ bookingId: parseInt(bookingId) }).lean();
    if (!booking) {
      console.error('Booking not found:', { bookingId });
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (!booking.studioId) {
      console.error('No studioId found for booking:', { bookingId });
      return res.status(400).json({ success: false, message: 'No studio associated with this booking' });
    }

    // Check for review with studio as targetType
    const review = await Review.findOne({
      bookingId: parseInt(bookingId),
      userId: userId,
      targetType: 'studio',
      targetId: booking.studioId.toString(),
    }).lean();

    // Fallback: Check for any review with this bookingId and userId (in case of data inconsistency)
    const fallbackReview = await Review.findOne({
      bookingId: parseInt(bookingId),
      userId: userId,
    }).lean();

    const hasReview = !!review || !!fallbackReview;
    console.log('Review check result:', {
      bookingId,
      userId,
      hasReview,
      targetType: 'studio',
      targetId: booking.studioId,
      fallbackUsed: !!fallbackReview && !review,
    });

    res.json({
      success: true,
      data: {
        hasReview: hasReview,
      },
    });
  } catch (error) {
    console.error('Error checking review:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Get reviews for a target (unchanged)
router.get('/reviews/:targetId/:targetType', auth, async (req, res) => {
  try {
    const { targetId, targetType } = req.params;
    if (!['user', 'studio'].includes(targetType)) {
      return res.status(400).json({ success: false, message: 'Invalid target type' });
    }

    const reviews = await Review.find({ targetId, targetType })
      .populate('userId', 'fullName')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: reviews });
  } catch (error) {
    console.error('Get reviews error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

module.exports = router;