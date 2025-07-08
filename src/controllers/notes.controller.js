const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Helper to check folder ownership (could be in a shared util if used elsewhere)
async function checkFolderOwnership(folderId, userId) {
    if (!folderId) return true; // No folder specified, so no ownership to check for it
    const folder = await prisma.folder.findUnique({ where: { id: folderId } });
    if (!folder || folder.userId !== userId) {
      return false;
    }
    return true;
}


// Create a new note with tags and optional folder (ORG-01)
async function createNote(req, res) {
  const { title, content, tags, folderId } = req.body; // Added folderId
  const authorId = req.user.id;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }
  if (tags && !Array.isArray(tags)) {
    return res.status(400).json({ error: 'Tags must be an array of strings.' });
  }
  if (tags && tags.some(tag => typeof tag !== 'string')) {
    return res.status(400).json({ error: 'Each tag in the array must be a string.' });
  }
  if (folderId && typeof folderId !== 'string') {
    return res.status(400).json({ error: 'folderId must be a string if provided.' });
  }

  try {
    // Validate folder ownership if folderId is provided
    if (folderId) {
        const folderOwned = await checkFolderOwnership(folderId, authorId);
        if (!folderOwned) {
            return res.status(403).json({ error: 'Access denied: Folder not found or not owned by user.' });
        }
    }

    const noteData = {
      title,
      content,
      author: { connect: { id: authorId } },
    };

    if (folderId) {
      noteData.folder = { connect: { id: folderId } };
    }

    if (tags && tags.length > 0) {
      noteData.tags = {
        connectOrCreate: tags.map(tagName => ({
          where: { name: tagName },
          create: { name: tagName },
        })),
      };
    }

    const note = await prisma.note.create({
      data: noteData,
      include: {
        tags: true,
        folder: true, // Include folder details in the response
      },
    });
    res.status(201).json(note);
  } catch (error) {
    console.error('Error creating note:', error);
    // P2025 can happen if folderId is invalid (Prisma specific)
    if (error.code === 'P2025' && error.meta?.cause?.includes('Folder')) {
        return res.status(404).json({ error: 'Specified folder not found.' });
    }
    res.status(500).json({ error: 'Failed to create note' });
  }
}

// Get all notes for the authenticated user, with optional tag and folder filtering (ORG-01)
async function getAllNotes(req, res) {
  const authorId = req.user.id;
  const { tag: tagName, folderId: queryFolderId } = req.query; // Added folderId query param

  try {
    const whereClause = { authorId };
    if (tagName) {
      whereClause.tags = {
        some: { name: tagName },
      };
    }

    // Handle folderId filter:
    // - If folderId is a specific ID, filter by it.
    // - If folderId is 'null' (string), filter for notes with no folder (folderId IS NULL).
    // - If folderId is not provided, no folder filter is applied (gets all user's notes).
    if (queryFolderId !== undefined) {
        if (queryFolderId === 'null' || queryFolderId === '') { // Treat empty string as root/unfiled
            whereClause.folderId = null;
        } else {
            // Optional: Check if user owns this folderId before filtering.
            // For now, just filtering. If folder doesn't exist or not owned, result will be empty for this filter.
            whereClause.folderId = queryFolderId;
        }
    }


    const notes = await prisma.note.findMany({
      where: whereClause,
      include: {
        tags: true,
        folder: true, // Include folder details
      },
      orderBy: { updatedAt: 'desc' },
    });
    res.status(200).json(notes);
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
}

// Get a single note by ID (includes tags and folder)
async function getNoteById(req, res) {
  const { id } = req.params;
  const authorId = req.user.id;
  try {
    const note = await prisma.note.findFirst({
      where: { id, authorId },
      include: {
        tags: true,
        folder: true, // Include folder details
      },
    });
    if (!note) {
      return res.status(404).json({ error: 'Note not found or access denied' });
    }
    res.status(200).json(note);
  } catch (error) {
    console.error('Error fetching note by ID:', error);
    res.status(500).json({ error: 'Failed to fetch note' });
  }
}

// Update a note by ID, including tags and folder (ORG-01)
async function updateNote(req, res) {
  const { id } = req.params;
  const { title, content, tags, folderId } = req.body; // Added folderId
  const authorId = req.user.id;

  if (tags && !Array.isArray(tags)) {
    return res.status(400).json({ error: 'Tags must be an array of strings.' });
  }
  if (tags && tags.some(tag => typeof tag !== 'string')) {
    return res.status(400).json({ error: 'Each tag in the array must be a string.' });
  }
  if (folderId !== undefined && folderId !== null && typeof folderId !== 'string') {
     return res.status(400).json({ error: 'folderId must be a string or null if provided.' });
  }


  try {
    const existingNote = await prisma.note.findFirst({
      where: { id, authorId },
      include: { tags: true }
    });

    if (!existingNote) {
      return res.status(404).json({ error: 'Note not found or access denied' });
    }

    // Validate folder ownership if folderId is being changed or set
    if (folderId !== undefined) { // folderId can be null (to unassign) or a string
        if (folderId !== null) { // if it's a specific folder ID
            const folderOwned = await checkFolderOwnership(folderId, authorId);
            if (!folderOwned) {
                return res.status(403).json({ error: 'Access denied: Target folder not found or not owned by user.' });
            }
        }
    }


    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;

    if (folderId !== undefined) { // Allows setting folderId to null or a new ID
        updateData.folderId = folderId; // Prisma handles connect/disconnect via ID field
    }


    if (tags !== undefined) {
      updateData.tags = {
        set: [],
        connectOrCreate: tags.map(tagName => ({
          where: { name: tagName },
          create: { name: tagName },
        })),
      };
    }

    if (Object.keys(updateData).length === 0) {
        // Check if it's just an attempt to set tags to the same state
        if (tags !== undefined &&
            JSON.stringify(tags.sort()) === JSON.stringify(existingNote.tags.map(t => t.name).sort())) {
            return res.status(200).json(existingNote); // No actual change
        }
        return res.status(400).json({ error: 'No update fields provided or no actual changes detected.'});
    }

    const updatedNote = await prisma.note.update({
      where: { id },
      data: updateData,
      include: {
        tags: true,
        folder: true, // Include folder details
      },
    });
    res.status(200).json(updatedNote);
  } catch (error) {
    console.error('Error updating note:', error);
    if (error.code === 'P2025') {
        // Can be "Record to update not found." or related to foreign key constraint on folderId
        const message = error.meta?.cause || 'Failed to update note due to a record not being found or a constraint violation.';
        return res.status(404).json({ error: message });
    }
    res.status(500).json({ error: 'Failed to update note' });
  }
}

// Delete a note by ID (Unaffected by ORG-01 directly for its own logic)
async function deleteNote(req, res) {
  const { id } = req.params;
  const authorId = req.user.id;
  try {
    const noteToDelete = await prisma.note.findFirst({
      where: { id, authorId },
    });

    if (!noteToDelete) {
      return res.status(404).json({ error: 'Note not found or access denied' });
    }

    await prisma.note.delete({
      where: { id },
    });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting note:', error);
     if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Note not found for deletion' });
    }
    res.status(500).json({ error: 'Failed to delete note' });
  }
}

// --- AUDIO-01 Controller Functions ---
// These remain unchanged
async function startRecording(req, res) {
  const { noteId } = req.params;
  const authorId = req.user.id;
  try {
    const note = await prisma.note.findFirst({ where: { id: noteId, authorId } });
    if (!note) return res.status(404).json({ error: 'Note not found or access denied' });
    res.status(200).json({ message: 'Recording started for note ' + noteId });
  } catch (error) {
    console.error(`Error starting recording for note ${noteId}:`, error);
    res.status(500).json({ error: 'Failed to start recording process' });
  }
}

async function uploadAudioFile(req, res) {
  const { noteId } = req.params;
  const authorId = req.user.id;
  if (!req.file) return res.status(400).json({ error: 'No audio file provided.' });
  try {
    const note = await prisma.note.findFirst({ where: { id: noteId, authorId } });
    if (!note) return res.status(404).json({ error: 'Note not found or access denied' });
    const updatedNote = await prisma.note.update({
      where: { id: noteId }, data: { audioFilename: req.file.filename },
    });
    res.status(200).json({ message: 'Audio uploaded successfully', audioFilename: updatedNote.audioFilename });
  } catch (error) {
    console.error(`Error uploading audio for note ${noteId}:`, error);
    res.status(500).json({ error: 'Failed to process audio file upload' });
  }
}

async function updateTimestamps(req, res) {
  const { noteId } = req.params;
  const { timestamps } = req.body;
  const authorId = req.user.id;
  if (!Array.isArray(timestamps) || timestamps.some(ts => typeof ts.time !== 'number' || typeof ts.textPreview !== 'string')) {
    return res.status(400).json({ error: 'Invalid timestamps format.' });
  }
  try {
    const note = await prisma.note.findFirst({ where: { id: noteId, authorId } });
    if (!note) return res.status(404).json({ error: 'Note not found or access denied' });
    await prisma.note.update({ where: { id: noteId }, data: { audioTimestamps: timestamps } });
    res.status(200).json({ message: 'Timestamps updated successfully' });
  } catch (error) {
    console.error(`Error updating timestamps for note ${noteId}:`, error);
    res.status(500).json({ error: 'Failed to update timestamps' });
  }
}

module.exports = {
  createNote,
  getAllNotes,
  getNoteById,
  updateNote,
  deleteNote,
  startRecording,
  uploadAudioFile,
  updateTimestamps,
};
