const express = require('express');
const router = express.Router();
const notesController = require('../controllers/notes.controller');
const authMiddleware = require('../middleware/auth.middleware');
const uploadAudio = require('../middleware/upload.middleware'); // Will be created next

// --- Standard Note CRUD routes (from NOTE-01 and TAGS-01) ---
// All note routes are protected
router.post('/', authMiddleware, notesController.createNote);
router.get('/', authMiddleware, notesController.getAllNotes);
router.get('/:id', authMiddleware, notesController.getNoteById);
router.put('/:id', authMiddleware, notesController.updateNote);
router.delete('/:id', authMiddleware, notesController.deleteNote);

// --- AUDIO-01 Routes ---
// Route to signal start of recording
router.post('/:noteId/audio/start-recording', authMiddleware, notesController.startRecording);

// Route to upload audio file
// The 'uploadAudio' middleware (from multer) will handle the file parsing (e.g. req.file)
router.post('/:noteId/audio/upload', authMiddleware, uploadAudio, notesController.uploadAudioFile);

// Route to update timestamps for a note's audio
router.put('/:noteId/timestamps', authMiddleware, notesController.updateTimestamps);


// --- TAGS-01 related routes (conceptual, might be separate or integrated) ---
// Example: Get all unique tags for a user
// router.get('/tags/all', authMiddleware, tagsController.getAllUserTags);
// This is currently handled in getAllNotes with a query param, but a dedicated endpoint could exist.

module.exports = router;
