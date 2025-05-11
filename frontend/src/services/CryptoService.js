class CryptoService {
  constructor() {
    this.keys = null;
  }

  async initialize() {
    try {
      const storedKeys = localStorage.getItem('chatty_keys');
      if (storedKeys) {
        const parsedKeys = JSON.parse(storedKeys);
        // Validate và import keys
        this.keys = {
          privateKey: await window.crypto.subtle.importKey(
            'pkcs8',
            this._base64ToArrayBuffer(parsedKeys.privateKey),
            {
              name: 'RSA-OAEP',
              hash: 'SHA-256'
            },
            true,
            ['decrypt']
          ),
          publicKey: await window.crypto.subtle.importKey(
            'spki',
            this._base64ToArrayBuffer(parsedKeys.publicKey),
            {
              name: 'RSA-OAEP',
              hash: 'SHA-256'
            },
            true,
            ['encrypt']
          )
        };
      }
    } catch (error) {
      console.error('Failed to initialize CryptoService:', error);
      throw error;
    }
  }

  async decryptMessage(message) {
    try {
      // Decrypt AES key using private RSA key
      const aesKey = await this._decryptKey(
        message.encryptedKey,
        this.keys.privateKey
      );

      // Decrypt message content using AES key
      return await this._decryptContent(
        message.encryptedContent,
        aesKey,
        message.iv
      );
    } catch (error) {
      console.error('Failed to decrypt message:', error);
      throw error;
    }
  }

  _base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

export const cryptoService = new CryptoService();