const express = require('express');
const router = express.Router({ mergeParams: true }); // Enable mergeParams to access :noteId from parent router
const aiController = require('../controllers/ai.controller');
const authMiddleware = require('../middleware/auth.middleware'); // Assuming AI interactions are protected

// All routes in this file will be implicitly prefixed by something like /api/notes/:noteId/ai

// POST /api/notes/:noteId/ai/chat
router.post('/chat', authMiddleware, aiController.chatWithNoteAI);

// POST /api/notes/:noteId/ai/action
router.post('/action', authMiddleware, aiController.performNoteActionAI);

module.exports = router;
