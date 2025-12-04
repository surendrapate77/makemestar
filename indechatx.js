const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const studioRoutes = require('./routes/studio');
const bookingRoutes = require('./routes/booking');
const skillCategoryRoutes = require('./routes/skillCategory');
const uploadProfilePhotoRoutes = require('./routes/uploadProfilePhoto');
const projectRoutes = require('./routes/project');
const reviewRoutes = require('./routes/review');
const bidRoutes = require('./routes/bid');
const chatRoutes = require('./routes/chat');
const subscriptionRoutes = require('./routes/subscription');
const adminRouter = require('./routes/admin');
const subscriptionPlanRoutes = require('./routes/subscription_plan_routes');
const { ChatMessage, Project } = require('./models');
const path = require('path');
require('dotenv').config(); // Load environment variables at the top

// Log to verify environment variables
console.log('Environment variables loaded:', {
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASS: process.env.EMAIL_PASS ? '[REDACTED]' : undefined,
  UPI_ID: process.env.UPI_ID,
});

// Initialize Express and HTTP server
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
      origin: ['http://localhost:8080', 'http://localhost:8081', 'http://10.0.2.2:8080'], // Allow multiple origins for 
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(express.json());
app.use(cors({
   origin: ['http://localhost:8080', 'http://localhost:8081', 'http://10.0.2.2:8080'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}));
app.use('/uploads', express.static(path.join(__dirname, 'Uploads')));
app.use('/profilepic', express.static(path.join(__dirname, 'profilepic')));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB Now[Connected]'))
  .catch(err => console.log(err));

// Routes
app.use('/auth', authRoutes);
app.use('/admin', adminRouter);
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/studio', studioRoutes);
app.use('/api/booking', bookingRoutes);
app.use('/api/skillCategory', skillCategoryRoutes);
app.use('/api/uploadProfilePhoto', uploadProfilePhotoRoutes);
app.use('/api/project', projectRoutes);
app.use('/api/review', reviewRoutes);
app.use('/api/bid', bidRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/subscription', subscriptionPlanRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Store current room
  let currentRoom = null;

  // Join a chat room
  socket.on('joinRoom', async ({ chatRoomId, userId, projectId }) => {
    try {
      const { Project, ProjectPayment, ChatMessage, User } = require('./models');
      const project = await Project.findOne({ projectId: parseInt(projectId) });
      const payment = await ProjectPayment.findOne({ projectId: parseInt(projectId) });
      if (!project || !payment || payment.paymentStatus !== 'verified') {
        socket.emit('error', { message: 'Invalid project or payment not verified' });
        return;
      }
      if (project.userId.toString() !== userId && project.assignedTo.toString() !== userId) {
        socket.emit('error', { message: 'Unauthorized to join chat' });
        return;
      }
      // Leave previous room if any
      if (currentRoom) {
        socket.leave(currentRoom);
        console.log(`User ${userId} left room ${currentRoom}`);
      }
      socket.join(chatRoomId);
      currentRoom = chatRoomId;
      console.log(`User ${userId} joined room ${chatRoomId}`);
      socket.emit('joinedRoom', { chatRoomId });
    } catch (error) {
      console.error('Join room error:', error);
      socket.emit('error', { message: 'Server error' });
    }
  });

  // Handle sending a message
  socket.on('sendMessage', async ({ chatRoomId, userId, projectId, message }) => {
    try {
      const { Project, ProjectPayment, ChatMessage, User } = require('./models');
      const project = await Project.findOne({ projectId: parseInt(projectId) });
      const payment = await ProjectPayment.findOne({ projectId: parseInt(projectId) });
      if (!project || !payment || payment.paymentStatus !== 'verified') {
        socket.emit('error', { message: 'Invalid project or payment not verified' });
        return;
      }
      if (project.userId.toString() !== userId && project.assignedTo.toString() !== userId) {
        socket.emit('error', { message: 'Unauthorized to send message' });
        return;
      }
      const sender = await User.findById(userId);
      const chatMessage = new ChatMessage({
        projectId: parseInt(projectId),
        chatRoomId,
        senderId: userId,
        message,
      });
      await chatMessage.save();
      io.to(chatRoomId).emit('message', {
        senderId: userId,
        message,
        createdAt: chatMessage.createdAt,
        'senderId.name': sender.name,
      });
      console.log(`Message sent in room ${chatRoomId}: ${message}`);
    } catch (error) {
      console.error('Send message error:', error);
      socket.emit('error', { message: 'Server error' });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (currentRoom) {
      socket.leave(currentRoom);
      console.log(`User left room ${currentRoom} on disconnect`);
      currentRoom = null;
    }
  });
});


// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on [Port ${PORT}]`));
console.log('Starting cleanup job...');