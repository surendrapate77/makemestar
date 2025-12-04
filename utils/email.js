const nodemailer = require('nodemailer');

// Configure nodemailer transporter with Gmail service
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verify SMTP connection on startup
transporter.verify((error, success) => {
  if (error) {
    console.error('SMTP connection error:', {
      error: error.message,
      code: error.code,
      command: error.command,
    });
  } else {
    console.log('SMTP connection verified successfully');
  }
});

// Function to send bid acceptance email to the bidder
async function sendBidAcceptedEmail(toEmail, projectName, projectId, bidAmount) {
  // Validate environment variables
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('Email configuration error: Missing environment variables', {
      EMAIL_USER: process.env.EMAIL_USER,
      EMAIL_PASS: process.env.EMAIL_PASS ? '[REDACTED]' : undefined,
    });
    throw new Error('Email configuration incomplete');
  }

  const mailOptions = {
    from: process.env.EMAIL_USER, // Sender email
    to: toEmail, // Recipient email (bidder)
    subject: `Bid Accepted for Project ${projectId}`, // Email subject
    html: `
      <h2>Bid Accepted!</h2>
      <p>Your bid for project "${projectName}" (Project ID: ${projectId}) with amount ₹${bidAmount} has been accepted.</p>
      <p>Please complete the work as per the project requirements. Payment will be released after verification of the submitted work.</p>
      <p>Thank you for using Recording Studio App!</p>
    `, // Email body in HTML
  };

  try {
    await transporter.sendMail(mailOptions); // Send the email
    console.log(`Email sent to ${toEmail} for project ${projectId}`);
  } catch (error) {
    console.error('Error sending email:', {
      toEmail,
      projectId,
      error: error.message,
      code: error.code,
      command: error.command,
    });
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

module.exports = { sendBidAcceptedEmail };