import { useEffect, useState, useMemo } from 'react'; // Import useMemo
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';
import { JSEncrypt } from 'jsencrypt';
import { arrayBufferToBase64, base64ToArrayBuffer, formatMessageTime } from '../lib/utils';
import toast from 'react-hot-toast';
import { Loader } from 'lucide-react';

// Decryption function (mirrors encryption steps)
const decryptMessage = async (encryptedBundle, privateKeyPem) => {
    // ... (decryption logic remains the same) ...
     const { encryptedContent, encryptedKey, iv, authTag } = encryptedBundle;
    if (!privateKeyPem) {
        console.error("Decryption failed: Private key is missing.");
        // Return structure indicating error source
        return { data: null, error: 'Missing private key.', isLoading: false };
    }

    try {
        // 1. Decrypt AES key with RSA private key
        const decryptor = new JSEncrypt();
        decryptor.setPrivateKey(privateKeyPem);
        const decryptedAesKeyBase64 = decryptor.decrypt(encryptedKey);
        if (!decryptedAesKeyBase64) {
            throw new Error("Failed to decrypt AES key. Check RSA keys or ensure the correct key is used.");
        }

        // 2. Convert decrypted AES key from Base64 to ArrayBuffer
        const aesKeyBuffer = base64ToArrayBuffer(decryptedAesKeyBase64);

        // 3. Import AES key for SubtleCrypto
        const aesKey = await crypto.subtle.importKey(
            "raw",
            aesKeyBuffer,
            { name: "AES-GCM", length: 256 },
            true,
            ["decrypt"]
        );

        // 4. Convert IV and encrypted content from Base64 to ArrayBuffer
        const ivBuffer = base64ToArrayBuffer(iv);
        const encryptedContentBuffer = base64ToArrayBuffer(encryptedContent);

        // 5. Decrypt message content with AES-GCM
        const decryptedContentBuffer = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: ivBuffer },
            aesKey,
            encryptedContentBuffer
        );

        // 6. Decode decrypted ArrayBuffer content to string
        const decoder = new TextDecoder();
        const decryptedText = decoder.decode(decryptedContentBuffer);

        return { data: decryptedText, error: null, isLoading: false }; // Return structure

    } catch (error) {
        console.error(`Decryption failed for message ${encryptedBundle._id || 'UNKNOWN'}:`, error);
        return { data: '[Decryption Error]', error: `Decryption failed: ${error.message}`, isLoading: false }; // Return structure
    }
};


const Message = ({ message }) => {
    // Use individual selectors
    const authUser = useAuthStore((state) => state.authUser);
    const privateKey = useAuthStore((state) => state.privateKey);
    const selectedUser = useChatStore((state) => state.selectedUser);

    // Combine decryption state into one object
    const [decryptionState, setDecryptionState] = useState({
        data: null,
        isLoading: true,
        error: null,
    });

    const isSender = message.senderId === authUser?._id; // Add optional chaining for safety
    const chatClassName = isSender ? "chat-end" : "chat-start";
    const bubbleBgColor = isSender ? "bg-sky-500" : "bg-gray-600";
    // Ensure selectedUser exists before accessing profilePic
    const profilePic = isSender ? authUser?.profilePic : selectedUser?.profilePic;
    const formattedTime = formatMessageTime(message.createdAt);

    useEffect(() => {
        let isMounted = true;
        // Set initial loading state only when effect runs
        setDecryptionState({ data: null, isLoading: true, error: null });

        // Log the private key being used (REMOVE IN PRODUCTION)
        // console.log(`Decrypting message ${message._id} with key:`, privateKey ? privateKey.substring(0, 30) + "..." : "MISSING/NULL");

        if (!privateKey) {
             if (isMounted) {
                 setDecryptionState({ data: '[Missing Key]', isLoading: false, error: 'Private key missing for decryption.' });
             }
             return; // Stop if no private key
        }

        decryptMessage(message, privateKey)
            .then(result => {
                if (isMounted) {
                    // Update state in one go
                    setDecryptionState(result);
                }
            });
            // No need for .catch here as decryptMessage handles errors internally

        return () => { isMounted = false; };
    }, [message, privateKey]); // Dependencies remain the same


    // Use useMemo to compute isImage only when decrypted data changes
    const isImage = useMemo(() => {
        return typeof decryptionState.data === 'string' && decryptionState.data.startsWith('data:image');
    }, [decryptionState.data]);

    return (
        <div className={`chat ${chatClassName}`}>
            <div className="chat-image avatar">
                <div className="w-10 rounded-full">
                    <img alt="User avatar" src={profilePic || "/avatar.png"} />
                </div>
            </div>
            <div className={`chat-bubble ${bubbleBgColor} text-white pb-2 px-3 break-words`}>
                {decryptionState.isLoading ? (
                    <Loader className="size-4 animate-spin my-1" />
                ) : decryptionState.error ? (
                    <span className="text-red-300 text-xs italic">{decryptionState.data} ({decryptionState.error})</span>
                ) : isImage ? (
                    <img src={decryptionState.data} alt="Sent image" className="max-w-xs rounded-md mt-2" />
                ) : (
                    decryptionState.data // Render decrypted text
                )}
            </div>
            <div className="chat-footer opacity-50 text-xs flex gap-1 items-center mt-1">
                {formattedTime}
            </div>
        </div>
    );
};

export default Message;