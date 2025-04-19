import { arrayBufferToBase64, base64ToArrayBuffer } from './utils';

export async function encryptFile(file, recipientPublicKey, senderPublicKey) {
    try {
        // Generate a new AES key for this file
        const aesKey = await window.crypto.subtle.generateKey(
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );

        // Export the AES key
        const exportedKey = await window.crypto.subtle.exportKey("raw", aesKey);
        const aesKeyBase64 = arrayBufferToBase64(exportedKey);

        // Generate IV
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const ivBase64 = arrayBufferToBase64(iv);

        // Read file as ArrayBuffer
        const fileBuffer = await file.arrayBuffer();

        // Encrypt file content
        const encryptedContent = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            aesKey,
            fileBuffer
        );

        // Encrypt AES key for both recipient and sender
        const jsEncrypt = new JSEncrypt();
        
        // For recipient
        jsEncrypt.setPublicKey(recipientPublicKey);
        const encryptedKeyRecipient = jsEncrypt.encrypt(aesKeyBase64);

        // For sender
        jsEncrypt.setPublicKey(senderPublicKey);
        const encryptedKeySender = jsEncrypt.encrypt(aesKeyBase64);

        return {
            encryptedContent: encryptedContent,
            encryptedKeyRecipient,
            encryptedKeySender,
            iv: ivBase64,
            originalName: file.name,
            type: file.type,
            size: file.size
        };
    } catch (error) {
        console.error('[encryptFile] Encryption error:', error);
        throw new Error(`File encryption failed: ${error.message}`);
    }
}

export async function decryptFile(encryptedData, privateKey, isSender) {
    try {
        console.log('[decryptFile] Starting decryption process');

        // Get the correct encrypted key based on sender status
        const encryptedKey = isSender ? 
            encryptedData.file_encrypted_key_sender : 
            encryptedData.file_encrypted_key;

        if (!encryptedKey) {
            throw new Error('Encrypted key not found');
        }

        // Decrypt the AES key using private key
        const jsEncrypt = new JSEncrypt();
        jsEncrypt.setPrivateKey(privateKey);
        
        const decryptedAesKeyBase64 = jsEncrypt.decrypt(encryptedKey);
        if (!decryptedAesKeyBase64) {
            throw new Error('Failed to decrypt AES key');
        }

        // Convert Base64 AES key to ArrayBuffer
        const aesKeyBuffer = base64ToArrayBuffer(decryptedAesKeyBase64);

        // Import the AES key
        const aesKey = await window.crypto.subtle.importKey(
            "raw",
            aesKeyBuffer,
            { name: "AES-GCM", length: 256 },
            false,
            ["decrypt"]
        );

        // Convert IV from Base64
        const iv = base64ToArrayBuffer(encryptedData.file_iv);

        // Get the encrypted file content
        const response = await fetch(`/api/files/download/${encryptedData.file_path}`, {
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error(`File download failed: ${response.status}`);
        }

        const encryptedContent = await response.arrayBuffer();

        // Decrypt the file content
        const decryptedContent = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: new Uint8Array(iv) },
            aesKey,
            encryptedContent
        );

        return {
            content: decryptedContent,
            name: encryptedData.original_file_name,
            type: encryptedData.file_type
        };
    } catch (error) {
        console.error('[decryptFile] Decryption error:', error);
        throw error;
    }
}