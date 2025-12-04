const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const router = express.Router();
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'profilepic/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'user-' + req.user.id + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.mimetype.match(/image\/(jpeg|png)/) || (ext === '.jpg' || ext === '.png')) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG/PNG images are allowed'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB limit
});

router.post('/', auth, upload.single('photo'), async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (user.profilePicUrl) {
      const oldFilePath = path.join(__dirname, '..', user.profilePicUrl);
      try {
        await fs.unlink(oldFilePath);
      } catch (err) {
        if (err.code !== 'ENOENT') console.error('Error deleting old profile photo:', err.message);
      }
    }

    const imageUrl = `/profilepic/${req.file.filename}`;
    user.profilePicUrl = imageUrl;
    await user.save();
    res.json({ success: true, imageUrl });
  } catch (err) {
    console.error('Error uploading profile photo:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;