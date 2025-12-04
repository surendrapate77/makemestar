const mongoose = require('mongoose');
const { Booking, Payment } = require('./models');
const cron = require('node-cron');

// Function to delete pending bookings older than 15 days
async function deleteStaleBookings() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000); // 30 days ago
    const result = await Booking.deleteMany({
      paymentStatus: 'pending',
      createdDate: { $lt: thirtyDaysAgo },
    });
    console.log(`Deleted ${result.deletedCount} stale bookings at ${new Date().toISOString()}`);
    return result;
  } catch (error) {
    console.error('Error deleting stale bookings:', error);
    throw error;
  }
}

// Function to delete pending payments older than 15 days
async function deleteStalePayments() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000); // 30 days ago
    const result = await Payment.deleteMany({
      status: 'pending',
      createdDate: { $lt: thirtyDaysAgo },
    });
    console.log(`Deleted ${result.deletedCount} stale payments at ${new Date().toISOString()}`);
    return result;
  } catch (error) {
    console.error('Error deleting stale payments:', error);
    throw error;
  }
}

// Schedule cleanup to run daily at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('Running cleanup job for stale bookings and payments...');
  try {
    await deleteStaleBookings();
    await deleteStalePayments();
    console.log('Cleanup job completed successfully.');
  } catch (error) {
    console.error('Cleanup job failed:', error);
  }
});

module.exports = {
  deleteStaleBookings,
  deleteStalePayments,
};
