const express = require('express');
const { User, Review} = require('../models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const Studio = require('../models/Studio');

router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('mobileNumber').isLength({ min: 10, max: 10 }).withMessage('Mobile number must be 10 digits'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, mobileNumber, password, role, fullName, studioName } = req.body;

  try {
    const existingUser = await User.findOne({ $or: [{ email }, { mobileNumber }] });
    if (existingUser) return res.status(400).json({ message: 'Email or mobile number already exists' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({ email, mobileNumber, password: hashedPassword, role, fullName });
    await user.save();

    let studioId = null;
    if (role === 'studio' && studioName) {
      const studio = new Studio({
        studioName,
        userId: user._id,
        location: '',
        contactNumber: '',
        address: '',
        rating: 0.0,
        profilePicUrl: '',
        mapLocation: '',
        youtubeLink1: '',
        youtubeLink2: '',
        youtubeLink3: '',
        recordingPlans: [],
      });
      const savedStudio = await studio.save();
      studioId = savedStudio._id.toString();
      user.studios.push(savedStudio._id);
      await user.save();
    }

    const accessToken = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const refreshToken = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_REFRESH_SECRET, { expiresIn: '79d' });

    user.refreshTokens = [refreshToken];
    await user.save();

    res.status(201).json({
      token: accessToken,
      refreshToken: refreshToken,
      role: user.role,
      userId: user._id.toString(),
      fullName: user.fullName,
      studioId: studioId,
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/login', [
  body('identifier').notEmpty().withMessage('Identifier (email or mobile) is required'),
  body('password').notEmpty().withMessage('Password is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { identifier, password } = req.body;

  try {
    const user = await User.findOne({ $or: [{ email: identifier }, { mobileNumber: identifier }] });
    if (!user) return res.status(400).json({ message: 'Invalid email/mobile or password' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid email/mobile or password' });

    const accessToken = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const refreshToken = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_REFRESH_SECRET, { expiresIn: '79d' });

    user.refreshTokens = [refreshToken];
    await user.save();

    let studioId = null;
    if (user.studios && user.studios.length > 0) {
      studioId = user.studios[0]._id.toString();
    }

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 79 * 24 * 60 * 60 * 1000,
    });

    res.json({
      token: accessToken,
      refreshToken: refreshToken,
      role: user.role,
      userId: user._id.toString(),
      fullName: user.fullName,
      studioId: studioId,
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;