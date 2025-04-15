import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Stores the AES-GCM encrypted message content (text or image URL)
    encryptedContent: {
      type: String, // Base64 encoded ciphertext
      required: true,
    },
    // Stores the AES key, encrypted with the recipient's RSA public key
    encryptedKey: {
        type: String, // Base64 encoded
        required: true,
    },
    // Stores the Initialization Vector (IV) for AES-GCM
    iv: {
        type: String, // Base64 encoded
        required: true,
    },
    // Stores the Authentication Tag for AES-GCM
    authTag: {
        type: String, // Base64 encoded
        required: true,
    },
    // Optional: Keep original fields for compatibility or remove them
    // text: { type: String },
    // image: { type: String },
  },
  { timestamps: true }
);

const Message = mongoose.model("Message", messageSchema);

export default Message;
