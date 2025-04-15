import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';
import { JSEncrypt } from 'jsencrypt';
import { arrayBufferToBase64, base64ToArrayBuffer, formatMessageTime } from '../lib/utils';
import toast from 'react-hot-toast';
import { Loader } from 'lucide-react';

// Decryption function (mirrors encryption steps)
const decryptMessage = async (encryptedBundle, privateKeyPem) => {
    const { encryptedContent, encryptedKey, iv, authTag } = encryptedBundle;
    if (!privateKeyPem) {
        console.error("Decryption failed: Private key is missing.");
        return { error: 'Missing private key.' };
    }

    try {
        // 1. Decrypt AES key with RSA private key
        const decryptor = new JSEncrypt();
        decryptor.setPrivateKey(privateKeyPem);
        const decryptedAesKeyBase64 = decryptor.decrypt(encryptedKey);
        if (!decryptedAesKeyBase64) {
            // This can happen if the wrong key is used or data is corrupted
            throw new Error("Failed to decrypt AES key. Check RSA keys.");
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
            { name: "AES-GCM", iv: ivBuffer }, // AuthTag is often handled implicitly here
            aesKey,
            encryptedContentBuffer
        );

        // 6. Decode decrypted ArrayBuffer content to string
        const decoder = new TextDecoder();
        const decryptedText = decoder.decode(decryptedContentBuffer);

        return { decryptedText };

    } catch (error) {
        console.error("Decryption failed:", error);
        // Don't show toast for every failed decryption, could be annoying
        // Consider logging or specific UI indication
        return { error: `Decryption failed: ${error.message}` };
    }
};

const Message = ({ message }) => {
    const { authUser, privateKey } = useAuthStore((state) => ({ authUser: state.authUser, privateKey: state.privateKey }));
    const { selectedUser } = useChatStore((state) => ({ selectedUser: state.selectedUser }));
    const [decryptedContent, setDecryptedContent] = useState('');
    const [isDecrypting, setIsDecrypting] = useState(true);
    const [error, setError] = useState('');

    const isSender = message.senderId === authUser._id;
    const chatClassName = isSender ? "chat-end" : "chat-start";
    const bubbleBgColor = isSender ? "bg-sky-500" : "bg-gray-600";
    const profilePic = isSender ? authUser.profilePic : selectedUser.profilePic;
    const formattedTime = formatMessageTime(message.createdAt);

    useEffect(() => {
        let isMounted = true;
        setIsDecrypting(true);
        setError('');

        decryptMessage(message, privateKey)
            .then(result => {
                if (isMounted) {
                    if (result.error) {
                        setError(result.error);
                        setDecryptedContent('[Decryption Error]'); // Show error indication
                    } else {
                        setDecryptedContent(result.decryptedText);
                    }
                    setIsDecrypting(false);
                }
            })
            .catch(err => { // Should be caught within decryptMessage, but as fallback
                if (isMounted) {
                    console.error("Unexpected error during decryption:", err);
                    setError('Unexpected decryption error.');
                    setDecryptedContent('[Decryption Error]');
                    setIsDecrypting(false);
                }
            });

        return () => { isMounted = false; }; // Cleanup function
    }, [message, privateKey]); // Re-decrypt if message or private key changes

    // Basic check for base64 image data
    const isImage = decryptedContent.startsWith('data:image');

    return (
        <div className={`chat ${chatClassName}`}>
            <div className="chat-image avatar">
                <div className="w-10 rounded-full">
                    <img alt="User avatar" src={profilePic || "/avatar.png"} />
                </div>
            </div>
            <div className={`chat-bubble ${bubbleBgColor} text-white pb-2 px-3 break-words`}>
                {isDecrypting ? (
                    <Loader className="size-4 animate-spin my-1" />
                ) : error ? (
                    <span className="text-red-300 text-xs">{decryptedContent}</span>
                ) : isImage ? (
                    <img src={decryptedContent} alt="Sent image" className="max-w-xs rounded-md mt-2" />
                ) : (
                    decryptedContent
                )}
            </div>
            <div className="chat-footer opacity-50 text-xs flex gap-1 items-center mt-1">
                {formattedTime}
            </div>
        </div>
    );
};

export default Message;
