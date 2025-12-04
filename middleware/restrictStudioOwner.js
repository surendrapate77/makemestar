const { Studio } = require('../models');

const restrictStudioOwner = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const studioId = req.params.id;

    const studio = await Studio.findById(studioId);
    if (!studio) {
      return res.status(404).json({ success: false, message: 'Studio not found' });
    }

    if (studio.userId.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied: Not the studio owner' });
    }

    next();
  } catch (error) {
    console.error('restrictStudioOwner Error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

module.exports = restrictStudioOwner;