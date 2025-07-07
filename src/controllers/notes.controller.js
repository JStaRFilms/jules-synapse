const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Placeholder for basic CRUD operations for notes (from NOTE-01)
// These would be more fleshed out in a real scenario.

// Create a new note
async function createNote(req, res) {
  const { title, content, tags } = req.body;
  const authorId = req.user.id;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  try {
    const noteOps = {
      title,
      content,
      author: { connect: { id: authorId } },
    };

    if (tags && tags.length > 0) {
      noteOps.tags = {
        connectOrCreate: tags.map(tagName => ({
          where: { name: tagName },
          create: { name: tagName },
        })),
      };
    }

    const note = await prisma.note.create({
      data: noteOps,
      include: { tags: true },
    });
    res.status(201).json(note);
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(500).json({ error: 'Failed to create note' });
  }
}

// Get all notes for the authenticated user
async function getAllNotes(req, res) {
  const authorId = req.user.id;
  const { tag } = req.query;

  try {
    const whereClause = { authorId };
    if (tag) {
      whereClause.tags = { some: { name: tag } };
    }
    const notes = await prisma.note.findMany({
      where: whereClause,
      include: { tags: true },
      orderBy: { updatedAt: 'desc' },
    });
    res.status(200).json(notes);
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
}

// Get a single note by ID
async function getNoteById(req, res) {
  const { id } = req.params;
  const authorId = req.user.id;
  try {
    const note = await prisma.note.findFirst({
      where: { id, authorId },
      include: { tags: true },
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

// Update a note by ID
async function updateNote(req, res) {
  const { id } = req.params;
  const { title, content, tags } = req.body;
  const authorId = req.user.id;

  try {
    // First, verify the note exists and belongs to the user
    const existingNote = await prisma.note.findFirst({
      where: { id, authorId },
      include: { tags: true } // Include current tags
    });

    if (!existingNote) {
      return res.status(404).json({ error: 'Note not found or access denied' });
    }

    const updateData = { title, content };

    if (tags !== undefined) {
      // Handle tag updates: disconnect old tags not in the new list, connect new/existing tags
      const newTagObjects = tags.map(name => ({ name }));

      updateData.tags = {
        // Disconnect tags that are currently connected but not in the new 'tags' array
        disconnect: existingNote.tags
          .filter(currentTag => !tags.includes(currentTag.name))
          .map(tagToDisconnect => ({ id: tagToDisconnect.id })),
        // Connect or create tags from the new 'tags' array
        connectOrCreate: newTagObjects.map(tag => ({
          where: { name: tag.name },
          create: { name: tag.name },
        })),
      };
    }


    const note = await prisma.note.update({
      where: { id }, // No need for authorId here due to the prior check
      data: updateData,
      include: { tags: true },
    });
    res.status(200).json(note);
  } catch (error) {
    console.error('Error updating note:', error);
    if (error.code === 'P2025') { // Prisma error code for record not found during update
        return res.status(404).json({ error: 'Note not found or access denied for update' });
    }
    res.status(500).json({ error: 'Failed to update note' });
  }
}

// Delete a note by ID
async function deleteNote(req, res) {
  const { id } = req.params;
  const authorId = req.user.id;
  try {
    // Verify ownership before deleting
    const noteToDelete = await prisma.note.findFirst({
      where: { id, authorId },
    });

    if (!noteToDelete) {
      return res.status(404).json({ error: 'Note not found or access denied' });
    }

    await prisma.note.delete({
      where: { id },
    });
    res.status(204).send(); // No content
  } catch (error) {
    console.error('Error deleting note:', error);
     if (error.code === 'P2025') { // Prisma error code for record not found during delete
        return res.status(404).json({ error: 'Note not found for deletion' });
    }
    res.status(500).json({ error: 'Failed to delete note' });
  }
}

// --- AUDIO-01 Controller Functions ---

// POST /api/notes/:noteId/audio/start-recording
async function startRecording(req, res) {
  const { noteId } = req.params;
  const authorId = req.user.id;

  try {
    const note = await prisma.note.findFirst({
      where: { id: noteId, authorId },
    });

    if (!note) {
      return res.status(404).json({ error: 'Note not found or access denied' });
    }

    // Logic for starting recording (if any specific backend action is needed beyond confirmation)
    // For now, just a confirmation is fine as per the plan.
    // In a more complex system, you might create an audio session record here.

    res.status(200).json({ message: 'Recording started for note ' + noteId });
  } catch (error) {
    console.error(`Error starting recording for note ${noteId}:`, error);
    res.status(500).json({ error: 'Failed to start recording process' });
  }
}

// POST /api/notes/:noteId/audio/upload
async function uploadAudioFile(req, res) {
  const { noteId } = req.params;
  const authorId = req.user.id;

  if (!req.file) {
    return res.status(400).json({ error: 'No audio file provided.' });
  }

  try {
    const note = await prisma.note.findFirst({
      where: { id: noteId, authorId },
    });

    if (!note) {
      // Potentially delete the uploaded file if the note doesn't exist or isn't owned
      // const fs = require('fs').promises;
      // await fs.unlink(req.file.path);
      return res.status(404).json({ error: 'Note not found or access denied' });
    }

    const updatedNote = await prisma.note.update({
      where: { id: noteId },
      data: { audioFilename: req.file.filename },
    });

    res.status(200).json({
      message: 'Audio uploaded successfully',
      audioFilename: updatedNote.audioFilename,
    });
  } catch (error) {
    console.error(`Error uploading audio for note ${noteId}:`, error);
    // Potentially delete the uploaded file if there's a DB error after upload
    // const fs = require('fs').promises;
    // if(req.file && req.file.path) await fs.unlink(req.file.path).catch(e => console.error("Failed to cleanup file",e));
    res.status(500).json({ error: 'Failed to process audio file upload' });
  }
}

// PUT /api/notes/:noteId/timestamps
async function updateTimestamps(req, res) {
  const { noteId } = req.params;
  const { timestamps } = req.body;
  const authorId = req.user.id;

  if (!Array.isArray(timestamps)) {
    return res.status(400).json({ error: 'Invalid timestamps format. Expected an array.' });
  }

  // Optional: Validate structure of each timestamp object
  for (const ts of timestamps) {
    if (typeof ts.time !== 'number' || typeof ts.textPreview !== 'string') {
      return res.status(400).json({ error: 'Invalid timestamp object structure. Each timestamp must have a numeric "time" and a string "textPreview".' });
    }
  }

  try {
    const note = await prisma.note.findFirst({
      where: { id: noteId, authorId },
    });

    if (!note) {
      return res.status(404).json({ error: 'Note not found or access denied' });
    }

    await prisma.note.update({
      where: { id: noteId },
      data: { audioTimestamps: timestamps },
    });

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
