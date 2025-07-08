const express = require('express');
const router = express.Router();
const folderController = require('../controllers/folder.controller');
const authMiddleware = require('../middleware/auth.middleware');

// All routes in this file are protected and expect an authenticated user

// POST /api/folders - Create a new folder
router.post('/', authMiddleware, folderController.createFolder);

// GET /api/folders - Get user's folders (top-level or children of a parent)
// e.g., /api/folders (for top-level)
// e.g., /api/folders?parentId=someFolderId (for children)
// e.g., /api/folders?parentId=null (explicitly for top-level)
router.get('/', authMiddleware, folderController.getFolders);

// GET /api/folders/:folderId - Get a specific folder's details
router.get('/:folderId', authMiddleware, folderController.getFolderById);

// PUT /api/folders/:folderId - Update a folder (rename, move)
router.put('/:folderId', authMiddleware, folderController.updateFolder);

// DELETE /api/folders/:folderId - Delete a folder
router.delete('/:folderId', authMiddleware, folderController.deleteFolder);

module.exports = router;
