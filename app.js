const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const tasksRoutes = require('./routes/tasks');
const leaderboardRoutes = require('./routes/leaderboard');
const eventsRoutes = require('./routes/events');
const studioRoutes = require('./routes/studio');
const bookingRoutes = require('./routes/booking');
const youtubeRoutes = require('./routes/youtube');
const skillCategoryRoutes = require('./routes/skillCategory');
const uploadProfilePhotoRoutes = require('./routes/uploadProfilePhoto');
const projectRoutes = require('./routes/project');
const projectWorkRoutes = require('./routes/projectWork');
const reviewRoutes = require('./routes/review');
const bidRoutes = require('./routes/bid');
const chatRoutes = require('./routes/chat');
const subscriptionRoutes = require('./routes/subscription');
const paymentTransactionsRoutes = require('./routes/paymentTransactions');
const adminRouter = require('./routes/admin');
const subscriptionPlanRoutes = require('./routes/subscription_plan_routes');
const path = require('path');
require('dotenv').config();



// Initialize Express and HTTP server
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:8080', 'http://localhost:8081', 'http://10.0.2.2:8080'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Initialize Socket.IO chat logic
require('./routes/chat')(io);

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
app.use('/api/projectWork', projectWorkRoutes);
app.use('/api/review', reviewRoutes);
app.use('/api/bid', bidRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/subscription', subscriptionPlanRoutes);
app.use('/api/payments', paymentTransactionsRoutes);
app.use('/api/youtube', require('./routes/youtube'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/leaderboard', require('./routes/leaderboard'));
app.use('/api/events', require('./routes/events'));

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on [Port ${PORT}]`));
console.log('Starting cleanup job...');