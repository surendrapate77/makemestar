const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const { ChatMessage, Project } = require('../models');


// Map to track online users: { userId: socket.id }
const onlineUsers = new Map();

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Store current room
    let currentRoom = null;
    let userId = null;

    // Join a chat room with userId
    socket.on('joinRoom', ({ chatRoomId, userId: incomingUserId }) => {
      if (!chatRoomId || !incomingUserId) {
        console.error('Join room error: Missing chatRoomId or userId', { chatRoomId, incomingUserId });
        return;
      }
      socket.join(chatRoomId);
      currentRoom = chatRoomId;
      userId = incomingUserId;
      onlineUsers.set(userId, socket.id);
      console.log(`User ${socket.id} (userId: ${userId}) joined room ${chatRoomId}`);

      // Broadcast online users to the room
      const roomUsers = Array.from(io.sockets.adapter.rooms.get(chatRoomId) || [])
        .map((socketId) => {
          const foundUserId = Array.from(onlineUsers.entries()).find(
            ([, sid]) => sid === socketId
          )?.[0];
          return foundUserId;
        })
        .filter((id) => id); // Remove undefined

      io.to(chatRoomId).emit('onlineUsers', roomUsers);
      console.log(`Broadcasted online users to ${chatRoomId}:`, roomUsers);
    });

    socket.on('sendMessage', async (data) => {
      try {
        const { chatRoomId, senderId, message } = data;
        if (!chatRoomId || !senderId || !message) {
          console.error('Send message error: Missing required fields', data);
          return;
        }

        // Extract projectId from chatRoomId (e.g., chat_80 -> 80)
        const projectIdMatch = chatRoomId.match(/^chat_(\d+)/);
        if (!projectIdMatch || !projectIdMatch[1]) {
          console.error('Send message error: Invalid chatRoomId format', chatRoomId);
          return;
        }
        const projectId = parseInt(projectIdMatch[1]);
        if (isNaN(projectId)) {
          console.error('Send message error: projectId is NaN', chatRoomId);
          return;
        }

        // Verify project exists
        const project = await Project.findOne({ projectId });
        if (!project) {
          console.error('Send message error: Project not found for projectId', projectId);
          return;
        }

        // Save message to ChatMessage collection
        const chatMessage = new ChatMessage({
          chatRoomId,
          senderId,
          message,
          projectId,
          createdAt: new Date(),
        });
        await chatMessage.save();

        console.log(`Message sent in room ${chatRoomId}: ${message}`);
        io.to(chatRoomId).emit('message', {
          senderId: senderId.toString(),
          message,
          createdAt: chatMessage.createdAt,
        });
      } catch (error) {
        console.error('Send message error:', error);
      }
    });

    socket.on('leaveRoom', (chatRoomId) => {
      socket.leave(chatRoomId);
      console.log(`User ${socket.id} (userId: ${userId}) left room ${chatRoomId}`);
      currentRoom = null;

      // Broadcast updated online users
      if (chatRoomId) {
        const roomUsers = Array.from(io.sockets.adapter.rooms.get(chatRoomId) || [])
          .map((socketId) => {
            const foundUserId = Array.from(onlineUsers.entries()).find(
              ([, sid]) => sid === socketId
            )?.[0];
            return foundUserId;
          })
          .filter((id) => id);
        io.to(chatRoomId).emit('onlineUsers', roomUsers);
        console.log(`Broadcasted online users to ${chatRoomId}:`, roomUsers);
      }
    });

    socket.on('disconnect', () => {
      if (userId) {
        onlineUsers.delete(userId);
        console.log(`User ${socket.id} (userId: ${userId}) disconnected`);
        if (currentRoom) {
          socket.leave(currentRoom);
          console.log(`User ${socket.id} left room ${currentRoom} on disconnect`);

          // Broadcast updated online users
          const roomUsers = Array.from(io.sockets.adapter.rooms.get(currentRoom) || [])
            .map((socketId) => {
              const foundUserId = Array.from(onlineUsers.entries()).find(
                ([, sid]) => sid === socketId
              )?.[0];
              return foundUserId;
            })
            .filter((id) => id);
          io.to(currentRoom).emit('onlineUsers', roomUsers);
          console.log(`Broadcasted online users to ${currentRoom}:`, roomUsers);
        }
      }
      currentRoom = null;
      userId = null;
    });
  });
};