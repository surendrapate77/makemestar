const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const SkillCategory = mongoose.models.SkillCategory || require('../models/SkillCategory');
const { auth } = require('../middleware/auth');

router.get('/', async (req, res) => {
  try {
    const categories = await SkillCategory.find();
    res.json({ success: true, data: categories });
  } catch (error) {
    console.error('Error in getSkillCategories:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

router.get('/:skill', async (req, res) => {
  try {
    const skill = req.params.skill;
    const category = await SkillCategory.findOne({ name: skill });
    if (!category) return res.status(404).json({ success: false, message: 'Skill category not found' });
    res.json({ success: true, data: category });
  } catch (error) {
    console.error('Error in getSkillCategory:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});



module.exports = router;