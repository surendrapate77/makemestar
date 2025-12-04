const express = require('express');
const router = express.Router();
const { Studio, Plan, Album, Settings, Payment, Counter } = require('../models');
const { auth, authorizeStudio } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const restrictStudioOwner = require('../middleware/restrictStudioOwner');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join('Uploads', 'studio', req.params.id, 'albums', req.params.albumId);
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    console.log('Multer received file:', file);
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'), false);
    }
  },
});

// Route: POST /studio/:id/albums/:albumId/photos
// Description: Uploads a photo to a specific album for a studio, with optional description
router.post('/:id/albums/:albumId/photos', auth, authorizeStudio, restrictStudioOwner, upload.single('photo'), [
  body('description').optional().isString().withMessage('Description must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    if (!req.file) return res.status(400).json({ success: false, message: 'No photo uploaded' });

    const album = await Album.findById(req.params.albumId);
    if (!album || album.studioId.toString() !== req.params.id) {
      return res.status(404).json({ success: false, message: 'Album not found' });
    }

    if (!album.checkPhotoLimit()) {
      return res.status(400).json({
        success: false,
        message: 'Photo limit reached (max 20 photos per album)',
        warning: 'Uploading photos with nudity or violence will result in suspension of album feature.'
      });
    }

    const photoUrl = `/Uploads/studio/${req.params.id}/albums/${req.params.albumId}/${req.file.filename}`;
    const newPhoto = { url: photoUrl, description: req.body.description || '' };
    album.photos.push(newPhoto);
    await album.save();

    // Get the newly added photo (last one in the array)
    const savedPhoto = album.photos[album.photos.length - 1];

    await Studio.findByIdAndUpdate(req.params.id, {
      $addToSet: { albums: album._id },
    });

    res.json({
      success: true,
      message: 'Photo uploaded successfully',
      data: {
        _id: savedPhoto._id, // Include the MongoDB-generated _id
        url: savedPhoto.url,
        description: savedPhoto.description || '',
        likes: savedPhoto.likes || [], // Initialize likes if needed
      },
      warning: 'Uploading photos with nudity or violence will result in suspension of album feature.'
    });
  } catch (error) {
    console.error('Upload Photo Error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Route: POST /studio/:id/albums
// Description: Creates a new album for a studio with a name and optional description
router.post('/:id/albums', auth, authorizeStudio, restrictStudioOwner, [
  body('albumName').notEmpty().withMessage('Album name is required'),
  body('description').optional().isString().withMessage('Description must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { albumName, description } = req.body;
    const studio = await Studio.findById(req.params.id);
    if (!studio) return res.status(404).json({ success: false, message: 'Studio not found' });

    const canCreateAlbum = await Album.checkAlbumLimit(req.params.id);
    if (!canCreateAlbum) {
      return res.status(400).json({
        success: false,
        message: 'Album limit reached (max 10 albums per studio)',
        warning: 'Uploading photos with nudity or violence will result in suspension of album feature.'
      });
    }

    const album = new Album({
      studioId: req.params.id,
      albumName,
      description: description || ''
    });
    const savedAlbum = await album.save();

    await Studio.findByIdAndUpdate(req.params.id, {
      $addToSet: { albums: savedAlbum._id }
    });

    res.json({
      success: true,
      message: 'Album created successfully',
      data: savedAlbum,
      warning: 'Uploading photos with nudity or violence will result in suspension of album feature.'
    });
  } catch (error) {
    console.error('Create Album Error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Route: PUT /studio/:id/albums/:albumId
// Description: Updates an existing album's name and/or description
router.put('/:id/albums/:albumId', auth, authorizeStudio, restrictStudioOwner, [
  body('albumName').optional().notEmpty().withMessage('Album name cannot be empty'),
  body('description').optional().isString().withMessage('Description must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { albumName, description } = req.body;
    const album = await Album.findById(req.params.albumId);
    if (!album || album.studioId.toString() !== req.params.id) {
      return res.status(404).json({ success: false, message: 'Album not found' });
    }

    if (albumName) album.albumName = albumName;
    if (description !== undefined) album.description = description;
    await album.save();

    res.json({
      success: true,
      message: 'Album updated successfully',
      data: album
    });
  } catch (error) {
    console.error('Update Album Error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Route: PUT /studio/:id/albums/:albumId/photos/:photoId
// Description: Updates the description of a specific photo in an album
router.put('/:id/albums/:albumId/photos/:photoId', auth, authorizeStudio, restrictStudioOwner, [
  body('description').optional().isString().withMessage('Description must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { description } = req.body;
    const album = await Album.findById(req.params.albumId);
    if (!album || album.studioId.toString() !== req.params.id) {
      return res.status(404).json({ success: false, message: 'Album not found' });
    }

    const photo = album.photos.id(req.params.photoId);
    if (!photo) return res.status(404).json({ success: false, message: 'Photo not found' });

    if (description !== undefined) photo.description = description;
    await album.save();

    res.json({
      success: true,
      message: 'Photo description updated successfully',
      data: { url: photo.url, description: photo.description }
    });
  } catch (error) {
    console.error('Update Photo Description Error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Route: DELETE /studio/:id/albums/:albumId/photos/:photoId
// Description: Deletes a specific photo from an album and removes the file from the server
router.delete('/:id/albums/:albumId/photos/:photoId', auth, authorizeStudio, restrictStudioOwner, async (req, res) => {
  try {
    const album = await Album.findById(req.params.albumId);
    if (!album || album.studioId.toString() !== req.params.id) {
      return res.status(404).json({ success: false, message: 'Album not found' });
    }

    const photo = album.photos.id(req.params.photoId);
    if (!photo) return res.status(404).json({ success: false, message: 'Photo not found' });

    // Normalize path for Windows
    const relativePath = photo.url.replace(/^\/Uploads/, 'Uploads').replace(/\//g, path.sep);
    const filePath = path.join(__dirname, '..', relativePath);
    console.log('Attempting to delete file at:', filePath);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('File deleted successfully:', filePath);
      } else {
        console.log('File not found at:', filePath);
      }
    } catch (error) {
      console.error('File deletion error:', error);
    }

    album.photos.pull({ _id: req.params.photoId });
    await album.save();

    res.json({ success: true, message: 'Photo deleted successfully' });
  } catch (error) {
    console.error('Delete Photo Error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Route: POST /studio/:id/albums/:albumId/photos/:photoId/like
// Description: Allows a user to like a specific photo in an album
router.post('/:id/albums/:albumId/photos/:photoId/like', auth, async (req, res) => {
  try {
    const album = await Album.findById(req.params.albumId);
    if (!album || album.studioId.toString() !== req.params.id) {
      return res.status(404).json({ success: false, message: 'Album not found' });
    }

    const photo = album.photos.id(req.params.photoId);
    if (!photo) return res.status(404).json({ success: false, message: 'Photo not found' });

    if (photo.likes.includes(req.user.id)) {
      return res.status(400).json({ success: false, message: 'Photo already liked' });
    }

    photo.likes.push(req.user.id);
    await album.save();

    res.json({ success: true, message: 'Photo liked successfully', data: { likes: photo.likes.length } });
  } catch (error) {
    console.error('Like Photo Error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Route: POST /studio/:id/albums/:albumId/photos/:photoId/report
// Description: Allows a user to report a photo for inappropriate content
router.post('/:id/albums/:albumId/photos/:photoId/report', auth, [
  body('reason').isIn(['nudity', 'violence', 'other']).withMessage('Invalid report reason')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const album = await Album.findById(req.params.albumId);
    if (!album || album.studioId.toString() !== req.params.id) {
      return res.status(404).json({ success: false, message: 'Album not found' });
    }

    const photo = album.photos.id(req.params.photoId);
    if (!photo) return res.status(404).json({ success: false, message: 'Photo not found' });

    photo.reports.push({ userId: req.user.id, reason: req.body.reason });
    await album.save();

    if (photo.reports.length >= 3) {
      console.log(`Photo ${req.params.photoId} has ${photo.reports.length} reports. Review required.`);
    }

    res.json({ success: true, message: 'Photo reported successfully' });
  } catch (error) {
    console.error('Report Photo Error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Get studio details by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const studio = await Studio.findById(req.params.id)
    .populate('recordingPlans', 'planName price duration description instruments features')
  .populate('albums', 'albumName description photos createdAt updatedAt')
  .populate('userId', 'fullName email');
  
  if (!studio) {
      return res.status(404).json({ success: false, message: 'Studio not found' });
    }
    res.json({ success: true, data: studio });
  } catch (error) {
    console.error('Get Studio Error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});


// Update studio details
router.put('/:id', auth, authorizeStudio, [
  body('studioName').notEmpty().withMessage('Studio name is required'),
  body('location').optional().isString().withMessage('Location must be a string'),
  body('city').optional().isString().withMessage('City must be a string'),
  body('contactNumber').optional().isString().withMessage('Contact number must be a string'),
  body('address').optional().isString().withMessage('Address must be a string'),
  body('rating').optional().isFloat({ min: 0, max: 5 }).withMessage('Rating must be between 0 and 5'),
  body('profilePicUrl').optional().isURL().withMessage('Profile picture URL must be valid'),
  body('mapLocation').optional().isString().withMessage('Map location must be a string'),
  body('youtubeLink1').optional().isURL().withMessage('YouTube Link 1 must be a valid URL'),
  body('youtubeLink2').optional().isURL().withMessage('YouTube Link 2 must be a valid URL'),
  body('youtubeLink3').optional().isURL().withMessage('YouTube Link 3 must be a valid URL'),
  body('extra1').optional().isString().withMessage('Extra Info 1 must be a string'),
  body('extra2').optional().isString().withMessage('Extra Info 2 must be a string'),
  body('extra3').optional().isString().withMessage('Extra Info 3 must be a string'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const {
      studioName,
      location,
      city,
      contactNumber,
      address,
      rating,
      profilePicUrl,
      mapLocation,
      youtubeLink1,
      youtubeLink2,
      youtubeLink3,
      extra1,
      extra2,
      extra3,
    } = req.body;

    const studio = await Studio.findById(req.params.id);
    if (!studio) return res.status(404).json({ success: false, message: 'Studio not found' });

    studio.studioName = studioName || studio.studioName;
    studio.location = location || studio.location;
    studio.city = city || studio.city;
    studio.contactNumber = contactNumber || studio.contactNumber;
    studio.address = address || studio.address;
    studio.rating = rating !== undefined ? rating : studio.rating;
    studio.profilePicUrl = profilePicUrl || studio.profilePicUrl;
    studio.mapLocation = mapLocation || studio.mapLocation;
    studio.youtubeLink1 = youtubeLink1 || studio.youtubeLink1;
    studio.youtubeLink2 = youtubeLink2 || studio.youtubeLink2;
    studio.youtubeLink3 = youtubeLink3 || studio.youtubeLink3;
    studio.extra1 = extra1 || studio.extra1;
    studio.extra2 = extra2 || studio.extra2;
    studio.extra3 = extra3 || studio.extra3;
    studio.updatedDate = Date.now();

    await studio.save();

    res.json({ success: true, message: 'Studio details updated successfully', data: studio });
  } catch (error) {
    console.error('Update Studio Error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Add a new plan to a studio
router.post('/:id/plans', auth, authorizeStudio, [
  body('planName').notEmpty().withMessage('Plan name is required'),
  body('price').isNumeric().withMessage('Price must be a number'),
  body('duration').isNumeric().withMessage('Duration must be a number'),
  body('instruments.*').optional().isIn(['guitar', 'piano', 'drums', 'microphone', 'mixer', 'other']).withMessage('Invalid instrument'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { planName, price, duration, description, instruments, features } = req.body;
    const studio = await Studio.findById(req.params.id);
    if (!studio) return res.status(404).json({ success: false, message: 'Studio not found' });

    const plan = new Plan({
      planName,
      price,
      duration,
      description: description || '',
      instruments: instruments || [],
      features: features || [],
      studioId: studio._id,
    });
    const savedPlan = await plan.save();

    studio.recordingPlans.push(savedPlan._id);
    await studio.save();

    res.json({ success: true, message: 'Plan added successfully', data: savedPlan });
  } catch (error) {
    console.error('Add Plan Error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Update multiple plans for a studio
router.put('/:id/plans', auth, authorizeStudio, [
  body('plans').isArray().withMessage('Plans must be an array'),
  body('plans.*.planName').notEmpty().withMessage('Plan name is required'),
  body('plans.*.price').isNumeric().withMessage('Price must be a number'),
  body('plans.*.duration').isNumeric().withMessage('Duration must be a number'),
  body('plans.*.instruments.*').optional().isIn(['guitar', 'piano', 'drums', 'microphone', 'mixer', 'other']).withMessage('Invalid instrument'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { plans } = req.body;
    const studio = await Studio.findById(req.params.id);
    if (!studio) return res.status(404).json({ success: false, message: 'Studio not found' });

    const planIds = [];
    for (const planData of plans) {
      let plan;
      if (planData._id) {
        plan = await Plan.findOne({ _id: planData._id, studioId: req.params.id });
        if (!plan) return res.status(404).json({ success: false, message: `Plan with ID ${planData._id} not found or does not belong to this studio` });

        plan.planName = planData.planName;
        plan.price = planData.price;
        plan.duration = planData.duration;
        plan.description = planData.description || '';
        plan.instruments = planData.instruments || [];
        plan.features = planData.features || [];
        plan.updatedDate = Date.now();
      } else {
        plan = new Plan({
          planName: planData.planName,
          price: planData.price,
          duration: planData.duration,
          description: planData.description || '',
          instruments: planData.instruments || [],
          features: planData.features || [],
          studioId: studio._id,
          createdDate: Date.now(),
          updatedDate: Date.now(),
        });
      }
      const savedPlan = await plan.save();
      planIds.push(savedPlan._id);
    }

    studio.recordingPlans = planIds;
    await studio.save();

    res.json({ success: true, message: 'Plans updated successfully', data: studio });
  } catch (error) {
    console.error('Update Studio Plans Error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Update an existing plan
router.put('/:id/plans/:planId', auth, authorizeStudio, [
  body('planName').optional().isString().withMessage('Plan name must be a string'),
  body('price').optional().isNumeric().withMessage('Price must be a number'),
  body('duration').optional().isNumeric().withMessage('Duration must be a number'),
  body('instruments.*').optional().isIn(['guitar', 'piano', 'drums', 'microphone', 'mixer', 'other']).withMessage('Invalid instrument'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { planName, price, duration, description, instruments, features } = req.body;
    const plan = await Plan.findById(req.params.planId);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

    if (plan.studioId.toString() !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Plan does not belong to this studio' });
    }

    if (planName !== undefined) plan.planName = planName;
    if (price !== undefined) plan.price = price;
    if (duration !== undefined) plan.duration = duration;
    if (description !== undefined) plan.description = description;
    if (instruments !== undefined) plan.instruments = instruments;
    if (features !== undefined) plan.features = features;
    plan.updatedDate = Date.now();

    await plan.save();
    res.json({ success: true, message: 'Plan updated successfully', data: plan });
  } catch (error) {
    console.error('Update Plan Error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Delete a plan
router.delete('/:id/plans/:planId', auth, authorizeStudio, async (req, res) => {
  try {
    const plan = await Plan.findById(req.params.planId);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

    if (plan.studioId.toString() !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Plan does not belong to this studio' });
    }

    await Plan.deleteOne({ _id: req.params.planId });
    await Studio.updateOne({ _id: req.params.id }, { $pull: { recordingPlans: req.params.planId } });

    res.json({ success: true, message: 'Plan deleted successfully' });
  } catch (error) {
    console.error('Delete Plan Error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Route: GET /studio/:id/verification-status
// Description: Returns the studio's verification status and the verification fee
// Route: GET /studio/:id/verification-status
router.get('/:id/verification-status', auth, async (req, res) => {
  try {
    if (!Settings) {
      throw new Error('Settings model is not defined');
    }
    const studio = await Studio.findById(req.params.id);
    if (!studio) {
      return res.status(404).json({ success: false, message: 'Studio not found' });
    }

    const settings = await Settings.findOne({ key: 'verificationFee' });
    const verificationFee = settings ? settings.value : 1000;

    res.json({
      success: true,
      data: {
        isVerified: studio.isVerified,
        verificationFee,
      },
    });
  } catch (error) {
    console.error('Get Verification Status Error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Route: POST /studio/:id/verification-payment
router.post('/:id/verification-payment', auth, authorizeStudio, async (req, res) => {
  try {
    console.log('Payment model:', Payment);
    const studio = await Studio.findById(req.params.id);
    if (!studio) {
      return res.status(404).json({ success: false, message: 'Studio not found' });
    }
    if (studio.isVerified) {
      return res.status(400).json({ success: false, message: 'Studio is already verified' });
    }

    const settings = await Settings.findOne({ key: 'verificationFee' });
    const verificationFee = settings ? settings.value : 1000;

    if (!Payment) {
      throw new Error('Payment model is not defined');
    }

    // Check for existing pending payment
    const existingPayment = await Payment.findOne({
      studioId: req.params.id,
      type: 'verification',
      status: 'pending',
    });

    let payment;
    let paymentId;

    if (existingPayment) {
      // Use existing pending payment
      payment = existingPayment;
      paymentId = payment.paymentId;
    } else {
      // Generate new paymentId
      const counter = await Counter.findOneAndUpdate(
        { _id: 'paymentId' },
        { $inc: { sequence: 1 } },
        { new: true, upsert: true }
      );
      paymentId = counter.sequence;

      // Create new payment record
      payment = new Payment({
        paymentId: paymentId,
        studioId: studio._id,
        userId: req.user.id,
        amount: verificationFee,
        type: 'verification',
        status: 'pending',
        createdDate: Date.now(),
      });
      await payment.save();
    }

    // Generate UPI URL with short transaction note
    const upiUrl = `upi://pay?pa=${encodeURIComponent(process.env.UPI_ID)}&pn=${encodeURIComponent('StudioVerification')}&am=${verificationFee}&cu=INR&tn=${encodeURIComponent(`V_${paymentId}`)}`;
    console.log('UPI URL:', upiUrl); // Debug
    const qrCodeBase64 = await QRCode.toDataURL(upiUrl, {
      scale: 4, // Reduce image resolution
      margin: 2, // Reduce margin
    });
    console.log('QR Code length:', qrCodeBase64.length); // Debug

    res.json({
      success: true,
      message: 'Verification payment initiated',
      data: {
        paymentId: payment.paymentId,
        mongoId: payment._id,
        studioId: studio._id,
        amount: verificationFee,
        qrCodeUrl: qrCodeBase64,
        upiUrl, // Include raw UPI URL as fallback
      },
    });
  } catch (error) {
    console.error('Verification Payment Error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});
// Route: POST /studio/payment/:paymentId/update
router.post('/payment/:paymentId/update', auth, authorizeStudio, [
  body('transactionId').notEmpty().withMessage('Transaction ID is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { transactionId } = req.body;
    const payment = await Payment.findOne({ paymentId: parseInt(req.params.paymentId) });
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    payment.transactionId = transactionId;
    payment.updatedDate = Date.now();
    await payment.save();

    res.json({
      success: true,
      message: 'Transaction ID updated successfully',
      data: payment,
    });
  } catch (error) {
    console.error('Update Payment Transaction Error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

module.exports = router;
