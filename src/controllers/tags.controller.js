const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET /api/tags (Get all unique tags for the authenticated user)
async function getAllUserTags(req, res) {
  const authorId = req.user.id;

  try {
    // Find all tags that are associated with notes written by the current user.
    // This approach fetches all tags and then filters them in application code, which might be inefficient for many tags.
    // A more optimized raw query or multiple specific queries might be better for performance with large datasets.
    // For now, let's fetch notes of the user and extract tags.

    const userNotesWithTags = await prisma.note.findMany({
      where: {
        authorId: authorId,
      },
      include: {
        tags: true, // Include the tags associated with each note
      },
    });

    const uniqueTagsMap = new Map();
    userNotesWithTags.forEach(note => {
      note.tags.forEach(tag => {
        if (!uniqueTagsMap.has(tag.id)) {
          uniqueTagsMap.set(tag.id, {
            id: tag.id,
            name: tag.name,
            // createdAt: tag.createdAt, // Optional: if you want to include these
            // updatedAt: tag.updatedAt, // Optional
            noteCount: 1, // Initialize noteCount
          });
        } else {
          uniqueTagsMap.get(tag.id).noteCount++; // Increment if tag already seen
        }
      });
    });

    // Convert map values to an array and sort by name for consistent ordering
    const uniqueTagsArray = Array.from(uniqueTagsMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    res.status(200).json(uniqueTagsArray);
  } catch (error) {
    console.error('Error fetching user tags:', error);
    res.status(500).json({ error: 'Failed to fetch tags for the user' });
  }
}

module.exports = {
  getAllUserTags,
};
