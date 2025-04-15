import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    fullName: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    profilePic: {
      type: String,
      default: "",
    },
    // Add publicKey field to store the user's public RSA key (PEM format)
    publicKey: {
        type: String,
        default: "", // Or required: true if you enforce key generation on signup
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export default User;
