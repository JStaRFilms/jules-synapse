const multer = require('multer');
const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'audio'); // src/../uploads/audio -> project_root/uploads/audio

// Ensure the upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log(`Created directory: ${UPLOAD_DIR}`);
} else {
  console.log(`Directory already exists: ${UPLOAD_DIR}`);
}

// Set up storage for uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Create a unique filename to avoid overwriting
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname) || '.webm'; // Default to .webm if no extension
    cb(null, file.fieldname + '-' + uniqueSuffix + extension);
  }
});

// Filter for audio file types
const audioFileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['audio/webm', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/x-m4a', 'audio/m4a'];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only audio files are allowed (webm, mp3, wav, ogg, aac, m4a).'), false);
  }
};

const uploadAudio = multer({
  storage: storage,
  fileFilter: audioFileFilter,
  limits: {
    fileSize: 1024 * 1024 * 50 // 50 MB limit for audio files
  }
}).single('audio'); // Expects a single file with the field name 'audio'

// Middleware to handle multer errors specifically, so they can be sent as JSON
const handleUploadErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // A Multer error occurred when uploading.
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
    }
    return res.status(400).json({ error: `Multer error: ${err.message}` });
  } else if (err) {
    // An unknown error occurred when uploading.
    if (err.message && err.message.startsWith('Invalid file type')) {
        return res.status(400).json({ error: err.message });
    }
    console.error("Unknown upload error:", err)
    return res.status(500).json({ error: 'An unknown error occurred during file upload.' });
  }
  // Everything went fine.
  next();
};


// It's better to apply handleUploadErrors directly in the route chain where uploadAudio is used,
// or as a general error handler in app.js that checks for err.code from multer.
// For now, the controller using uploadAudio will get the error if it's passed by multer.
// We can refine this by making uploadAudio a function that itself calls multer and then handleUploadErrors,
// or by ensuring the main error handler in app.js is multer-aware.

// Exporting the configured multer instance directly.
// The route will look like: router.post('/upload', auth, uploadAudioInstance, controllerFunc, handleUploadErrorsIfNeeded);
// Or the controllerFunc should have a try-catch that handles multer errors.
// For simplicity, the controller will handle it, or a global error handler.
// The plan has notes.controller.js directly using this.

module.exports = (req, res, next) => {
  uploadAudio(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
      }
      return res.status(400).json({ error: `File upload error: ${err.message}` });
    } else if (err) {
      // This handles the custom error from fileFilter
      return res.status(400).json({ error: err.message });
    }
    // If no error, proceed to the next middleware or route handler
    next();
  });
};
