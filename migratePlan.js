const mongoose = require('mongoose');
const { Studio, Plan } = require('./models');

async function migratePlans() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    const studios = await Studio.find({}).lean();
    for (const studio of studios) {
      if (studio.recordingPlans && studio.recordingPlans.length > 0) {
        const planIds = [];
        for (const planData of studio.recordingPlans) {
          const plan = new Plan({
            planName: planData.planName,
            price: planData.price,
            duration: planData.duration,
            description: planData.description,
            instruments: planData.instruments || [],
            features: planData.features || [],
            createdDate: planData.createdDate || Date.now(),
            updatedDate: Date.now(),
          });
          const savedPlan = await plan.save();
          planIds.push(savedPlan._id);
        }
        await Studio.findByIdAndUpdate(studio._id, { recordingPlans: planIds });
        console.log(`Migrated plans for studio ${studio.studioName}`);
      }
    }
    console.log('Migration completed');
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

migratePlans();