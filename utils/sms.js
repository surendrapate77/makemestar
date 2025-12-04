module.exports = {
  sendSMS: async ({ to, body }) => {
    console.log(`SMS sent to ${to}: ${body}`);
  },
};