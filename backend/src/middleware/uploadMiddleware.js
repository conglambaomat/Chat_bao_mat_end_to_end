import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Save files to the 'uploads' directory using the derived __dirname
        const uploadsPath = path.join(__dirname, '../../uploads');
        console.log(`[UploadMiddleware] Saving file to: ${uploadsPath}`);
        cb(null, uploadsPath);
    },
    filename: function (req, file, cb) {
        // Generate a unique filename using UUID to prevent overwrites
        // Keep the original file extension
        const uniqueSuffix = uuidv4();
        const extension = path.extname(file.originalname);
        const filename = uniqueSuffix + extension;
        console.log(`[UploadMiddleware] Generated filename: ${filename} for original: ${file.originalname}`);
        cb(null, filename);
    }
});

// File filter (optional - you can add checks for file types, size limits, etc.)
// const fileFilter = (req, file, cb) => {
//     if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
//         cb(null, true); // Accept file
//     } else {
//         cb(new Error('Invalid file type'), false); // Reject file
//     }
// };

// Initialize multer with the storage configuration
// You can add fileFilter and limits here if needed
const upload = multer({
    storage: storage,
    // fileFilter: fileFilter,
    // limits: { fileSize: 1024 * 1024 * 5 } // Example: 5MB limit
});

export default upload;