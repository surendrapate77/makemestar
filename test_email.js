require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function testEmail() {
  console.log('Testing email with config:', {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS ? '[REDACTED]' : undefined,
  });
  try {
    await transporter.verify(); // Verify SMTP connection
    console.log('SMTP connection verified successfully');
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: 'surendrapate@gmail.com', // Replace with a test recipient email
      subject: 'Test Email from Recording Studio',
      text: 'This is a test email to verify Nodemailer configuration.',
    });
    console.log('Test email sent successfully');
  } catch (error) {
    console.error('Test email error:', {
      error: error.message,
      code: error.code,
      command: error.command,
    });
  }
}

testEmail();