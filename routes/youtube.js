// routes/youtube.js
const express = require('express');
const router = express.Router();
const { Booking, User } = require('../models');
const { auth } = require('../middleware/auth');
const multer = require('multer');
const { google } = require('googleapis');
const fetch = require('node-fetch').default;
const fs = require('fs');
const { exec } = require('child_process');
const admin = require('firebase-admin');

const upload = multer({ dest: 'uploads/' });

// AudD.io कॉपी चेक
async function checkCopyright(filePath) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  form.append('return', 'apple_music,spotify');
  try {
    const res = await fetch('https://api.audd.io/', { method: 'POST', body: form });
    const data = await res.json();
    return !data.result;
  } catch (e) {
    return true;
  }
}

// वॉटरमार्क
function addWatermark(input, output, callback) {
  const ffmpegPath = 'C:/ffmpeg/bin/ffmpeg.exe';
  const cmd = `"${ffmpegPath}" -i "${input}" -i logo.png -filter_complex "[0:v][1:v]overlay=10:10" -c:a copy "${output}"`;
  exec(cmd, callback);
}

// UPLOAD ROUTE
router.post('/upload', upload.single('video'), auth, async (req, res) => {
  const videoPath = req.file.path;
  const {
    uploadOption,
    bookingId,
    userId,
    studioId,
    studioName,
    description,
    googleAccessToken,
    title // ← नया टाइटल आ रहा है
  } = req.body;

  try {
    if (uploadOption === 'personal' && googleAccessToken) {
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: googleAccessToken });
      const youtube = google.youtube('v3');

      // ← टाइटल यूजर का या डिफ़ॉल्ट
      const videoTitle = title?.trim() || `Recorded at ${studioName || studioId}`;

      const finalDesc = description || `Uploaded via MusicLancerApp\nBooking ID: ${bookingId}`;

      const response = await youtube.videos.insert({
        auth: oauth2Client,
        part: 'snippet,status',
        requestBody: {
          snippet: {
            title: videoTitle,
            description: finalDesc
          },
          status: { privacyStatus: 'public' }
        },
        media: { body: fs.createReadStream(videoPath) }
      });

      const youtubeLink = `https://youtu.be/${response.data.id}`;

      await Booking.findOneAndUpdate(
        { bookingId: parseInt(bookingId) },
        { hasVideo: true, youtubeLink, youtubeUploadedAt: new Date() }
      );

      await User.findByIdAndUpdate(userId, { $inc: { points: 50 } });

      fs.unlinkSync(videoPath);

      res.json({
        success: true,
        link: youtubeLink,
        message: 'Video uploaded to your channel!'
      });
    }
  } catch (err) {
    console.error('Upload error:', err);
    if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    res.status(500).json({ success: false, message: err.message || 'Upload failed' });
  }
});

// बाकी routes वही
router.get('/all-videos', auth, async (req, res) => {
  try {
    const videos = await Booking.find({ hasVideo: true })
      .populate('userId', 'fullName')
      .populate('studioId', 'studioName')
      .sort({ youtubeUploadedAt: -1 })
      .limit(50);

    const formatted = videos.map(v => ({
      id: v._id,
      title: `${v.userId?.fullName || 'Artist'} - ${v.studioId?.studioName || 'Studio'} Recording`,
      link: v.youtubeLink,
      thumbnail: `https://img.youtube.com/vi/${v.youtubeLink?.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)?.[1] || ''}/maxresdefault.jpg`,
      views: v.youtubeViews || 0,
      uploadedAt: v.youtubeUploadedAt,
    }));

    res.json({ success: true, videos: formatted });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/booking/:id/has-video', auth, async (req, res) => {
  try {
    const booking = await Booking.findOne({ bookingId: parseInt(req.params.id) });
    res.send(booking?.hasVideo ? 'true' : 'false');
  } catch (e) {
    res.send('false');
  }
});

module.exports = router;