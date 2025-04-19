import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import { getReceiverSocketId, io } from "../lib/socket.js";

export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const filteredUsers = await User.find({ _id: { $ne: loggedInUserId } }).select("-password");
    res.status(200).json(filteredUsers);
  } catch (error) {
    console.error("Error in getUsersForSidebar: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const myId = req.user._id;
    
    // Lấy ID tin nhắn mới nhất đã có (nếu có)
    const { after } = req.query;
    
    // Tạo query condition
    const query = {
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    };
    
    // Nếu có tham số 'after', chỉ lấy tin nhắn mới hơn ID đó
    if (after) {
      query._id = { $gt: after };
    }
    
    const messages = await Message.find(query)
      .select('senderId receiverId encryptedContent encryptedKey encryptedKeySender iv createdAt is_file original_file_name file_type file_size file_path file_iv file_encrypted_key file_encrypted_key_sender')
      .sort({ createdAt: 1 });
      
    console.log(`[getMessages] Found ${messages.length} messages ${after ? 'after ' + after : ''} between ${myId} and ${userToChatId}`);
    
    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Thêm API endpoint đánh dấu tin nhắn đã đọc
export const markMessagesAsRead = async (req, res) => {
  try {
    const { id: senderId } = req.params;
    const receiverId = req.user._id;
    
    // Cập nhật tất cả tin nhắn chưa đọc từ người gửi này
    const result = await Message.updateMany(
      {
        senderId,
        receiverId,
        read: false
      },
      {
        $set: { read: true }
      }
    );
    
    console.log(`[markMessagesAsRead] Marked ${result.modifiedCount} messages as read from ${senderId} to ${receiverId}`);
    
    res.status(200).json({ success: true, count: result.modifiedCount });
  } catch (error) {
    console.error("Error in markMessagesAsRead: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// sendMessage now accepts the encrypted bundle including the sender's key
export const sendMessage = async (req, res) => {
  // *** ADDED BACKEND LOGGING HERE ***
  console.log(`[sendMessage Controller] Received request for receiver ${req.params.id} from sender ${req.user._id}`);
  console.log('[sendMessage Controller] Request Body Received:', req.body);

  try {
    // Destructure the expected fields, including potential file fields
    const {
        encryptedContent, 
        encryptedKey, 
        encryptedKeySender, 
        iv, 
        is_file,
        original_file_name,
        file_type,
        file_size,
        file_path,
        file_iv,
        file_encrypted_key,
        file_encrypted_key_sender
    } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    // Validate required fields conditionally
    let missingFields = [];
    if (is_file) {
        // Validation for file messages
        if (!file_path) missingFields.push('file_path');
        if (!file_iv) missingFields.push('file_iv');
        if (!file_encrypted_key) missingFields.push('file_encrypted_key');
        if (!file_encrypted_key_sender) missingFields.push('file_encrypted_key_sender');
        // Note: encryptedContent, encryptedKey etc. are allowed to be null for file messages
    } else {
        // Validation for regular text/image messages
        if (!encryptedContent) missingFields.push('encryptedContent');
        if (!encryptedKey) missingFields.push('encryptedKey');
        if (!encryptedKeySender || typeof encryptedKeySender !== 'string' || encryptedKeySender.length === 0) {
            missingFields.push('encryptedKeySender');
        }
        if (!iv) missingFields.push('iv');
    }

    if (missingFields.length > 0) {
        const errorMsg = `Missing required encrypted data field(s): ${missingFields.join(', ')}.`;
        console.error('[sendMessage Controller] Validation Error:', errorMsg, 'Body was:', req.body); // Log the exact error and body
        // Return 400 Bad Request
        return res.status(400).json({ error: errorMsg });
    }

    // If validation passes, proceed to create and save message
    const newMessage = new Message({
      senderId,
      receiverId,
      encryptedContent,
      encryptedKey,
      encryptedKeySender,
      iv,
      // Conditionally add file fields if they exist in the request
      ...(is_file && {
          is_file: true,
          original_file_name,
          file_type,
          file_size,
          file_path,
          file_iv,
          file_encrypted_key,
          file_encrypted_key_sender
      }),
      read: false // Mặc định tin nhắn chưa được đọc
    });

    await newMessage.save();
    console.log(`[sendMessage Controller] Message saved successfully: ${newMessage._id}`);

    // Emit via socket
    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", newMessage);
      console.log(`[sendMessage Controller] Emitted 'newMessage' to socket ${receiverSocketId}`);
    } else {
       console.log(`[sendMessage Controller] Receiver ${receiverId} not connected via socket.`);
    }
    
    // Cũng gửi tin nhắn về cho người gửi (để cập nhật UI)
    const senderSocketId = getReceiverSocketId(senderId);
    if (senderSocketId && senderSocketId !== receiverSocketId) {
      io.to(senderSocketId).emit("newMessage", newMessage);
    }

    // Respond to sender
    res.status(201).json(newMessage);

  } catch (error) {
    // Log the detailed error on the backend
    console.error("[sendMessage Controller] Error saving or processing message: ", error.message, error.stack);
    res.status(500).json({ error: "Internal server error while sending message." });
  }
};
