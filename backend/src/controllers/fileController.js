import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url'; // Import necessary function

// Get __dirname equivalent in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// POST /api/files/upload
export const uploadFile = (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded.' });
    }

    // The file is already saved by multer middleware
    // We just need to return the unique filename assigned by multer
    // The client will use this filename to reference the file later
    res.status(201).json({
        message: 'File uploaded successfully',
        filename: req.file.filename // This is the unique filename (e.g., uuid.ext)
    });
};

// GET /api/files/download/:filename
export const downloadFile = async (req, res) => {
    try {
        const filename = req.params.filename;
        // Construct the full path to the file in the uploads directory using the derived __dirname
        const filePath = path.join(__dirname, '../../uploads', filename);
        console.log(`[DownloadFile] Attempting to access file for download. Filename: ${filename}, Resolved Path: ${filePath}`);

        // Security check: Basic path traversal prevention
        const uploadsDir = path.resolve(__dirname, '../../uploads');
        const resolvedPath = path.resolve(filePath);
        if (!resolvedPath.startsWith(uploadsDir)) {
            console.error('[DownloadFile] Attempted path traversal:', filename);
            return res.status(403).json({ message: 'Forbidden' });
        }

        // Check if the file exists
        if (!fs.existsSync(resolvedPath)) {
            console.error(`[DownloadFile] File not found at path: ${resolvedPath}`);
            return res.status(404).json({ message: 'File not found.' });
        }

        // Get file stats
        const stats = fs.statSync(resolvedPath);
        console.log(`[DownloadFile] File stats: Size=${stats.size} bytes`);

        // Read file as buffer instead of streaming
        const fileBuffer = await fs.promises.readFile(resolvedPath);
        console.log(`[DownloadFile] Successfully read file into buffer: ${filename} (${fileBuffer.length} bytes)`);

        // Set appropriate headers
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', fileBuffer.length);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        // Send the buffer directly
        res.send(fileBuffer);
        console.log(`[DownloadFile] Successfully sent file buffer: ${filename}`);

    } catch (error) {
        console.error(`[DownloadFile] Error processing file download:`, error);
        if (!res.headersSent) {
            res.status(500).json({ message: 'Error downloading file' });
        }
    }
};