import { useChatStore } from "../store/useChatStore";
import { useEffect, useRef } from "react";

import ChatHeader from "./ChatHeader";
import MessageInput from "./MessageInput";
import MessageSkeleton from "./skeletons/MessageSkeleton";
import Message from "./Message"; // Import the new Message component

const ChatContainer = () => {
    // Select state slices individually for better performance and stability
    const messages = useChatStore((state) => state.messages);
    const isMessagesLoading = useChatStore((state) => state.isMessagesLoading);
    // We might not need selectedUser directly here if only ChatHeader uses it.
    // ChatHeader can select it itself if needed.
    // const selectedUser = useChatStore((state) => state.selectedUser);

    const messageEndRef = useRef(null);

    // Removed useEffect for getMessages, subscribe, unsubscribe - handled in useChatStore

    useEffect(() => {
        // Scroll to bottom whenever messages change
        // Use setTimeout to ensure scrolling happens after render potentially settles
        const timer = setTimeout(() => {
            if (messageEndRef.current) {
                messageEndRef.current.scrollIntoView({ behavior: "smooth" });
            }
        }, 0); // Timeout 0 pushes execution after the current call stack

        return () => clearTimeout(timer); // Cleanup timeout on unmount or before next effect run
    }, [messages]); // Dependency remains messages

    return (
        <div className="flex-1 flex flex-col overflow-auto">
            {/* Pass selectedUser to ChatHeader if it needs it, or let ChatHeader select it */}
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
                        key={message._id || `msg-${index}`} // Use index as fallback key
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
