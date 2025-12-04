const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { Project, Counter, ProjectWork, ProjectPayment, Bid, User } = require('../models');
const { auth, authorizeAdmin } = require('../middleware/auth');
const multer = require('multer');
const PDFDocument = require('pdfkit'); // Ensure pdfkit is imported
const path = require('path');
const fs = require('fs');

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const projectId = req.params.projectId;
    const uploadPath = path.join('Uploads', 'projectWork', projectId);
    // Create directory if it doesn't exist
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'application/zip', 'video/mp4', 'audio/mpeg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed types: PDF, ZIP, MP4, MP3'), false);
    }
  },
});

// Helper function to get the next sequence value
async function getNextSequence(name) {
  const counter = await Counter.findOneAndUpdate(
    { name },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true }
  );
  return counter.sequence;
}

// Generate work order PDF
async function generateWorkOrder(project, payment, bidderName, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      // Create work_orders directory if it doesn't exist
      const workOrderDir = path.join('Uploads', 'work_orders');
      fs.mkdirSync(workOrderDir, { recursive: true });

      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // Header
      doc.fontSize(24).font('Helvetica-Bold').text('Music Lancer', { align: 'center' });
      doc.fontSize(18).font('Helvetica').text('Work Order for Project Commencement', { align: 'center' });
      doc.fontSize(12).text(`Generated on: ${new Date(payment.updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, { align: 'center' });
      doc.moveDown(2);

      // Project Details
      doc.fontSize(16).font('Helvetica-Bold').text('Project Details', { underline: true });
      doc.fontSize(12).font('Helvetica');
      doc.text(`Project ID: ${project.projectId}`);
      doc.text(`Project Name: ${project.projectName}`);
      doc.text(`Description: ${project.description}`);
      doc.text(`Duration: ${project.durationDays} Days`);
      doc.text(`Assigned To: ${bidderName || 'Unknown'}`);
      doc.moveDown();

      // Payment Details
      doc.fontSize(16).font('Helvetica-Bold').text('Payment Details', { underline: true });
      doc.fontSize(12).font('Helvetica');
      doc.text(`Bid Amount Rs: ${payment.bidAmount}`);
      doc.text(`Platform Fee (20%) Rs: ${payment.adminCut}`);
      doc.text(`Final Payable Amount Rs: ${payment.finalAmount}`);
      doc.moveDown();

      // Instructions
      doc.fontSize(16).font('Helvetica-Bold').text('Instructions for Completion', { underline: true });
      doc.fontSize(12).font('Helvetica');
      doc.text('1. Follow The Project Requirements: Ensure all deliverables align with the project specifications outlined in the project description.');
      doc.text('2. Maintain Quality Standards: Deliver high-quality work that meets Music Lancer’s standards for professionalism and excellence.');
      doc.text('3. Submission Process: Upload all deliverables through the Music Lancer app for review and verification by the project owner.');
      doc.text('4. Incorporate Guidelines: Follow any additional project-specific instructions provided in the project description.');
      doc.text(`5. Meet Deadlines: Complete and submit the work by the project deadline${project.deadline ? `: ${new Date(project.deadline).toLocaleDateString('en-IN')}` : ' as specified'}.`);
      doc.text('6. Payment Terms: Payment will be released to the bidder upon successful verification and approval by the platform admin.');
      doc.moveDown();

      // Support Contact
      doc.fontSize(12).font('Helvetica-Oblique').text('Note: For any issues or clarifications, contact Music Lancer support via the app or email at support@musiclancer.com.', { align: 'left' });
      doc.moveDown();

      // Footer
      doc.fontSize(12).font('Helvetica-Bold').text('Music Lancer – Empowering Creativity', { align: 'center' });
      doc.text(`Downloaded on: ${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`, { align: 'center' });
      
      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}

// POST /api/project-work/submit/:projectId - Submit work
router.post('/submit/:projectId', auth, upload.single('file'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const project = await Project.findOne({ projectId: parseInt(projectId) });
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const payment = await ProjectPayment.findOne({ projectId: parseInt(projectId), bidderId: userId });
    if (!payment || payment.paymentStatus !== 'verified') {
      return res.status(403).json({ success: false, message: 'Payment not verified' });
    }
    if (project.assignedTo.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Not assigned to this project' });
    }

    const existingSubmissions = await ProjectWork.find({ projectId: parseInt(projectId), bidderId: userId });
    const attemptNumber = existingSubmissions.length + 1;
    if (existingSubmissions.some(sub => sub.workStatus === 'rejected')) {
      return res.status(403).json({ success: false, message: 'Work rejected. Please raise a dispute.' });
    }

    const workId = await getNextSequence('workId');
    const submissionId = await getNextSequence('submissionId');
    const work = new ProjectWork({
      workId,
      submissionId,
      projectId: parseInt(projectId),
      bidderId: userId,
      ownerId: project.userId,
      fileUrl: `/Uploads/projectWork/${projectId}/${req.file.filename}`,
      attemptNumber,
      workStatus: 'pending',
    });

    await work.save();
    project.status = 'work_submitted';
    await project.save();

    res.status(201).json({ success: true, data: work });
  } catch (error) {
    console.error('Submit work error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});
// GET /api/project-work/download/:workId - Download submitted work
router.get('/download/:workId', auth, async (req, res) => {
  try {
    const { workId } = req.params;
    const userId = req.user.id;

    const work = await ProjectWork.findOne({ workId: parseInt(workId) });
    if (!work) {
      return res.status(404).json({ success: false, message: 'Work submission not found' });
    }
    if (work.bidderId.toString() !== userId && work.ownerId.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized to download file' });
    }

    const filePath = path.join(__dirname, '..', work.fileUrl);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    res.download(filePath, path.basename(filePath), (err) => {
      if (err) {
        console.error('Download error:', err);
        res.status(500).json({ success: false, message: 'Error downloading file' });
      }
    });
  } catch (error) {
    console.error('Download work error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// POST /api/project-work/dispute/:workId - Raise a dispute
router.post('/dispute/:workId', auth, async (req, res) => {
  try {
    const { workId } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    const work = await ProjectWork.findOne({ workId: parseInt(workId) });
    if (!work) {
      return res.status(404).json({ success: false, message: 'Work submission not found' });
    }
    if (work.bidderId.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized to raise dispute' });
    }
    if (work.workStatus !== 'rejected') {
      return res.status(400).json({ success: false, message: 'Cannot raise dispute unless work is rejected' });
    }
    if (work.disputeStatus !== 'none') {
      return res.status(400).json({ success: false, message: 'Dispute already raised or resolved' });
    }

    work.disputeStatus = 'raised';
    work.disputeReason = reason;
    await work.save();

    res.status(200).json({ success: true, data: work });
  } catch (error) {
    console.error('Raise dispute error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// POST /api/project-work/dispute/resolve/:workId - Admin resolves dispute
router.post('/dispute/resolve/:workId', auth, authorizeAdmin, async (req, res) => {
  try {
    const { workId } = req.params;
    const { decision, adminReason } = req.body; // decision: 'accepted' or 'rejected'

    const work = await ProjectWork.findOne({ workId: parseInt(workId) });
    if (!work) {
      return res.status(404).json({ success: false, message: 'Work submission not found' });
    }
    if (work.disputeStatus !== 'raised') {
      return res.status(400).json({ success: false, message: 'No dispute raised for this work' });
    }

    work.disputeStatus = decision === 'accepted' ? 'resolved_accepted' : 'resolved_rejected';
    work.adminDecision = adminReason;
    if (decision === 'accepted') {
      work.workStatus = 'accepted';
      const project = await Project.findOne({ projectId: work.projectId });
      if (project) {
        project.status = 'completed';
        await project.save();
      }
      const payment = await ProjectPayment.findOne({ projectId: work.projectId });
      if (payment) {
        payment.paymentStatus = 'released';
        await payment.save();
      }
    }
    await work.save();

    res.status(200).json({ success: true, data: work });
  } catch (error) {
    console.error('Resolve dispute error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// GET /api/project-work/:projectId - Get work submissions for a project
router.get('/:projectId', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    const project = await Project.findOne({ projectId: parseInt(projectId) });
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    if (project.userId.toString() !== userId && project.assignedTo.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized to view work submissions' });
    }

    const works = await ProjectWork.find({ projectId: parseInt(projectId) })
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json({ success: true, data: works });
  } catch (error) {
    console.error('Fetch work submissions error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// GET /api/project-work/work-order/:paymentId - Download work order
router.get('/work-order/:paymentId', auth, async (req, res) => {
  try {
    const { paymentId } = req.params;
    const userId = req.user.id;

    const payment = await ProjectPayment.findOne({ paymentId: parseInt(paymentId) })
      .populate('bidderId', 'fullName') // Changed from 'name' to 'fullName'
      .populate('ownerId', 'fullName');
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }
    if (payment.bidderId._id.toString() !== userId || payment.paymentStatus !== 'verified') {
      return res.status(403).json({ success: false, message: 'Unauthorized or payment not verified' });
    }

    const project = await Project.findOne({ projectId: payment.projectId });
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const outputPath = path.join('Uploads', 'work_orders', `work_order_${paymentId}.pdf`);
    await generateWorkOrder(project, payment, payment.bidderId.fullName, outputPath);

    res.download(outputPath, `work_order_${paymentId}.pdf`, (err) => {
      if (err) {
        console.error('Error sending work order:', err);
        res.status(500).json({ success: false, message: 'Error downloading work order' });
      }
      // Clean up the file after download
      fs.unlink(outputPath, (unlinkErr) => {
        if (unlinkErr) console.error('Error deleting work order file:', unlinkErr);
      });
    });
  } catch (error) {
    console.error('Generate work order error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});


router.get('/:projectId/works', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;
    const project = await Project.findOne({ projectId: parseInt(projectId) });
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    if (project.userId.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized: Only project owner can view work submissions' });
    }
    const works = await ProjectWork.find({ projectId: parseInt(projectId) })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: works });
  } catch (error) {
    console.error('Fetch work submissions error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

router.get('/download/:workId', auth, async (req, res) => {
  try {
    const { workId } = req.params;
    const userId = req.user.id;
    const work = await ProjectWork.findOne({ workId: parseInt(workId) });
    if (!work) {
      return res.status(404).json({ success: false, message: 'Work submission not found' });
    }
    const project = await Project.findOne({ projectId: work.projectId });
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    if (project.userId.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized: Only project owner can download work' });
    }
    const filePath = work.fileUrl;
    const fileName = filePath.split('/').pop();
    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error('Error sending work file:', err);
        res.status(500).json({ success: false, message: 'Error downloading work' });
      }
    });
  } catch (error) {
    console.error('Download work error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

router.post('/:workId/comment', auth, async (req, res) => {
  try {
    const { workId } = req.params;
    const { ownerComment } = req.body;
    const userId = req.user.id;
    const work = await ProjectWork.findOne({ workId: parseInt(workId) });
    if (!work) {
      return res.status(404).json({ success: false, message: 'Work submission not found' });
    }
    const project = await Project.findOne({ projectId: work.projectId });
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    if (project.userId.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized: Only project owner can add comments' });
    }
    work.ownerComment = ownerComment;
    await work.save();
    res.json({ success: true, message: 'Comment added successfully' });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

router.post('/accept/:workId', auth, async (req, res) => {
  try {
    const { workId } = req.params;
    const userId = req.user.id;
    const work = await ProjectWork.findOne({ workId: parseInt(workId) });
    if (!work) {
      return res.status(404).json({ success: false, message: 'Work submission not found' });
    }
    const project = await Project.findOne({ projectId: work.projectId });
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    if (project.userId.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized: Only project owner can accept work' });
    }
    if (work.workStatus !== 'pending') {
      return res.status(400).json({ success: false, message: 'Work is not in pending state' });
    }
    work.workStatus = 'accepted';
    project.status = 'completed';
    await work.save();
    await project.save();
    res.json({ success: true, message: 'Work accepted successfully' });
  } catch (error) {
    console.error('Accept work error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

router.post('/reject/:workId', auth, async (req, res) => {
  try {
    const { workId } = req.params;
    const userId = req.user.id;
    const work = await ProjectWork.findOne({ workId: parseInt(workId) });
    if (!work) {
      return res.status(404).json({ success: false, message: 'Work submission not found' });
    }
    const project = await Project.findOne({ projectId: work.projectId });
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    if (project.userId.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized: Only project owner can reject work' });
    }
    if (work.workStatus !== 'pending') {
      return res.status(400).json({ success: false, message: 'Work is not in pending state' });
    }
    if (work.attemptNumber < 5) {
      return res.status(400).json({ success: false, message: 'Cannot reject work: Less than 5 attempts' });
    }
    work.workStatus = 'rejected';
    project.status = 'rejected';
    await work.save();
    await project.save();
    res.json({ success: true, message: 'Work rejected successfully' });
  } catch (error) {
    console.error('Reject work error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

module.exports = router;