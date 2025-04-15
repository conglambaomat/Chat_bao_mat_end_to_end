import { create } from "zustand";
import { axiosInstance } from "../lib/axios.js";
import toast from "react-hot-toast";
import { io } from "socket.io-client";
import { JSEncrypt } from "jsencrypt"; // Import JSEncrypt

const BASE_URL = import.meta.env.MODE === "development" ? "http://localhost:5001" : "/";

// Helper function to generate RSA keys
const generateKeys = () => {
    const crypt = new JSEncrypt({ default_key_size: 2048 }); // Use 2048-bit keys
    const privateKey = crypt.getPrivateKey();
    const publicKey = crypt.getPublicKey();
    console.log("New RSA keys generated.");
    return { privateKey, publicKey };
};

// // Helper function to update public key on backend (Keep for potential future use if needed)
// const updatePublicKeyOnServer = async (publicKey) => {
//     try {
//         await axiosInstance.put("/auth/update-profile", { publicKey });
//         console.log("Public key updated on server.");
//     } catch (error) {
//         console.error("Error updating public key on server:", error);
//         toast.error("Failed to sync public key with server.");
//     }
// };

export const useAuthStore = create((set, get) => ({
    authUser: null,
    privateKey: null, // Private key state
    isSigningUp: false,
    isLoggingIn: false,
    isUpdatingProfile: false,
    isCheckingAuth: true,
    onlineUsers: [],
    socket: null,

    // Function to load keys FROM localStorage only
    loadKeysFromStorage: () => {
        const storedPrivateKey = localStorage.getItem("privateKey");
        // const storedPublicKey = localStorage.getItem("publicKey"); // Optional: Load public key too if needed directly

        if (storedPrivateKey) {
            set({ privateKey: storedPrivateKey });
            console.log("Private key loaded from localStorage.");
        } else {
            set({ privateKey: null }); // Ensure privateKey is null if not found
            console.log("Private key not found in localStorage.");
        }
        // We don't generate keys here anymore
    },

    checkAuth: async () => {
        set({ isCheckingAuth: true });
        try {
            const res = await axiosInstance.get("/auth/check");
            set({ authUser: res.data }); // Set user data first
            get().loadKeysFromStorage(); // Then load keys associated with this device storage
            get().connectSocket();
        } catch (error) {
            console.log("CheckAuth: User not authenticated or error occurred.");
            set({ authUser: null, privateKey: null }); // Clear user and key
            // Don't clear localStorage here, maybe user just needs to log in again
        } finally {
            set({ isCheckingAuth: false });
        }
    },

    signup: async (data) => {
        set({ isSigningUp: true });
        let generatedPrivateKey = null; // Keep track of the generated private key
        try {
            // 1. Generate NEW keys for the new user
            const { privateKey, publicKey } = generateKeys();
            generatedPrivateKey = privateKey; // Store for setting state later

            // 2. Save keys to localStorage for this device
            localStorage.setItem("privateKey", privateKey);
            localStorage.setItem("publicKey", publicKey);
            console.log("New keys saved to localStorage during signup.");

            // 3. Send signup data INCLUDING the new public key
            const res = await axiosInstance.post("/auth/signup", { ...data, publicKey });

            // 4. Set auth state (user data + the generated private key)
            set({ authUser: res.data, privateKey: generatedPrivateKey });
            toast.success("Account created successfully");
            get().connectSocket();

        } catch (error) {
            console.error("Error during signup:", error);
            toast.error(error.response?.data?.message || "Signup failed");
            // Clear keys from storage if signup fails to prevent dangling keys
            localStorage.removeItem("privateKey");
            localStorage.removeItem("publicKey");
            set({ privateKey: null }); // Clear private key state
        } finally {
            set({ isSigningUp: false });
        }
    },

    login: async (data) => {
        set({ isLoggingIn: true });
        try {
            const res = await axiosInstance.post("/auth/login", data);
            // Set authUser first (contains public key from DB)
            set({ authUser: res.data });
            // Attempt to load the private key corresponding to this device/browser
            get().loadKeysFromStorage();
            toast.success("Logged in successfully");
            get().connectSocket();
        } catch (error) {
            console.error("Error during login:", error);
            toast.error(error.response?.data?.message || "Login failed");
            // Don't clear localStorage keys on login failure, user might try again
            set({ authUser: null, privateKey: null }); // Clear state
        } finally {
            set({ isLoggingIn: false });
        }
    },

    logout: async () => {
        try {
            await axiosInstance.post("/auth/logout");
        } catch (error) {
             // Log error but proceed with client-side cleanup
             console.error("Error during server logout:", error);
             toast.error(error.response?.data?.message || "Server logout failed, clearing client state.");
        } finally {
            // Always perform client-side cleanup
            get().disconnectSocket(); // Disconnect socket first
            set({ authUser: null, privateKey: null }); // Clear user and private key state
            localStorage.removeItem("privateKey"); // Remove private key from storage
            localStorage.removeItem("publicKey"); // Remove public key from storage
            console.log("Cleared keys from localStorage on logout.");
            toast.success("Logged out successfully");
        }
    },

    // updateProfile might need adjustment if public key needs changing,
    // but for now, focus is on fixing the decryption loop.
    updateProfile: async (data) => {
        set({ isUpdatingProfile: true });
        try {
            // We don't need to load/check keys here unless updating the key itself
            const res = await axiosInstance.put("/auth/update-profile", data);
            set({ authUser: res.data });
            toast.success("Profile updated successfully");
        } catch (error) {
            console.log("error in update profile:", error);
            toast.error(error.response?.data?.message || "Profile update failed");
        } finally {
            set({ isUpdatingProfile: false });
        }
    },

    connectSocket: () => {
       const { authUser, socket } = get(); // Get current socket state too
        // Prevent reconnecting if already connected
        if (!authUser || socket?.connected) {
            // console.log("Socket connection skipped (no authUser or already connected)");
            return;
        }

        console.log(`Attempting to connect socket for user: ${authUser._id}`);
        const newSocket = io(BASE_URL, {
            query: {
                userId: authUser._id,
            },
            // Optional: Add reconnection attempts, etc.
            // reconnectionAttempts: 5,
            // reconnectionDelay: 1000,
        });

        newSocket.on("connect", () => {
             console.log("Socket connected:", newSocket.id);
             set({ socket: newSocket }); // Update state only on successful connect
        });

        newSocket.on("disconnect", (reason) => {
            console.log("Socket disconnected:", reason);
             // Check if disconnect was initiated by client (logout) or server/network issue
             // No need to clear socket state here if it might reconnect,
             // but handle potential cleanup if disconnect is permanent.
             // set({ socket: null }); // Maybe only if reason is 'io client disconnect'
        });

        newSocket.on("connect_error", (error) => {
            console.error("Socket connection error:", error);
            toast.error(`Socket connection failed: ${error.message}`);
            // Don't set socket to null immediately, io attempts reconnection by default
        });


        newSocket.on("getOnlineUsers", (userIds) => {
            set({ onlineUsers: userIds });
        });

        // No need to call connect() explicitly, io() initiates connection

    },
    disconnectSocket: () => {
        const currentSocket = get().socket;
        if (currentSocket?.connected) {
            console.log("Disconnecting socket explicitly.");
            currentSocket.disconnect();
        }
         // Always clear socket state and online users on explicit disconnect
        set({ socket: null, onlineUsers: [] });
    },
}));