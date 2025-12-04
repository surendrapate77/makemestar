const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Define storage for uploaded photos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const albumPath = `uploads/studio/${req.params.id}/albums/${req.params.albumId}/`;
    fs.mkdirSync(albumPath, { recursive: true });
    cb(null, albumPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter to allow only images
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, and GIF images are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

module.exports = upload;