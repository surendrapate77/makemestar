const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// SABKO ALLOW KAR DIYA — MOBILE, WEB, EMULATOR SAB SE CONNECT HOGA
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  }
});

app.use(cors({
  origin: "*",
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'Uploads')));
app.use('/profilepic', express.static(path.join(__dirname, 'profilepic')));

app.use(express.json());

// Socket.IO chat
require('./routes/chat')(io);

// MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB Now[Connected]'))
  .catch(err => console.log('MongoDB Error:', err));

// Routes
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
app.use('/api/tasks', tasksRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/events', eventsRoutes);

// Server start
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on [Port ${PORT}]`);
  console.log('CORS: * (All origins allowed)');
});

console.log('Starting cleanup job...');