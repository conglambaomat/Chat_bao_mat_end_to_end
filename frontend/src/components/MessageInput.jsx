import { useRef, useState, useCallback } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore"; // Import auth store
import { Image, Send, X, Paperclip } from "lucide-react";
import toast from "react-hot-toast";
import JSEncrypt from "jsencrypt"; // Correct import if jsencrypt is default export or setup differently
import { arrayBufferToBase64, base64ToArrayBuffer } from "../lib/utils";

const MessageInput = () => {
    const [text, setText] = useState("");
    const [imagePreview, setImagePreview] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);
    const fileInputRef = useRef(null);
    const fileAttachmentInputRef = useRef(null);

    // Auth store for sender's public key
    const authUser = useAuthStore(state => state.authUser);

    // Chat store selectors
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
            setImagePreview(reader.result);
        };
        reader.readAsDataURL(file);
    }, []);

    const removeImage = useCallback(() => {
        setImagePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }, []);

    const handleFileSelect = useCallback((e) => {
        const file = e.target.files[0];
        if (!file) return;

        setSelectedFile(file);
        removeImage();
        setText("");
    }, [removeImage]);

    const removeSelectedFile = useCallback(() => {
        setSelectedFile(null);
        if (fileAttachmentInputRef.current) fileAttachmentInputRef.current.value = "";
    }, []);

    // Updated Encryption function
    const encryptMessage = async (plainText, recipientPublicKeyPem, senderPublicKeyPem) => {
        // *** LOG INPUT KEYS ***
        console.log("EncryptMessage: Recipient Key PEM:", recipientPublicKeyPem ? recipientPublicKeyPem.substring(0, 50) + "..." : "MISSING/INVALID");
        console.log("EncryptMessage: Sender Key PEM:", senderPublicKeyPem ? senderPublicKeyPem.substring(0, 50) + "..." : "MISSING/INVALID");

        // *** VALIDATE SENDER KEY EARLY ***
        if (!senderPublicKeyPem || typeof senderPublicKeyPem !== 'string' || senderPublicKeyPem.length < 100) { // Basic check
             const errorMsg = "Sender public key is invalid or missing.";
             console.error("EncryptMessage:", errorMsg, senderPublicKeyPem);
             toast.error(errorMsg);
             return null; // Prevent further execution
        }
         if (!recipientPublicKeyPem || typeof recipientPublicKeyPem !== 'string' || recipientPublicKeyPem.length < 100) { // Basic check for recipient too
             const errorMsg = "Recipient public key is invalid or missing.";
             console.error("EncryptMessage:", errorMsg, recipientPublicKeyPem);
             toast.error(errorMsg);
             return null; // Prevent further execution
        }


        try {
            // 1. Generate AES key
            const aesKey = await crypto.subtle.generateKey(
                { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
            );
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const exportedAesKeyBuffer = await crypto.subtle.exportKey("raw", aesKey);
            const exportedAesKeyBase64 = arrayBufferToBase64(exportedAesKeyBuffer);

            // 2. Encrypt message content
            const encoder = new TextEncoder();
            const encodedPlainText = encoder.encode(plainText);
            const encryptedContentBuffer = await crypto.subtle.encrypt(
                { name: "AES-GCM", iv: iv }, aesKey, encodedPlainText
            );

            // 3. Encrypt AES key for Recipient
            const encryptor = new JSEncrypt();
            encryptor.setPublicKey(recipientPublicKeyPem);
            const encryptedAesKeyBase64Recipient = encryptor.encrypt(exportedAesKeyBase64);
            if (!encryptedAesKeyBase64Recipient || typeof encryptedAesKeyBase64Recipient !== 'string' || encryptedAesKeyBase64Recipient.length === 0) {
                 console.error("EncryptMessage: RSA encryption for RECIPIENT failed. Result:", encryptedAesKeyBase64Recipient);
                throw new Error("RSA encryption of AES key failed for recipient.");
            }
             console.log("EncryptMessage: Recipient encrypted key length:", encryptedAesKeyBase64Recipient.length);


            // 4. Encrypt AES key for Sender
            encryptor.setPublicKey(senderPublicKeyPem);
            const encryptedAesKeyBase64Sender = encryptor.encrypt(exportedAesKeyBase64);

            // *** STRICTER CHECK for Sender's encrypted key ***
            if (!encryptedAesKeyBase64Sender || typeof encryptedAesKeyBase64Sender !== 'string' || encryptedAesKeyBase64Sender.length === 0) {
                console.error("EncryptMessage: RSA encryption for SENDER failed. Result:", encryptedAesKeyBase64Sender);
                // Log the key used for debugging
                console.error("EncryptMessage: Sender public key used:", senderPublicKeyPem ? senderPublicKeyPem.substring(0, 50) + "..." : "MISSING/INVALID");
                throw new Error("RSA encryption of AES key failed for sender. Check sender's public key.");
            }
             console.log("EncryptMessage: Sender encrypted key length:", encryptedAesKeyBase64Sender.length);


            // 5. Prepare bundle
            const bundle = {
                encryptedContent: arrayBufferToBase64(encryptedContentBuffer),
                encryptedKey: encryptedAesKeyBase64Recipient,
                encryptedKeySender: encryptedAesKeyBase64Sender, // This should now be valid
                iv: arrayBufferToBase64(iv),
            };

            console.log("EncryptMessage: Successfully created bundle:", JSON.stringify(bundle).substring(0, 200) + "...");
            return bundle;

        } catch (error) {
            const errorMessage = `Encryption process failed: ${error.message}`;
            console.error("EncryptMessage Error:", errorMessage, error);
            toast.error(errorMessage);
            return null;
        }
    };

    // Helper function to encrypt ArrayBuffer with AES-GCM
    const encryptBuffer = async (buffer, aesKey) => {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encryptedContent = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            aesKey,
            buffer
        );
        return { encryptedContent, iv };
    };

    // Helper function to encrypt AES key with RSA
    const encryptAesKeyWithRsa = (aesKeyBase64, publicKeyPem) => {
        try {
            const encryptor = new JSEncrypt();
            encryptor.setPublicKey(publicKeyPem);
            const encryptedKey = encryptor.encrypt(aesKeyBase64);
            if (!encryptedKey || typeof encryptedKey !== 'string' || encryptedKey.length === 0) {
                throw new Error("RSA encryption returned invalid result.");
            }
            return encryptedKey;
        } catch (error) {
            console.error("Error encrypting AES key with RSA:", error);
            throw error; // Re-throw to be caught by the caller
        }
    };

    // Function to handle sending FILES
    const handleSendFile = useCallback(async () => {
        if (!selectedFile || !selectedUser || !authUser) {
            toast.error("Cannot send file: Missing file, recipient, or sender info.");
            return;
        }
        if (!selectedUser.publicKey || !authUser.publicKey) {
             toast.error("Cannot send file: Missing public keys.");
             return;
        }

        const loadingToastId = toast.loading("Encrypting and uploading file...");
        let fileAesKey = null;

        try {
            // 1. Generate AES key for this file
            fileAesKey = await crypto.subtle.generateKey(
                { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
            );
            const exportedAesKeyBuffer = await crypto.subtle.exportKey("raw", fileAesKey);
            const exportedAesKeyBase64 = arrayBufferToBase64(exportedAesKeyBuffer);

            // 2. Encrypt AES key for Recipient and Sender
            const encryptedAesKeyRecipient = encryptAesKeyWithRsa(exportedAesKeyBase64, selectedUser.publicKey);
            const encryptedAesKeySender = encryptAesKeyWithRsa(exportedAesKeyBase64, authUser.publicKey);

            // 3. Read file content
            const fileBuffer = await selectedFile.arrayBuffer();

            // 4. Encrypt file content
            const { encryptedContent: encryptedFileBuffer, iv: fileIv } = await encryptBuffer(fileBuffer, fileAesKey);

            // Log first/last bytes of encrypted buffer BEFORE sending
            const encryptedBytesToSend = new Uint8Array(encryptedFileBuffer);
            console.log(`[handleSendFile] Encrypted Buffer To Send (${encryptedBytesToSend.length} bytes) Start:`, encryptedBytesToSend.slice(0, 16));
            console.log(`[handleSendFile] Encrypted Buffer To Send End:`, encryptedBytesToSend.slice(-16));

            // 5. Prepare file data for upload
            const formData = new FormData();
            // Send encrypted data as a Blob
            formData.append('file', new Blob([encryptedFileBuffer]), selectedFile.name); // Keep original name for potential server-side use, though backend uses UUID

            // 6. Upload encrypted file
            const uploadResponse = await fetch('http://localhost:5001/api/files/upload', {
                method: 'POST',
                body: formData,
                credentials: 'include',
            });

            if (!uploadResponse.ok) {
                const errorData = await uploadResponse.json();
                throw new Error(`File upload failed: ${errorData.message || uploadResponse.statusText}`);
            }

            const uploadResult = await uploadResponse.json();
            const serverFilename = uploadResult.filename; // The unique filename from backend

            // 7. Prepare the reference message object (encrypted)
            // Ensure fileIv is the correct IV used for file encryption
            const fileIvBase64 = arrayBufferToBase64(fileIv); 
            console.log("[handleSendFile] Storing File IV (Base64):", fileIvBase64); // Log the IV being stored

            // Note: The actual file content is NOT in this message, only metadata and pointers.
            const fileMessageData = {
                is_file: true,
                original_file_name: selectedFile.name,
                file_type: selectedFile.type,
                file_size: selectedFile.size,
                file_path: serverFilename,
                // Store file-specific encryption details in their dedicated fields
                file_iv: fileIvBase64,
                file_encrypted_key: encryptedAesKeyRecipient, 
                file_encrypted_key_sender: encryptedAesKeySender,

                // Keep original message encryption fields separate (can be empty/placeholder for file messages)
                encryptedContent: null, // Or a placeholder like "File Metadata"
                encryptedKey: null,
                encryptedKeySender: null,
                iv: null // Or a standard IV like crypto.getRandomValues(new Uint8Array(12))
            };


            // 8. Send the reference message via WebSocket
            await sendMessage(fileMessageData);
            toast.success("File sent successfully!", { id: loadingToastId });
            removeSelectedFile();

        } catch (error) {
            console.error("Error sending file:", error);
            toast.error(`Failed to send file: ${error.message}`, { id: loadingToastId });
            // Clean up AES key if generated
            // Note: SubtleCrypto keys aren't directly disposable in the same way
        }
    }, [selectedFile, selectedUser, authUser, sendMessage, removeSelectedFile]);

    const handleSendMessage = useCallback(async (e) => {
        e.preventDefault();

        // If a file is selected, use the file sending logic
        if (selectedFile) {
            await handleSendFile();
            return;
        }

        // Original logic for text/image messages
        const messageContent = imagePreview || text.trim();

        if (!messageContent || !selectedUser || !authUser) {
            // Improved error message
            const missingData = !selectedUser ? "Recipient not selected" : !authUser ? "Sender data not available" : "Message content is empty";
            toast.error(`Cannot send message: ${missingData}.`);
            return;
        }

        // Public key checks are now inside encryptMessage, but we keep basic user checks here
        if (!selectedUser._id || !authUser._id) {
             toast.error("Cannot send message: User ID missing.");
             return;
        }

        const encryptedBundle = await encryptMessage(
            messageContent,
            selectedUser.publicKey, // Recipient's public key
            authUser.publicKey     // Sender's public key
        );

        // encryptMessage now returns null on validation/encryption failure and shows toast
        if (encryptedBundle) {
            try {
                // isSendingMessage state is handled by the store
                await sendMessage(encryptedBundle);
                setText("");
                removeImage();
            } catch (error) {
                 // Error handling is mostly done within the store's sendMessage now
                console.error("handleSendMessage: Error returned from store sendMessage:", error);
                // Toast is likely already shown by the store
            }
        }
    }, [
        imagePreview, text, selectedUser, authUser, sendMessage, removeImage,
        selectedFile, handleSendFile // Add file state and handler dependencies
    ]);

    return (
        <div className="p-4 w-full">
            {selectedFile && !imagePreview && (
                <div className="mb-3 flex items-center gap-2 p-2 rounded-lg bg-base-200 border border-zinc-700">
                    <Paperclip className="size-5 text-zinc-400" />
                    <span className="text-sm text-zinc-300 truncate flex-1">
                        {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </span>
                    <button
                        onClick={removeSelectedFile}
                        className="w-5 h-5 rounded-full bg-base-300 flex items-center justify-center text-zinc-400 hover:text-red-500"
                        type="button"
                        aria-label="Remove selected file"
                    >
                        <X className="size-3" />
                    </button>
                </div>
            )}

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
                            aria-label="Remove image preview"
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
                        disabled={!!imagePreview || !!selectedFile || isSendingMessage}
                    />
                    <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleImageChange}
                        disabled={isSendingMessage}
                        aria-label="Select image"
                    />
                    <input
                        type="file"
                        className="hidden"
                        ref={fileAttachmentInputRef}
                        onChange={handleFileSelect}
                        disabled={isSendingMessage}
                        aria-label="Attach file"
                    />

                    <button
                        type="button"
                        title="Select image"
                        className={`hidden sm:flex btn btn-circle btn-sm sm:btn-md
                     ${imagePreview ? "text-emerald-500" : "text-zinc-400"} ${isSendingMessage || selectedFile ? 'btn-disabled opacity-50' : ''}`}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isSendingMessage || !!selectedFile}
                    >
                        <Image size={20} />
                    </button>

                    <button
                        type="button"
                        title="Attach file"
                        className={`hidden sm:flex btn btn-circle btn-sm sm:btn-md text-zinc-400 ${isSendingMessage || imagePreview ? 'btn-disabled opacity-50' : ''}`}
                        onClick={() => fileAttachmentInputRef.current?.click()}
                        disabled={isSendingMessage || !!imagePreview}
                    >
                        <Paperclip size={20} />
                    </button>
                </div>
                <button
                    type="submit"
                    title="Send message"
                    className={`btn btn-sm sm:btn-md btn-circle ${isSendingMessage ? 'loading btn-disabled' : ''}`}
                    disabled={(!text.trim() && !imagePreview && !selectedFile) || isSendingMessage}
                >
                    {!isSendingMessage && <Send size={22} />}
                </button>
            </form>
        </div>
    );
};
export default MessageInput;
