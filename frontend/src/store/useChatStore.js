import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";

// Helper function to get public key
const fetchPublicKey = async (userId) => {
    try {
        const res = await axiosInstance.get(`/auth/public-key/${userId}`);
        return res.data.publicKey;
    } catch (error) {
        console.error("Error fetching public key:", error);
        toast.error(error.response?.data?.message || "Failed to fetch recipient's public key.");
        return null;
    }
};

export const useChatStore = create((set, get) => ({
    messages: [],
    users: [],
    selectedUser: null, // Will now include publicKey
    isUsersLoading: false,
    isMessagesLoading: false,
    isSendingMessage: false, // Add loading state for sending

    getUsers: async () => {
        set({ isUsersLoading: true });
        try {
            // Backend getUsersForSidebar now includes publicKey
            const res = await axiosInstance.get("/messages/users");
            set({ users: res.data, isUsersLoading: false }); // Combine users and loading state update
        } catch (error) {
            console.error("Error fetching users:", error);
            toast.error(error.response?.data?.message || "Failed to fetch users");
            set({ isUsersLoading: false }); // Ensure loading is reset on error
        }
        // Removed finally block as loading is handled within try/catch
    },

    // REFACTORED getMessages: Manages its loading state more directly
    getMessages: async (userId) => {
        set({ isMessagesLoading: true, messages: [] }); // Set loading true, clear messages
        try {
            const res = await axiosInstance.get(`/messages/${userId}`);
            // Store encrypted messages directly. Decryption happens in the component.
            set({ messages: res.data, isMessagesLoading: false }); // Update messages and set loading false
        } catch (error) {
            console.error("Error fetching messages:", error);
            toast.error(error.response?.data?.message || "Failed to fetch messages");
            set({ messages: [], isMessagesLoading: false }); // Clear messages and set loading false on error
        }
        // Removed finally block as loading is handled within try/catch
    },

    sendMessage: async (encryptedBundle) => {
        set({ isSendingMessage: true });
        const { selectedUser } = get();
        if (!selectedUser) {
            set({ isSendingMessage: false });
            return toast.error("No user selected");
        }

        try {
            const res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, encryptedBundle);
            // Add the message (still encrypted) to the local state immediately
            set((state) => ({
                messages: [...state.messages, res.data],
                isSendingMessage: false // Set sending false after successful addition
            }));

        } catch (error) {
            console.error("Error sending message:", error);
            toast.error(error.response?.data?.message || "Failed to send message");
            set({ isSendingMessage: false }); // Ensure sending is reset on error
        }
        // Removed finally block
    },

    subscribeToMessages: () => {
        const socket = useAuthStore.getState().socket;
        if (!socket) return;

        socket.off("newMessage"); // Remove previous listener
        socket.on("newMessage", (newMessage) => {
            const selectedUser = get().selectedUser; // Use get() instead of destructuring
            const currentAuthUser = useAuthStore.getState().authUser;

            if (!selectedUser || !currentAuthUser) {
                console.log("Cannot process new message: No selected user or authenticated user.");
                return;
            }

            const isFromSelectedUser = newMessage.senderId === selectedUser._id;
            const isToCurrentUser = newMessage.receiverId === currentAuthUser._id;

            if (isFromSelectedUser && isToCurrentUser) {
                set((state) => ({
                    messages: state.messages.concat(newMessage)
                }));
            } else {
                console.log("Received message from other user/chat", newMessage);
            }
        });
    },

    unsubscribeFromMessages: () => {
        const socket = useAuthStore.getState().socket;
        if (socket) {
             socket.off("newMessage");
        }
    },

    // REFACTORED setSelectedUser to be more stable
    setSelectedUser: async (newUser) => {
        const currentSelectedUser = get().selectedUser;
        
        // Early return if same user
        if (currentSelectedUser?._id === newUser?._id) {
            return;
        }

        // Unsubscribe first
        get().unsubscribeFromMessages();

        // Handle null case
        if (!newUser) {
            set({ selectedUser: null, messages: [], isMessagesLoading: false });
            return;
        }

        try {
            // Set loading state
            set({ isMessagesLoading: true, messages: [] });

            // Get public key if needed
            let userWithKey = { ...newUser };
            if (!newUser.publicKey) {
                const publicKey = await fetchPublicKey(newUser._id);
                if (!publicKey) {
                    throw new Error(`Could not get public key for ${newUser.fullName}`);
                }
                userWithKey.publicKey = publicKey;
            }

            // Set user first
            set({ selectedUser: userWithKey });

            // Then get messages
            const res = await axiosInstance.get(`/messages/${userWithKey._id}`);
            set({ 
                messages: res.data,
                isMessagesLoading: false 
            });

            // Finally subscribe
            get().subscribeToMessages();

        } catch (error) {
            console.error("Error in setSelectedUser:", error);
            toast.error(error.message || "Failed to load chat");
            set({ 
                selectedUser: null, 
                messages: [], 
                isMessagesLoading: false 
            });
        }
    },
}));
