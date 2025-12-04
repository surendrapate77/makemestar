const express = require('express');
const router = express.Router();
const { Studio, Booking, Counter, Plan } = require('../models');
const { auth, authorizeStudio } = require('../middleware/auth');
const { check, query, body, validationResult } = require('express-validator');
const QRCode = require('qrcode');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const restrictStudioOwner = require('../middleware/restrictStudioOwner');



const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

// Get unique cities
router.get('/cities', auth, async (req, res) => {
  try {
    const cities = await Studio.distinct('city', { isVerified: true });
    if (cities.length === 0) {
      return res.status(404).json({ success: false, message: 'No verified cities found' });
    }
    res.json({ success: true, data: cities });
  } catch (error) {
    console.error('Get Cities Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get studios by city and optional location
router.get('/studios/location', auth, [
  query('city').notEmpty().withMessage('City is required'),
  query('location').optional().isString().withMessage('Location must be a string'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { city, location } = req.query;
    const query = { city, isVerified: true };
    if (location) query.location = new RegExp(location, 'i');

    const studios = await Studio.find(query)
      .select('studioName location city recordingPlans')
      .populate('recordingPlans', 'planName price duration description instruments features');
    if (studios.length === 0) {
      return res.status(404).json({ success: false, message: 'No verified studios found for this city/location' });
    }
    res.json({ success: true, data: studios });
  } catch (error) {
    console.error('Get Studios Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create booking
router.post('/bookings', auth, [
  body('studioId').notEmpty().withMessage('Studio ID is required'),
  body('planId').notEmpty().withMessage('Plan ID is required'),
  body('recordingDate').isISO8601().withMessage('Valid recording date is required'),
  body('city').notEmpty().withMessage('City is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { studioId, planId, recordingDate, city } = req.body;
    const studio = await Studio.findById(studioId);
    if (!studio) return res.status(404).json({ message: 'Studio not found' });
    if (!studio.isVerified) return res.status(403).json({ message: 'Studio is not verified' });

    const plan = await Plan.findById(planId);
    if (!plan) return res.status(404).json({ message: 'Plan not found' });

    // Normalize recordingDate to start of day for comparison
    const normalizedRecordingDate = new Date(recordingDate);
    normalizedRecordingDate.setHours(0, 0, 0, 0);

    // Check for existing pending booking
    const existingBooking = await Booking.findOne({
      studioId,
      plan: planId,
      recordingDate: {
        $gte: normalizedRecordingDate,
        $lt: new Date(normalizedRecordingDate.getTime() + 24 * 60 * 60 * 1000),
      },
      paymentStatus: 'pending',
    });

    let booking;
    let bookingId;

    if (existingBooking) {
      // Use existing pending booking
      booking = existingBooking;
      bookingId = booking.bookingId;
    } else {
      // Generate new bookingId
      const counter = await Counter.findOneAndUpdate(
        { name: 'bookingId' },
        { $inc: { sequence: 1 } },
        { new: true, upsert: true }
      );
      bookingId = counter.sequence;

      // Create new booking
      booking = new Booking({
        bookingId: bookingId,
        userId: req.user.id,
        studioId,
        city,
        plan: planId,
        planDetails: {
          planName: plan.planName,
          price: plan.price,
          duration: plan.duration,
          description: plan.description,
          instruments: plan.instruments,
          features: plan.features,
        },
        recordingDate: new Date(recordingDate),
      });
      await booking.save();
    }

    const upiUrl = `upi://pay?pa=${encodeURIComponent(process.env.UPI_ID)}&pn=${encodeURIComponent('StudioBooking')}&am=${plan.price}&cu=INR&tn=${encodeURIComponent(`Booking_${bookingId}`)}`;
    const qrCodeBase64 = await QRCode.toDataURL(upiUrl);

    res.json({ success: true, data: booking, upiUrl, qrCode: qrCodeBase64 });
  } catch (error) {
    console.error('Create Booking Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update booking details
router.put('/bookings/:id', auth, [
  body('transactionId').notEmpty().withMessage('Transaction ID is required'),
  body('specialRequest').optional().isString().withMessage('Special request must be a string'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { transactionId, specialRequest } = req.body;
    const booking = await Booking.findOne({ bookingId: parseInt(req.params.id) });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    booking.transactionId = transactionId;
    booking.specialRequest = specialRequest || '';
    await booking.save();

    res.json({ success: true, message: 'Booking details updated successfully', data: booking });
  } catch (error) {
    console.error('Update Booking Details Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Verify payment
router.post('/bookings/:id/verify', auth, [
  body('paymentStatus').isIn(['completed', 'failed']).withMessage('Invalid payment status'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { paymentStatus } = req.body;
    const booking = await Booking.findOne({ bookingId: parseInt(req.params.id) }).populate('userId studioId');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    booking.paymentStatus = paymentStatus;
    await booking.save();

    if (paymentStatus === 'completed') {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: booking.userId.email,
        subject: 'Booking Confirmation',
        text: `Your booking (ID: ${booking.bookingId}) for ${booking.planDetails.planName} on ${booking.recordingDate.toDateString()} has been confirmed.`,
      });

      await client.messages.create({
        body: `Your booking (ID: ${booking.bookingId}) for ${booking.planDetails.planName} is confirmed for ${booking.recordingDate.toDateString()}.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: booking.userId.mobileNumber,
      });

      const studioOwner = await User.findById(booking.studioId.userId);
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: studioOwner.email,
        subject: 'New Booking Notification',
        text: `A new booking (ID: ${booking.bookingId}) for ${booking.planDetails.planName} has been confirmed for ${booking.recordingDate.toDateString()}.`,
      });

      await client.messages.create({
        body: `New booking (ID: ${booking.bookingId}) for ${booking.planDetails.planName} on ${booking.recordingDate.toDateString()}.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: studioOwner.mobileNumber,
      });
    }

    res.json({ success: true, data: booking });
  } catch (error) {
    console.error('Verify Payment Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
router.get('/bookings/:bookingId', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId)
      .populate('studioId', 'studioName')
      .populate('userId', 'fullName');
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    res.json({ success: true, data: booking });
  } catch (error) {
    console.error('Error fetching booking details:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});



// Get studio bookings
router.get('/studio/:studioId/bookings', auth, async (req, res) => {
  try {
    const bookings = await Booking.find({ studioId: req.params.studioId })
      .populate('userId', 'fullName')
      .populate('studioId', 'studioName');
    if (!bookings || bookings.length === 0) {
      return res.status(404).json({ success: false, message: 'No bookings found for this studio' });
    }
    res.json({ success: true, data: bookings });
  } catch (error) {
    console.error('Error fetching studio bookings:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get user bookings
router.get('/user/:userId/bookings', auth, async (req, res) => {
  try {
    const bookings = await Booking.find({ userId: req.params.userId })
      .populate('studioId', 'studioName')
      .populate('userId', 'fullName');
    if (!bookings || bookings.length === 0) {
      return res.status(404).json({ success: false, message: 'No bookings found for this user' });
    }
    res.json({ success: true, data: bookings });
  } catch (error) {
    console.error('Error fetching user bookings:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
// Get booking details by numeric bookingId
router.get('/bookings/id/:bookingId', auth, async (req, res) => {
  try {
    const booking = await Booking.findOne({ bookingId: parseInt(req.params.bookingId) })
      .populate('studioId', 'studioName')
      .populate('userId', 'fullName');
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    res.json({ success: true, data: booking });
  } catch (error) {
    console.error('Error fetching booking details:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Generate QR code for booking payment
router.get('/bookings/:bookingId/qr', auth, async (req, res) => {
  try {
    const booking = await Booking.findOne({ bookingId: parseInt(req.params.bookingId) })
      .populate('studioId', 'studioName')
      .populate('userId', 'fullName');
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    if (booking.paymentStatus !== 'pending') {
      return res.status(400).json({ success: false, message: 'Payment already processed' });
    }
    const upiUrl = `upi://pay?pa=your-upi-id@upi&pn=YourName&am=${booking.planDetails.price}&cu=INR&tn=Booking_${booking.bookingId}`;
    res.json({ success: true, data: { qrCodeUrl: upiUrl } });
  } catch (error) {
    console.error('Error generating QR code:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Mark booking as completed by studio
router.put('/bookings/:bookingId/status/studio', auth, authorizeStudio, async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const booking = await Booking.findOne({ bookingId: parseInt(bookingId) })
      .populate('studioId', 'studioName userId')
      .populate('userId', 'fullName');
    
    if (!booking) {
      console.error('Booking not found:', { bookingId });
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    
    // Check if recording date has passed
    if (new Date(booking.recordingDate) > new Date()) {
      console.error('Recording date not passed:', { bookingId, recordingDate: booking.recordingDate });
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot mark as completed before recording date' 
      });
    }
    
    // Set req.params.id for restrictStudioOwner middleware
    req.params.id = booking.studioId._id.toString();
    console.log('Studio ownership check:', {
      userId: req.user.id,
      studioId: req.params.id,
      studioUserId: booking.studioId.userId.toString()
    });
    
    // Call restrictStudioOwner middleware
    restrictStudioOwner(req, res, async () => {
      try {
        booking.statusbyStudio = 'completed';
        await booking.save();
        
        res.json({ 
          success: true, 
          message: 'Booking marked as completed by studio',
          data: booking 
        });
      } catch (error) {
        console.error('Error saving booking status:', error);
        res.status(500).json({ success: false, message: error.message });
      }
    });
  } catch (error) {
    console.error('Error marking booking completed by studio:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Mark booking as completed by user
router.put('/bookings/:bookingId/status/user', auth, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const booking = await Booking.findOne({ bookingId: parseInt(bookingId) })
      .populate('userId', 'fullName')
      .populate('studioId', 'studioName');
    
    if (!booking) {
      console.error('Booking not found:', { bookingId });
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    
    // Check if recording date has passed
    if (new Date(booking.recordingDate) > new Date()) {
      console.error('Recording date not passed:', { bookingId, recordingDate: booking.recordingDate });
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot mark as completed before recording date' 
      });
    }
    
    // Check user ownership
    if (!req.user || req.user.role !== 'user') {
      console.error('Invalid role:', req.user ? req.user.role : 'No user');
      return res.status(403).json({ success: false, message: 'User access required' });
    }
    
    const userId = req.user.id ? req.user.id.toString() : null;
    const bookingUserId = booking.userId && booking.userId._id ? booking.userId._id.toString() : null;
    console.log('Comparing user IDs:', { userId, bookingUserId });
    
    if (!userId || userId !== bookingUserId) {
      console.error('Unauthorized user access:', { userId, bookingUserId });
      return res.status(403).json({ success: false, message: 'Unauthorized user' });
    }
    
    // Check if studio has marked as completed first
    if (booking.statusbyStudio !== 'completed') {
      console.error('Studio not completed:', { bookingId, statusbyStudio: booking.statusbyStudio });
      return res.status(400).json({ 
        success: false, 
        message: 'Studio must mark as completed first' 
      });
    }
    
    booking.status = 'completed';
    await booking.save();
    
    res.json({ 
      success: true, 
      message: 'Booking completed successfully',
      data: booking 
    });
  } catch (error) {
    console.error('Error marking booking completed by user:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Raise dispute by user or studio
router.post('/bookings/:bookingId/dispute', auth, [
  body('reason').notEmpty().withMessage('Reason is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('Validation errors:', errors.array());
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    
    const { bookingId } = req.params;
    const { reason } = req.body;
    const booking = await Booking.findOne({ bookingId: parseInt(bookingId) })
      .populate('studioId', 'studioName userId')
      .populate('userId', 'fullName');
    
    if (!booking) {
      console.error('Booking not found:', { bookingId });
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    
    // Check if recording date has passed
    if (new Date(booking.recordingDate) > new Date()) {
      console.error('Recording date not passed:', { bookingId, recordingDate: booking.recordingDate });
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot raise dispute before recording date' 
      });
    }
    
    // Check if already disputed
    if (booking.disputeStatus !== 'none') {
      console.error('Dispute already raised:', { bookingId, disputeStatus: booking.disputeStatus });
      return res.status(400).json({ 
        success: false, 
        message: 'Dispute already raised' 
      });
    }
    
    // Verify ownership (user or studio)
    if (!req.user) {
      console.error('No user in request');
      return res.status(403).json({ success: false, message: 'Authentication required' });
    }
    
    const role = req.user.role; // 'user' or 'studio'
    if (role === 'studio') {
      // Set req.params.id for restrictStudioOwner middleware
      req.params.id = booking.studioId._id.toString();
      console.log('Studio dispute ownership check:', {
        userId: req.user.id,
        studioId: req.params.id,
        studioUserId: booking.studioId.userId.toString()
      });
      
      // Call restrictStudioOwner middleware
      return restrictStudioOwner(req, res, async () => {
        try {
          booking.disputeStatus = 'raised';
          booking.disputeDetails = {
            raisedBy: role,
            reason,
            raisedDate: new Date()
          };
          
          await booking.save();
          
          res.json({ 
            success: true, 
            message: 'Dispute raised successfully',
            data: booking 
          });
        } catch (error) {
          console.error('Error saving dispute:', error);
          res.status(500).json({ success: false, message: error.message });
        }
      });
    } else if (role === 'user') {
      const userId = req.user.id ? req.user.id.toString() : null;
      const bookingUserId = booking.userId && booking.userId._id ? booking.userId._id.toString() : null;
      console.log('User dispute ownership check:', { userId, bookingUserId });
      
      if (!userId || userId !== bookingUserId) {
        console.error('Unauthorized user access for dispute:', { userId, bookingUserId });
        return res.status(403).json({ success: false, message: 'Unauthorized user' });
      }
      
      booking.disputeStatus = 'raised';
      booking.disputeDetails = {
        raisedBy: role,
        reason,
        raisedDate: new Date()
      };
      
      await booking.save();
      
      res.json({ 
        success: true, 
        message: 'Dispute raised successfully',
        data: booking 
      });
    } else {
      console.error('Invalid role for dispute:', role);
      return res.status(403).json({ success: false, message: 'Invalid role' });
    }
  } catch (error) {
    console.error('Error raising dispute:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/:bookingId/youtube-upload', auth, async (req, res) => {
  if (req.user.role !== 'user') return res.status(403).json({ success: false });

  const { bookingId } = req.params;
  const { youtubeLink } = req.body;

  await Booking.updateOne(
    { bookingId: parseInt(bookingId), userId: req.user.id },
    { hasVideo: true, youtubeLink, youtubeUploadedAt: new Date() }
  );

  res.json({ success: true });
});

module.exports = router;