import express from "express";
import { checkAuth, login, logout, signup, updateProfile, getPublicKey } from "../controllers/auth.controller.js"; // Import getPublicKey
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);

router.put("/update-profile", protectRoute, updateProfile);

router.get("/check", protectRoute, checkAuth);

// Add route to get public key by user ID
router.get("/public-key/:userId", protectRoute, getPublicKey);

export default router;
