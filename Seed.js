// Seed script (run once)
const mongoose = require('mongoose');
const Subscription = require('./models/Subscription');

async function seedSubscriptions() {
  try {
    await mongoose.connect('mongodb://localhost:27017/your_database');
    const subscriptions = [
      { name: 'Basic', postLimit: 10, bidLimit: 10, price: 500, durationDays: 90 },
      { name: 'Pro', postLimit: 30, bidLimit: 30, price: 1000, durationDays: 180 },
      { name: 'Primium', postLimit: 50, bidLimit: 50, price: 1500, durationDays: 365 },
    ];
    await Subscription.deleteMany({});
    await Subscription.insertMany(subscriptions);
    console.log('Subscriptions seeded');
    mongoose.connection.close();
  } catch (error) {
    console.error('Error seeding subscriptions:', error);
  }
}

seedSubscriptions();
