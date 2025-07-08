const express = require('express');
const router = express.Router();
const tagsController = require('../controllers/tags.controller');
const authMiddleware = require('../middleware/auth.middleware');

// GET /api/tags - Get all unique tags for the authenticated user
router.get('/', authMiddleware, tagsController.getAllUserTags);

module.exports = router;
