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
    isFetchingMessages: false,
    hasNewMessages: false,

    getUsers: async () => {
        set({ isUsersLoading: true });
        try {
            // Backend getUsersForSidebar now includes publicKey
            const res = await axiosInstance.get("/messages/users");
            // Initialize unreadCount for each user
            const usersWithUnread = res.data.map(user => ({ ...user, unreadCount: 0 }));
            set({ users: usersWithUnread, isUsersLoading: false }); // Combine users and loading state update
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

    fetchMessages: async (userId) => {
        set({ isMessagesLoading: true });
        try {
            const res = await axiosInstance.get(`/messages/${userId}`);
            set({ messages: res.data, isMessagesLoading: false });
        } catch (error) {
            set({ isMessagesLoading: false });
            toast.error(error.response?.data?.message || "Error fetching messages");
        }
    },

    fetchNewMessages: async (userId) => {
        const state = get();
        if (!userId || state.isFetchingMessages) return;
        
        set({ isFetchingMessages: true });
        try {
            // Lấy ID tin nhắn mới nhất đã có (nếu có)
            const lastMessageId = state.messages.length > 0 
                ? state.messages[state.messages.length - 1]._id 
                : null;
            
            const res = await axiosInstance.get(`/messages/${userId}`, {
                params: { after: lastMessageId }
            });
            
            // Thêm tin nhắn mới vào state
            const newMessages = res.data;
            if (newMessages.length > 0) {
                console.log(`[Chat] Fetched ${newMessages.length} new messages`);
                set({ 
                    messages: [...state.messages, ...newMessages],
                    hasNewMessages: true 
                });
            }
        } catch (error) {
            console.error("Error fetching new messages:", error);
        } finally {
            set({ isFetchingMessages: false });
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
            // Log the bundle being sent
            console.log("useChatStore sendMessage: Sending bundle:", JSON.stringify(encryptedBundle).substring(0, 200) + "...");

            // Make the POST request - Capture the response
            const response = await axiosInstance.post(`/messages/send/${selectedUser._id}`, encryptedBundle);

            // Log the successful response from the API
            console.log("useChatStore sendMessage: Received successful response (201):", response.data);

            // Important: Even though socket might update, we still need the response
            // to know the POST itself succeeded. The socket handles real-time UI update.

            set({ isSendingMessage: false });
            // Return the successful message data (optional, but good practice)
            return response.data;

        } catch (error) {
            console.error("useChatStore sendMessage: Error sending message:", error);
            // Log the detailed error response if available
            if (error.response) {
                console.error("useChatStore sendMessage: Error response data:", error.response.data);
                console.error("useChatStore sendMessage: Error response status:", error.response.status);
            }
            const errorMsg = error.response?.data?.error || error.message || "Failed to send message";
            toast.error(`Send Error: ${errorMsg}`); // Make toast more specific
            set({ isSendingMessage: false }); // Ensure sending is reset on error
            // Rethrow or return error indicator if needed by caller
            throw error; // Rethrow to be caught by handleSendMessage if necessary
        }
    },

    subscribeToMessages: () => {
        const socket = useAuthStore.getState().socket;
        if (!socket) {
            console.warn("[subscribeToMessages] Socket not available.");
            return;
        }

        socket.off("newMessage"); // Ensure only one listener is active
        socket.on("newMessage", (newMessage) => {
            console.log('[SOCKET] Full newMessage received:', JSON.stringify(newMessage, null, 2)); // Log the entire received object
            const state = get();
            const selectedUser = state.selectedUser;
            const currentAuthUser = useAuthStore.getState().authUser;

            if (!currentAuthUser || !newMessage?._id) {
                console.warn("[SOCKET] Cannot process new message: Auth user or message ID missing.");
                return;
            }

            const senderId = newMessage.senderId;
            const receiverId = newMessage.receiverId;

            // Check if the message is relevant to the current user at all
            const isRelevantToAuthUser = senderId === currentAuthUser._id || receiverId === currentAuthUser._id;
            if (!isRelevantToAuthUser) {
                console.log("[SOCKET] Message not relevant to current user.");
                return;
            }

            // Determine if the chat with the other participant is currently open
            const isChatOpen = 
                (senderId === selectedUser?._id && receiverId === currentAuthUser._id) ||
                (receiverId === selectedUser?._id && senderId === currentAuthUser._id);

            if (isChatOpen) {
                // Chat is open: Add message to the list if not duplicate
                const messageExists = state.messages.some(msg => msg._id === newMessage._id);
                if (!messageExists) {
                    console.log("[SOCKET] Adding new message to OPEN chat state:", newMessage._id);
                    console.log("[SOCKET] Message data being added:", JSON.parse(JSON.stringify(newMessage)));
                    set((prevState) => ({ messages: [...prevState.messages, newMessage] }));
                    
                    // Automatically mark as read since chat is open
                    // Only mark read if received from the selected user
                    if (senderId === selectedUser?._id) {
                         axiosInstance.post(`/messages/read/${selectedUser._id}`).catch(err => {
                            console.error("[SOCKET] Failed to auto-mark message as read:", err);
                         });
                    }
                } else {
                     console.log("[SOCKET] Skipping duplicate message in OPEN chat:", newMessage._id);
                }
            } else {
                // Chat is NOT open: Show notification and update user list
                // Only notify if the message was sent TO the current user
                if (receiverId === currentAuthUser._id) {
                     console.log("[SOCKET] Received message for a CLOSED chat from sender:", senderId);
                    
                    // Find sender in the user list to show name and update indicator
                    const senderUser = state.users.find(user => user._id === senderId);
                    if (senderUser) {
                        toast(`New message from ${senderUser.fullName}`);
                        // Update the specific user in the list to increment unread count
                        set((prevState) => ({
                            users: prevState.users.map(user => 
                                user._id === senderId 
                                    ? { ...user, unreadCount: (user.unreadCount || 0) + 1 } 
                                    : user
                            )
                        }));
                    } else {
                         // Fallback if sender not in list (should ideally not happen)
                         toast("New message received");
                         console.warn(`[SOCKET] Sender user ${senderId} not found in the user list for notification.`);
                    }
                    // We don't add the message to the `messages` state here,
                    // it will be fetched when the user selects the chat.
                }
            }
        });
        console.log("[subscribeToMessages] 'newMessage' listener is set up.");
    },

    unsubscribeFromMessages: () => {
        const socket = useAuthStore.getState().socket;
        if (socket) {
            socket.off("newMessage");
        }
    },

    // REVISED setSelectedUser to minimize state updates and add logging
    setSelectedUser: (user) => {
        // Unsubscribe from previous user's messages if any
        get().unsubscribeFromMessages(); 
        
        const currentUserId = user?._id;
        
        // Reset the unread count for the newly selected user
        if (currentUserId) {
            set((prevState) => ({ 
                users: prevState.users.map(u => 
                    u._id === currentUserId ? { ...u, unreadCount: 0 } : u
                )
            }));
        }
        
        set({ selectedUser: user, messages: [], isLoadingMessages: true }); // Clear messages and set loading
        if (currentUserId) {
            get().fetchMessages(currentUserId);
            get().subscribeToMessages(); // Subscribe to messages for the new user
            
            // Mark messages as read for this conversation
            axiosInstance.post(`/messages/read/${currentUserId}`).catch(err => {
                console.error("Failed to mark messages as read on user selection:", err);
            });
        } else {
            // If no user is selected (e.g., deselected), clear messages and loading state
            set({ isLoadingMessages: false });
        }
    },

    // This function seems redundant now as its primary purpose (newMessage listener)
    // is handled by subscribeToMessages. We remove the newMessage handler from here.
    // If other listeners were intended here, they should be reviewed.
    setupMessageListeners: () => {
        const socket = useAuthStore.getState().socket;
        if (!socket) {
            console.warn("[setupMessageListeners] Socket not available.");
            return;
        }
        
        // Ensure other listeners (like receiveNewMessages) are correctly handled
        // and potentially moved to a more appropriate place (like initial socket connection)
        // if they are meant to be persistent.
        socket.off("receiveNewMessages"); // Ensure no duplicates if this runs multiple times
        socket.on("receiveNewMessages", (messages) => {
            console.log("[SOCKET] Received receiveNewMessages event:", messages);
            if (messages.length > 0) {
                const state = get();
                // Filter messages relevant to the *currently selected* chat 
                // AND prevent duplicates
                const filteredMessages = messages.filter(msg => {
                    const isRelevant = state.selectedUser?._id && 
                                       (msg.senderId === state.selectedUser._id || msg.receiverId === state.selectedUser._id);
                    const isDuplicate = state.messages.some(existing => existing._id === msg._id);
                    return isRelevant && !isDuplicate;
                });
                
                if (filteredMessages.length > 0) {
                    console.log("[SOCKET] Adding new messages from receiveNewMessages:", filteredMessages);
                    set((prevState) => ({ messages: [...prevState.messages, ...filteredMessages] }));
                } else {
                     console.log("[SOCKET] No relevant/new messages from receiveNewMessages event.");
                }
            } else {
                 console.log("[SOCKET] receivedNewMessages event had empty messages array.");
            }
        });
        console.log("[setupMessageListeners] Listeners (excluding newMessage) are set up.")
    },
}));