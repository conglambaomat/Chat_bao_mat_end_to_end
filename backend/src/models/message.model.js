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
    },
    // Stores the AES key, encrypted with the RECIPIENT's RSA public key
    encryptedKey: { // Consider renaming to encryptedKeyRecipient for clarity
        type: String, // Base64 encoded
    },
    // Stores the AES key, encrypted with the SENDER's RSA public key
    encryptedKeySender: { // Added field for sender's encrypted key
        type: String, // Base64 encoded
    },
    // Stores the Initialization Vector (IV) for AES-GCM
    iv: {
        type: String, // Base64 encoded
    },
    // Theo dõi trạng thái đã đọc
    read: {
        type: Boolean,
        default: false,
    },
    // -- Fields for File Attachments --
    is_file: {
      type: Boolean,
      default: false,
    },
    original_file_name: {
      type: String,
      default: null, // Only present if is_file is true
    },
    file_type: {
        type: String,
        default: null, // Only present if is_file is true
    },
    file_size: {
        type: Number,
        default: null, // Only present if is_file is true
    },
    file_path: { // Stores the unique filename on the server (e.g., uuid.ext)
        type: String,
        default: null, // Only present if is_file is true
    },
    file_iv: { type: String }, // IV used specifically for encrypting the file content
    file_encrypted_key: { type: String }, // File's AES key encrypted for recipient (optional, if different from message key)
    file_encrypted_key_sender: { type: String }, // File's AES key encrypted for sender (optional)
    // -- End of File Attachment Fields --
    // authTag is implicitly handled by AES-GCM in Web Crypto API, removing field
    // authTag: {
    //     type: String,
    // },
    // Optional: Keep original fields for compatibility or remove them
    // text: { type: String },
    // image: { type: String },
  },
  { timestamps: true }
);

const Message = mongoose.model("Message", messageSchema);

export default Message;
