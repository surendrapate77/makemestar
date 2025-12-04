const express = require('express');
const router = express.Router();
const { User, Skill,Project,Bid,UserSubscription } = require('../models');
const { auth } = require('../middleware/auth');


// Get user dashboard data
router.get('/dashboard', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select('fullName role averageRating reviewCount');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const projects = await Project.find({
      $or: [{ userId }, { assignedTo: userId }],
    }).select('projectId projectName status');

    const bids = await Bid.find({ freelancerId: userId }).select('projectId bidAmount status');

    const subscription = await UserSubscription.findOne({
      userId,
      endDate: { $gte: new Date() },
    }).populate('subscriptionId');

    const threeMonths = 3 * 30 * 24 * 60 * 60 * 1000;
    const now = new Date();
    let freePostAvailable = false;
    let freeBidAvailable = false;

    if (!subscription || (now - subscription.lastFreePostReset) >= threeMonths) {
      freePostAvailable = subscription?.freePostsUsed < 1;
    }
    if (!subscription || (now - subscription.lastFreeBidReset) >= threeMonths) {
      freeBidAvailable = subscription?.freeBidsUsed < 1;
    }

    res.json({
      success: true,
      data: {
        user,
        projects,
        bids,
        subscription,
        freePostAvailable,
        freeBidAvailable,
      },
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});


router.get('/profile/:userId', auth, async (req, res) => {
  try {
    const userId = req.params.userId;
    if (req.user.id !== userId) return res.status(403).json({ message: 'Unauthorized access' });

    const user = await User.findById(userId)
      .select('-password -refreshTokens')
      .populate('studios')
      .populate('skillsDetails');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (error) {
    console.error('Server error in getUserProfile:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});
//update profile and skill details
router.get('/profile/:userId', auth, async (req, res) => {
  try {
    const userId = req.params.userId;
    if (req.user.id !== userId) return res.status(403).json({ message: 'Unauthorized access' });

    const user = await User.findById(userId)
      .select('-password -refreshTokens')
      .populate('studios')
      .populate('skillsDetails');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (error) {
    console.error('Server error in getUserProfile:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

router.put('/profile', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { skills, skillsDetails, fullName, profilePicUrl, profileVisibility, city, location, contactNumber, address, mapLocation } = req.body;

    // Validate skillsDetails
    if (skillsDetails && !Array.isArray(skillsDetails)) {
      return res.status(400).json({ success: false, message: 'skillsDetails must be an array' });
    }

    // Delete existing skills from Skill collection
    if (skillsDetails) {
      const user = await User.findById(userId);
      if (user && user.skillsDetails && user.skillsDetails.length > 0) {
        await Skill.deleteMany({ _id: { $in: user.skillsDetails } });
      }
    }

    const updates = {};
    if (skills) updates.skills = skills;
    if (fullName) updates.fullName = fullName;
    if (profilePicUrl) updates.profilePicUrl = profilePicUrl;
    if (profileVisibility) updates.profileVisibility = profileVisibility;
    if (city !== undefined) updates.city = city;
    if (location !== undefined) updates.location = location;
    if (contactNumber !== undefined) updates.contactNumber = contactNumber;
    if (address !== undefined) updates.address = address;
    if (mapLocation !== undefined) updates.mapLocation = mapLocation;

    if (skillsDetails) {
      const skillIds = [];
      for (const detail of skillsDetails) {
        if (!detail.skill) return res.status(400).json({ success: false, message: 'Skill name is required in skillsDetails' });
        const skill = new Skill({
          userId,
          skill: detail.skill,
          experienceLevel: detail.experienceLevel || detail.data?.experienceLevel || 'beginner',
          certifications: detail.certifications || [],
          photos: detail.photos || [],
          sampleWork: detail.sampleWork || [],
          charges: detail.charges || { hourlyRate: 0, projectRate: 0, description: '' },
          achievements: detail.achievements || [],
          reviews: detail.reviews || [],
        });
        const savedSkill = await skill.save();
        skillIds.push(savedSkill._id);
      }
      updates.skillsDetails = skillIds;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true }
    ).select('-password -refreshTokens').populate('skillsDetails');

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (error) {
    console.error('Server error in updateProfile:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

router.get('/search', async (req, res) => {
  try {
    const { skill, experienceLevel, city } = req.query;
    const query = {};
    if (skill) query.skill = { $regex: skill, $options: 'i' };
    if (experienceLevel) query.experienceLevel = experienceLevel;
    if (city) query.city = { $regex: city, $options: 'i' };

    const skills = await Skill.find(query).populate({
      path: 'userId',
      select: 'fullName email city location profilePicUrl profileVisibility',
      match: { profileVisibility: 'public' },
    });

    const users = skills
      .filter(skill => skill.userId)
      .map(skill => ({
        user: skill.userId,
        skill: {
          skill: skill.skill,
          experienceLevel: skill.experienceLevel,
          certifications: skill.certifications,
          photos: skill.photos,
          sampleWork: skill.sampleWork,
          charges: skill.charges,
          achievements: skill.achievements,
          reviews: skill.reviews,
        },
      }));

    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Server error in searchUsersBySkill:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// स्किल्स के आधार पर उपयोगकर्ता खोजने के लिए नया राउट
router.get('/search', async (req, res) => {
  try {
    const { skill, experienceLevel, city } = req.query;
    const query = {};
    if (skill) query.skill = { $regex: skill, $options: 'i' };
    if (experienceLevel) query.experienceLevel = experienceLevel;
    if (city) query.city = { $regex: city, $options: 'i' };

    const skills = await Skill.find(query).populate({
      path: 'userId',
      select: 'fullName email city location profilePicUrl profileVisibility',
      match: { profileVisibility: 'public' },
    });

    const users = skills
      .filter(skill => skill.userId) // केवल उन स्किल्स को शामिल करें जिनके पास वैलिड यूज़र है
      .map(skill => ({
        user: skill.userId,
        skill: {
          skill: skill.skill,
          experienceLevel: skill.experienceLevel,
          certifications: skill.certifications,
          photos: skill.photos,
          sampleWork: skill.sampleWork,
          charges: skill.charges,
          achievements: skill.achievements,
          reviews: skill.reviews,
        },
      }));

    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Server error in searchUsersBySkill:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

module.exports = router;