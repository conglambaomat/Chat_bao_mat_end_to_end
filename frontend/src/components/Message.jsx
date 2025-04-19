import { useEffect, useState, useMemo, useCallback } from 'react'; // Import useCallback
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';
import { arrayBufferToBase64, base64ToArrayBuffer, formatMessageTime } from '../lib/utils';
import JSEncrypt from 'jsencrypt'; // Import JSEncrypt library
import toast from 'react-hot-toast';
import { Loader, Download, FileText, FileWarning } from 'lucide-react';
import DecryptedMessageContent from './DecryptedMessageContent'; // Import the new component

// Helper to format file size
const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const Message = ({ message }) => {
    // Use individual selectors
    const authUser = useAuthStore((state) => state.authUser);
    const privateKey = useAuthStore((state) => state.privateKey);
    const selectedUser = useChatStore((state) => state.selectedUser);
    const [isDownloading, setIsDownloading] = useState(false); // State for download loading

    const isSender = message.senderId === authUser?._id; // Add optional chaining for safety
    const chatClassName = isSender ? "chat-end" : "chat-start";
    const bubbleBgColor = isSender ? "bg-sky-500" : "bg-gray-600";
    // Ensure selectedUser exists before accessing profilePic
    const profilePic = isSender ? authUser?.profilePic : selectedUser?.profilePic;
    const formattedTime = formatMessageTime(message.createdAt);

    // Download and decrypt file handler
    const handleDownloadFile = useCallback(async () => {
        if (!message.is_file || !privateKey) {
            toast.error("Cannot download file: Information missing or no private key.");
            return;
        }
        setIsDownloading(true);
        const loadingToastId = toast.loading("Starting download...");

        let encryptedAesKeyBase64 = null;
        let decryptedAesKeyBase64 = null;
        let fileAesKey = null;
        try {
            // 1. Determine which encrypted AES key to use
            console.log(`[handleDownloadFile] Checking keys for message ${message._id}:`);
            console.log(`  -> isSender: ${isSender} (authUser: ${authUser?._id}, msgSender: ${message.senderId})`);
            console.log(`  -> message.file_encrypted_key (for receiver):`, message.file_encrypted_key ? message.file_encrypted_key.substring(0,30)+'...' : 'MISSING/NULL');
            console.log(`  -> message.file_encrypted_key_sender (for sender):`, message.file_encrypted_key_sender ? message.file_encrypted_key_sender.substring(0,30)+'...' : 'MISSING/NULL');

            encryptedAesKeyBase64 = isSender ? message.file_encrypted_key_sender : message.file_encrypted_key;
            console.log(`[handleDownloadFile] Assigned encryptedAesKeyBase64 = ${encryptedAesKeyBase64 ? encryptedAesKeyBase64.substring(0,30)+'...' : 'FALSY'}`);

            if (!encryptedAesKeyBase64) {
                throw new Error("Missing encrypted AES key for the file.");
            }

            // 2. Decrypt the AES key for the file
            const decryptor = new JSEncrypt();
            decryptor.setPrivateKey(privateKey);
            decryptedAesKeyBase64 = decryptor.decrypt(encryptedAesKeyBase64);

            if (decryptedAesKeyBase64 === false || decryptedAesKeyBase64 === null) {
                console.error(`[handleDownloadFile] RSA Decryption FAILED! decrypt() returned: ${decryptedAesKeyBase64}`);
                throw new Error("RSA Decryption Failed. Cannot retrieve AES key.");
            }

            const aesKeyBuffer = base64ToArrayBuffer(decryptedAesKeyBase64);
            fileAesKey = await crypto.subtle.importKey(
                "raw", aesKeyBuffer, { name: "AES-GCM" }, true, ["decrypt"]
            );

            console.log("[handleDownloadFile] Imported fileAesKey object:", fileAesKey);
            console.log("[handleDownloadFile] Decrypted AES Key (Base64 for import):", decryptedAesKeyBase64);

            // 3. Get the file's IV
            if (!message.file_iv) {
                throw new Error("Missing file IV in message data.");
            }
            console.log("[handleDownloadFile] File IV (Base64 from message.file_iv):");
            console.log(message.file_iv);
            const fileIv = base64ToArrayBuffer(message.file_iv);
            console.log("[handleDownloadFile] File IV ArrayBuffer length:", fileIv.byteLength);

            // 4. Fetch the encrypted file content
            toast.loading("Downloading encrypted file...", { id: loadingToastId });
            const response = await fetch(`/api/files/download/${message.file_path}`, {
                credentials: 'include' // Ensure cookies are sent for authentication
            });

            // Check response type and status
            const contentType = response.headers.get('content-type');
            console.log("[handleDownloadFile] Response headers:", {
                status: response.status,
                statusText: response.statusText,
                contentType: contentType,
                contentLength: response.headers.get('content-length')
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error("[handleDownloadFile] Server error response:", {
                    status: response.status,
                    statusText: response.statusText,
                    responseText: errorText.substring(0, 200) + '...'
                });
                throw new Error(`Server returned error: ${response.status} ${response.statusText}`);
            }

            // Check content type, but be more lenient
            if (!contentType) {
                console.warn("[handleDownloadFile] Missing content-type header");
            } else if (!contentType.includes('application/octet-stream')) {
                console.warn(`[handleDownloadFile] Unexpected content-type: ${contentType}, but proceeding anyway`);
            }

            const encryptedFileBuffer = await response.arrayBuffer();
            console.log("[handleDownloadFile] Encrypted file buffer size:", encryptedFileBuffer.byteLength);

            // Log first/last bytes of downloaded buffer BEFORE decryption
            const downloadedBytes = new Uint8Array(encryptedFileBuffer);
            console.log(`[handleDownloadFile] Downloaded Buffer (${downloadedBytes.length} bytes) Start:`, downloadedBytes.slice(0, 16));
            console.log(`[handleDownloadFile] Downloaded Buffer End:`, downloadedBytes.slice(-16));

            // Check if the buffer looks like HTML (simple heuristic)
            const firstBytesStr = String.fromCharCode.apply(null, downloadedBytes.slice(0, 20));
            if (firstBytesStr.includes('<!DOCTYPE') || firstBytesStr.includes('<html')) {
                console.error('[handleDownloadFile] Received HTML instead of binary data:', firstBytesStr);
                throw new Error('Server returned HTML instead of file data. Please check server logs.');
            }

            // 5. Decrypt the file content
            toast.loading("Decrypting file...", { id: loadingToastId });
            console.log("[handleDownloadFile] Attempting crypto.subtle.decrypt...");
            const decryptedFileBuffer = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv: fileIv },
                fileAesKey,
                encryptedFileBuffer
            );

            // 6. Create Blob and trigger download
            const blob = new Blob([decryptedFileBuffer], { type: message.file_type || 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = message.original_file_name || 'downloaded_file';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            toast.success("File downloaded and decrypted!", { id: loadingToastId });

        } catch (error) {
            console.error("--- Error downloading/decrypting file ---");
            if (error instanceof Error) {
                console.error("Error Name:", error.name);
                console.error("Error Message:", error.message);
                console.error("Message ID:", message._id);
                console.error("Used Decrypted AES Key (Base64):", decryptedAesKeyBase64);
                console.error("Imported fileAesKey object (at time of error):", fileAesKey);
                console.error("Used IV (Base64 from msg.file_iv):", message.file_iv);
                console.error("Error Stack:", error.stack);
                toast.error(`Download failed: ${error.name} - ${error.message}`, { id: loadingToastId });
            } else {
                console.error("Caught non-Error object:", error);
                toast.error(`Download failed due to an unexpected error. Check console.`, { id: loadingToastId });
            }
            console.error("--- End Error Details ---");
        } finally {
            setIsDownloading(false);
        }
    }, [message, privateKey, isSender]);

    return (
        <div className={`chat ${chatClassName}`}>
            <div className="chat-image avatar">
                <div className="w-10 rounded-full">
                    <img alt="User avatar" src={profilePic || "/avatar.png"} />
                </div>
            </div>
            <div className={`chat-bubble ${bubbleBgColor} text-white pb-2 px-3 break-words`}>
                {/* --- Prioritize File Message Rendering --- */}
                {message.is_file === true ? (
                    <div className="flex items-center gap-3 p-2 cursor-pointer" onClick={!isDownloading ? handleDownloadFile : undefined}>
                        {isDownloading ? (
                            <Loader className="size-6 animate-spin flex-shrink-0" />
                        ) : (
                            <Download className="size-6 text-sky-300 hover:text-sky-100 flex-shrink-0" />
                        )}
                        <div className="flex flex-col overflow-hidden">
                            <span className="text-sm font-medium truncate" title={message.original_file_name}>
                                {message.original_file_name || "Attached File"}
                            </span>
                            <span className="text-xs opacity-70">
                                {formatFileSize(message.file_size || 0)}
                            </span>
                        </div>
                    </div>
                ) : (
                    /* --- Rendering for Non-File Messages --- */
                    <DecryptedMessageContent
                        message={message}
                        privateKey={privateKey}
                        isSender={isSender}
                    />
                )}
            </div>
            <div className="chat-footer opacity-50 text-xs flex gap-1 items-center mt-1">
                {formattedTime}
            </div>
        </div>
    );
};

export default Message;