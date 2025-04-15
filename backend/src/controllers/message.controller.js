import User from "../models/user.model.js";
import Message from "../models/message.model.js";

// Remove cloudinary import if image upload is handled client-side before encryption
// import cloudinary from "../lib/cloudinary.js"; 
import { getReceiverSocketId, io } from "../lib/socket.js";

export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    // Include publicKey in the selection
    const filteredUsers = await User.find({ _id: { $ne: loggedInUserId } }).select("-password"); 

    res.status(200).json(filteredUsers);
  } catch (error) {
    console.error("Error in getUsersForSidebar: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// getMessages now returns the encrypted messages as stored in the DB
export const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const myId = req.user._id;

    // Find messages based on sender/receiver
    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    }).sort({ createdAt: 1 }); // Sort by creation time

    // Return the messages as they are (encrypted)
    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// sendMessage now accepts the encrypted bundle from the client
export const sendMessage = async (req, res) => {
  try {
    // Receive the encrypted bundle from the client
    const { encryptedContent, encryptedKey, iv, authTag } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    // Validate required fields
    if (!encryptedContent || !encryptedKey || !iv || !authTag) {
        return res.status(400).json({ error: "Missing required encrypted data fields." });
    }

    // No server-side decryption or image upload needed here anymore
    // The client handles encryption and potential image uploads before encrypting the URL

    const newMessage = new Message({
      senderId,
      receiverId,
      encryptedContent,
      encryptedKey,
      iv,
      authTag,
    });

    await newMessage.save();

    // Emit the new message via socket to the receiver
    // The receiver's client will handle decryption
    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      // Send the full message object as saved in DB
      io.to(receiverSocketId).emit("newMessage", newMessage); 
    }

    // Send the saved message back to the sender
    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error in sendMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
