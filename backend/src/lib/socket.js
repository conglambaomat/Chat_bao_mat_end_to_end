import { Server } from "socket.io";
import http from "http";
import express from "express";
import Message from "../models/message.model.js";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173"],
    credentials: true, // Cho phép gửi cookies qua CORS
  },
  pingTimeout: 60000, // Tăng thời gian timeout
});

// Mapping để lưu trữ người dùng online: {userId: socketId}
const userSocketMap = {};

export function getReceiverSocketId(userId) {
  return userSocketMap[userId];
}

// Hàm tìm tin nhắn mới cho một cặp người dùng
async function findNewMessagesForUser(userId, authUserId) {
  try {
    // Tìm các tin nhắn giữa hai người dùng
    const messages = await Message.find({
      $or: [
        { sender: userId, receiver: authUserId },
        { sender: authUserId, receiver: userId }
      ]
    }).sort({ createdAt: -1 }).limit(50);
    
    return messages.reverse();
  } catch (error) {
    console.error("Error finding new messages:", error);
    return [];
  }
}

io.on("connection", (socket) => {
  console.log("A user connected", socket.id);

  const userId = socket.handshake.query.userId;
  
  if (userId) {
    // Lưu socket ID vào mapping
    userSocketMap[userId] = socket.id;
    console.log(`User ${userId} mapped to socket ${socket.id}`);
    
    // Gửi danh sách người dùng online
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  }

  // Xử lý sự kiện yêu cầu danh sách người dùng online
  socket.on("getOnlineUsers", () => {
    io.to(socket.id).emit("getOnlineUsers", Object.keys(userSocketMap));
  });
  
  // Xử lý sự kiện yêu cầu tin nhắn mới
  socket.on("getNewMessages", async ({ userId }) => {
    if (!userId) return;
    
    try {
      const authUserId = Object.keys(userSocketMap).find(
        key => userSocketMap[key] === socket.id
      );
      
      if (authUserId) {
        const messages = await findNewMessagesForUser(userId, authUserId);
        socket.emit("receiveNewMessages", messages);
      }
    } catch (error) {
      console.error("Error in getNewMessages:", error);
    }
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected", socket.id);
    
    // Xác định userId dựa trên socketId
    const disconnectedUserId = Object.keys(userSocketMap).find(
      key => userSocketMap[key] === socket.id
    );
    
    if (disconnectedUserId) {
      console.log(`User ${disconnectedUserId} disconnected`);
      delete userSocketMap[disconnectedUserId];
      io.emit("getOnlineUsers", Object.keys(userSocketMap));
    }
  });
});

export { io, app, server };
