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
    return { privateKey, publicKey };
};

// Helper function to update public key on backend
const updatePublicKeyOnServer = async (publicKey) => {
    try {
        await axiosInstance.put("/auth/update-profile", { publicKey });
        console.log("Public key updated on server.");
    } catch (error) {
        console.error("Error updating public key on server:", error);
        toast.error("Failed to sync public key with server.");
    }
};

export const useAuthStore = create((set, get) => ({
    authUser: null,
    privateKey: null, // Add state for private key (loaded from localStorage)
    isSigningUp: false,
    isLoggingIn: false,
    isUpdatingProfile: false,
    isCheckingAuth: true,
    onlineUsers: [],
    socket: null,

    // Function to initialize keys
    initializeKeys: async () => {
        let storedPrivateKey = localStorage.getItem("privateKey");
        let storedPublicKey = localStorage.getItem("publicKey"); // Also store public key for quick access
        let authUserData = get().authUser; // Get current authUser state

        if (!storedPrivateKey || !storedPublicKey) {
            console.log("Generating new RSA keys...");
            const { privateKey, publicKey } = generateKeys();
            localStorage.setItem("privateKey", privateKey);
            localStorage.setItem("publicKey", publicKey);
            storedPrivateKey = privateKey;
            storedPublicKey = publicKey;
            console.log("Keys generated and stored in localStorage.");

            // If user is already logged in, update key on server immediately
            if (authUserData && authUserData._id) {
                await updatePublicKeyOnServer(publicKey);
                // Update authUser state with the new public key
                set({ authUser: { ...authUserData, publicKey: publicKey } });
            }
        } else {
            console.log("Keys loaded from localStorage.");
        }

        set({ privateKey: storedPrivateKey }); // Set privateKey in store state

        // Ensure authUser state has the correct public key from storage
        if (authUserData && authUserData.publicKey !== storedPublicKey) {
             set({ authUser: { ...authUserData, publicKey: storedPublicKey } });
             // If server key is missing/different, update it
             if (!authUserData.publicKey) {
                await updatePublicKeyOnServer(storedPublicKey);
             }
        }
    },

    checkAuth: async () => {
        set({ isCheckingAuth: true });
        try {
            const res = await axiosInstance.get("/auth/check");
            set({ authUser: res.data });
            await get().initializeKeys(); // Initialize keys after checking auth
            get().connectSocket();
        } catch (error) {
            console.log("Error in checkAuth:", error);
            set({ authUser: null, privateKey: null }); // Clear private key if not authenticated
            localStorage.removeItem("privateKey"); // Clear keys from storage on auth failure
            localStorage.removeItem("publicKey");
        } finally {
            set({ isCheckingAuth: false });
        }
    },

    signup: async (data) => {
        set({ isSigningUp: true });
        try {
            // Ensure keys are generated before signup
            await get().initializeKeys();
            const publicKey = localStorage.getItem("publicKey"); // Get the generated public key

            const res = await axiosInstance.post("/auth/signup", { ...data, publicKey }); // Send publicKey with signup data
            set({ authUser: res.data }); // Server response should now include publicKey
            toast.success("Account created successfully");
            get().connectSocket();
        } catch (error) {
            console.error("Error during signup:", error);
            toast.error(error.response?.data?.message || "Signup failed");
        } finally {
            set({ isSigningUp: false });
        }
    },

    login: async (data) => {
        set({ isLoggingIn: true });
        try {
            const res = await axiosInstance.post("/auth/login", data);
            set({ authUser: res.data }); // Server response includes publicKey
            await get().initializeKeys(); // Initialize/load keys after login
            toast.success("Logged in successfully");
            get().connectSocket();
        } catch (error) {
            console.error("Error during login:", error);
            toast.error(error.response?.data?.message || "Login failed");
            localStorage.removeItem("privateKey"); // Clear keys on login failure
            localStorage.removeItem("publicKey");
            set({ privateKey: null });
        } finally {
            set({ isLoggingIn: false });
        }
    },

    logout: async () => {
        try {
            await axiosInstance.post("/auth/logout");
            get().disconnectSocket(); // Disconnect socket first
            set({ authUser: null, privateKey: null }); // Clear user and private key state
            localStorage.removeItem("privateKey"); // Remove private key from storage
            localStorage.removeItem("publicKey"); // Remove public key from storage
            toast.success("Logged out successfully");
        } catch (error) {
            console.error("Error during logout:", error);
            toast.error(error.response?.data?.message || "Logout failed");
        }
    },

    // Modified updateProfile to potentially update keys if needed (e.g., if user clears storage)
    updateProfile: async (data) => {
        set({ isUpdatingProfile: true });
        try {
            // Ensure keys are initialized before updating profile
            await get().initializeKeys();
            const currentPublicKey = localStorage.getItem("publicKey");

            // Include currentPublicKey if not already in data, ensures server has it
            const updateData = { ...data };
            if (!updateData.publicKey && currentPublicKey) {
                updateData.publicKey = currentPublicKey;
            }

            const res = await axiosInstance.put("/auth/update-profile", updateData);
            set({ authUser: res.data }); // Update authUser with response (includes potentially updated key)
            toast.success("Profile updated successfully");
        } catch (error) {
            console.log("error in update profile:", error);
            toast.error(error.response?.data?.message || "Profile update failed");
        } finally {
            set({ isUpdatingProfile: false });
        }
    },

    connectSocket: () => {
        const { authUser } = get();
        if (!authUser || get().socket?.connected) return;

        const socket = io(BASE_URL, {
            query: {
                userId: authUser._id,
            },
        });
        socket.connect();

        set({ socket: socket });

        socket.on("getOnlineUsers", (userIds) => {
            set({ onlineUsers: userIds });
        });
    },
    disconnectSocket: () => {
        if (get().socket?.connected) get().socket.disconnect();
        set({ socket: null, onlineUsers: [] }); // Clear socket and online users
    },
}));
