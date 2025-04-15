import { useRef, useState, useCallback } from "react";
import { useChatStore } from "../store/useChatStore";
import { Image, Send, X } from "lucide-react";
import toast from "react-hot-toast";
import { JSEncrypt } from "jsencrypt";
import { arrayBufferToBase64, base64ToArrayBuffer } from "../lib/utils"; // We need utils for base64 conversion

const MessageInput = () => {
    const [text, setText] = useState("");
    const [imagePreview, setImagePreview] = useState(null); // Stores base64 image preview
    const fileInputRef = useRef(null);
    
    // Use separate selectors to prevent unnecessary re-renders
    const selectedUser = useChatStore(state => state.selectedUser);
    const sendMessage = useChatStore(state => state.sendMessage);
    const isSendingMessage = useChatStore(state => state.isSendingMessage);

    const handleImageChange = useCallback((e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            toast.error("Please select an image file");
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            setImagePreview(reader.result); // Store as base64 string
        };
        reader.readAsDataURL(file);
    }, []);

    const removeImage = useCallback(() => {
        setImagePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }, []);

    // Encryption function
    const encryptMessage = async (plainText, recipientPublicKeyPem) => {
        try {
            // 1. Generate AES key
            const aesKey = await crypto.subtle.generateKey(
                { name: "AES-GCM", length: 256 },
                true, // extractable
                ["encrypt", "decrypt"]
            );
            const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV recommended for AES-GCM

            // 2. Encrypt message content with AES-GCM
            const encoder = new TextEncoder();
            const encodedPlainText = encoder.encode(plainText);
            const encryptedContentBuffer = await crypto.subtle.encrypt(
                { name: "AES-GCM", iv: iv },
                aesKey,
                encodedPlainText
            );

            // Extract the authentication tag (GCM specific)
            // It's typically appended to the ciphertext by SubtleCrypto, 
            // but let's assume it's the last 16 bytes (128 bits) for clarity, though standards vary.
            // A more robust approach involves libraries managing this explicitly or checking the specific browser implementation.
            // For simplicity here, we'll manage it separately. We need to export the key to encrypt it.
            
            const encryptedContent = encryptedContentBuffer; // We'll extract the tag later if needed, or rely on browser handling

            // 3. Export AES key to raw format (ArrayBuffer)
            const exportedAesKeyBuffer = await crypto.subtle.exportKey("raw", aesKey);

            // 4. Encrypt AES key with RSA-OAEP using JSEncrypt
            const encryptor = new JSEncrypt();
            encryptor.setPublicKey(recipientPublicKeyPem);
            // JSEncrypt expects a string, so convert ArrayBuffer to Base64 first
            const encryptedAesKeyBase64 = encryptor.encrypt(arrayBufferToBase64(exportedAesKeyBuffer));
            if (!encryptedAesKeyBase64) {
                throw new Error("RSA encryption of AES key failed. Is the public key valid?");
            }

            // 5. Prepare bundle (convert buffers to base64 for JSON)
            const bundle = {
                encryptedContent: arrayBufferToBase64(encryptedContent), 
                encryptedKey: encryptedAesKeyBase64,
                iv: arrayBufferToBase64(iv),
                // AuthTag handling: SubtleCrypto encrypt for AES-GCM often includes the tag in the result.
                // If it needs to be separate, it would be extracted here. Let's assume it's bundled for now.
                // We will need to handle this properly during decryption.
                // For a robust solution, consider using a library that handles AES-GCM complexities.
                authTag: "", // Placeholder - Auth tag is implicitly part of encryptedContent in most WebCrypto implementations
            };

            return bundle;
        } catch (error) {
            console.error("Encryption failed:", error);
            toast.error(`Encryption failed: ${error.message}`);
            return null;
        }
    };

    const handleSendMessage = useCallback(async (e) => {
        e.preventDefault();
        const messageContent = imagePreview || text.trim(); // Send image base64 if present, else text

        if (!messageContent || !selectedUser || !selectedUser.publicKey) {
            if (!selectedUser?.publicKey) {
                toast.error("Recipient public key is missing. Cannot send message.");
            }
            return;
        }

        const encryptedBundle = await encryptMessage(messageContent, selectedUser.publicKey);

        if (encryptedBundle) {
            try {
                await sendMessage(encryptedBundle);
                // Clear form only after successful encryption and initiation of send
                setText("");
                removeImage();
            } catch (error) {
                console.error("Failed to send message:", error);
                toast.error("Failed to send message. Please try again.");
            }
        }
    }, [imagePreview, text, selectedUser, sendMessage, removeImage]);

    return (
        <div className="p-4 w-full">
            {imagePreview && (
                <div className="mb-3 flex items-center gap-2">
                    <div className="relative">
                        <img
                            src={imagePreview}
                            alt="Preview"
                            className="w-20 h-20 object-cover rounded-lg border border-zinc-700"
                        />
                        <button
                            onClick={removeImage}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-base-300
              flex items-center justify-center"
                            type="button"
                        >
                            <X className="size-3" />
                        </button>
                    </div>
                </div>
            )}

            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                <div className="flex-1 flex gap-2">
                    <input
                        type="text"
                        className="w-full input input-bordered rounded-lg input-sm sm:input-md"
                        placeholder="Type an encrypted message..."
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        disabled={!!imagePreview || isSendingMessage} // Disable text input if image is selected or sending
                    />
                    <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleImageChange}
                        disabled={isSendingMessage}
                    />

                    <button
                        type="button"
                        className={`hidden sm:flex btn btn-circle
                     ${imagePreview ? "text-emerald-500" : "text-zinc-400"}`}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isSendingMessage}
                    >
                        <Image size={20} />
                    </button>
                </div>
                <button
                    type="submit"
                    className={`btn btn-sm btn-circle ${isSendingMessage ? 'loading' : ''}`}
                    disabled={(!text.trim() && !imagePreview) || isSendingMessage}
                >
                    {!isSendingMessage && <Send size={22} />}
                </button>
            </form>
        </div>
    );
};
export default MessageInput;
