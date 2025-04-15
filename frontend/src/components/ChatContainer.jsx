import { useChatStore } from "../store/useChatStore";
import { useEffect, useRef } from "react";

import ChatHeader from "./ChatHeader";
import MessageInput from "./MessageInput";
import MessageSkeleton from "./skeletons/MessageSkeleton";
import Message from "./Message"; // Import the new Message component

const ChatContainer = () => {
    const {
        messages, // These are now encrypted messages
        isMessagesLoading,
        selectedUser,
    } = useChatStore((state) => ({
        messages: state.messages,
        isMessagesLoading: state.isMessagesLoading,
        selectedUser: state.selectedUser,
    }));
    const messageEndRef = useRef(null);

    // Removed useEffect for getMessages, subscribe, unsubscribe - this is now handled in setSelectedUser in useChatStore

    useEffect(() => {
        // Scroll to bottom whenever messages change
        if (messageEndRef.current) {
            messageEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    return (
        <div className="flex-1 flex flex-col overflow-auto">
            <ChatHeader />

            {/* Message display area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {/* Show loading skeleton while messages are loading */}
                {isMessagesLoading && (
                    <>
                        <MessageSkeleton />
                        <MessageSkeleton />
                        <MessageSkeleton />
                    </>
                )}

                {/* Render decrypted messages using the Message component */}
                {!isMessagesLoading && messages.map((message, index) => (
                    <Message
                        key={message._id || `msg-${index}`} // Use index as fallback key if _id isn't immediately available
                        message={message}
                    />
                ))}

                {/* Empty div to scroll to */} 
                <div ref={messageEndRef} /> 
            </div>

            <MessageInput />
        </div>
    );
};
export default ChatContainer;
