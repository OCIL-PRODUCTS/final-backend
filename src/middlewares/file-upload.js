const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Define the root upload directory
const rootUploadDir = path.join(__dirname, '../../public/uploads');

// Ensure the root upload directory exists
if (!fs.existsSync(rootUploadDir)) {
    fs.mkdirSync(rootUploadDir, { recursive: true });
}


// Multer storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let uploadPath = rootUploadDir; // Default upload location

        // Allow user to specify a folder dynamically (optional)
        if (req.body.folder) {
            uploadPath = path.join(rootUploadDir, req.body.folder);
        }

        // Ensure the upload path exists
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }

        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    },
});

// Multer upload middleware
exports.upload = multer({ storage });
