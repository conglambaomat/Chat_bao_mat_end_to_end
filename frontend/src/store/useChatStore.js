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
    },

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
    },

    sendMessage: async (encryptedBundle) => {
        set({ isSendingMessage: true });
        const { selectedUser } = get();
        if (!selectedUser) {
            set({ isSendingMessage: false });
            return toast.error("No user selected");
        }

        try {
            // Make the POST request
            await axiosInstance.post(`/messages/send/${selectedUser._id}`, encryptedBundle);

            // ---- STATE UPDATE REMOVED ----
            // The "newMessage" event received via socket will handle adding the message to the list.

            // Just set loading state back to false
            set({ isSendingMessage: false });

        } catch (error) {
            console.error("Error sending message:", error);
            // Extract backend error message if available
            const errorMsg = error.response?.data?.error || error.message || "Failed to send message";
            toast.error(errorMsg);
            set({ isSendingMessage: false }); // Ensure sending is reset on error
        }
    },

    subscribeToMessages: () => {
        const socket = useAuthStore.getState().socket;
        if (!socket) return;

        socket.off("newMessage"); // Ensure no duplicate listeners
        socket.on("newMessage", (newMessage) => {
            // console.log("Received newMessage event:", newMessage); // Optional: Debug log
            const selectedUser = get().selectedUser;
            const currentAuthUser = useAuthStore.getState().authUser;

            if (!currentAuthUser) {
                console.log("Cannot process new message: Authenticated user not found.");
                return;
            }

            // Check if the message object or its _id is valid
            if (!newMessage || !newMessage._id) {
                console.log("Received invalid newMessage object:", newMessage);
                return;
            }

            // Determine if the message belongs to the currently selected chat
            const isFromSelectedUser = newMessage.senderId === selectedUser?._id;
            const isToCurrentUser = newMessage.receiverId === currentAuthUser._id;
            const isFromCurrentUser = newMessage.senderId === currentAuthUser._id;
            const isToSelectedUser = newMessage.receiverId === selectedUser?._id;

            // Add message if it's between the current user and the selected user
            if ((isFromSelectedUser && isToCurrentUser) || (isFromCurrentUser && isToSelectedUser)) {
                // Check for duplicates using _id before adding
                const messageExists = get().messages.some(msg => msg._id === newMessage._id);
                if (!messageExists) {
                    // console.log("Adding new message to state:", newMessage); // Optional: Debug log
                    set((state) => ({
                        // Use concat or spread, ensure immutability
                        messages: [...state.messages, newMessage]
                    }));
                }
                // else {
                //    console.log("Skipping duplicate message received via socket:", newMessage._id); // Optional: Debug log
                // }
            }
            // else {
                // console.log("Received message not for current chat:", newMessage); // Optional: Debug log
                // Handle notification for other chats if needed
            // }
        });
    },

    unsubscribeFromMessages: () => {
        const socket = useAuthStore.getState().socket;
        if (socket) {
            socket.off("newMessage");
        }
    },

    // REVISED setSelectedUser to minimize state updates and add logging
    setSelectedUser: async (newUser) => {
        const currentSelectedUser = get().selectedUser;

        // 1. Early return if same user
        if (currentSelectedUser?._id === newUser?._id) {
            return;
        }

        // 2. Unsubscribe from previous user's messages
        get().unsubscribeFromMessages();

        // 3. Handle null case
        if (!newUser) {
            set({ selectedUser: null, messages: [], isMessagesLoading: false });
            return;
        }

        // 4. Set initial loading state (optimistically set user, clear messages)
        set({ selectedUser: newUser, isMessagesLoading: true, messages: [] });

        try {
            let finalUser = { ...newUser }; // Start with the input user

            // 5. Fetch public key if needed
            if (!finalUser.publicKey) {
                const publicKey = await fetchPublicKey(finalUser._id);
                if (!publicKey) {
                    throw new Error(`Could not get public key for ${finalUser.fullName}`);
                }
                finalUser.publicKey = publicKey;
            }

            // 6. Fetch messages using the final user ID
            const res = await axiosInstance.get(`/messages/${finalUser._id}`);
            const fetchedMessages = res.data;

            // 7. Final state update: Set messages, clear loading, confirm final user object
            if (get().selectedUser?._id === finalUser._id) {
                set({
                    messages: fetchedMessages,
                    isMessagesLoading: false,
                    selectedUser: finalUser // Ensure the user object with the key is stored
                });

                // 8. Subscribe to messages for the new user *after* state is stable
                get().subscribeToMessages();
            }

        } catch (error) {
            console.error(`setSelectedUser: Error processing user ${newUser._id}:`, error);
            toast.error(error.message || "Failed to load chat");

            // 9. Catch errors: Reset state only if the error belongs to the currently selected user
            set((state) => {
                if (state.selectedUser?._id === newUser._id) {
                    return { selectedUser: null, messages: [], isMessagesLoading: false };
                }
                return {}; // Return empty object to indicate no state change
            });
        }
    },

}));