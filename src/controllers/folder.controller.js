const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();

// Helper function to check folder ownership
async function checkFolderOwnership(folderId, userId) {
  const folder = await prisma.folder.findUnique({ where: { id: folderId } });
  if (!folder || folder.userId !== userId) {
    return false;
  }
  return folder;
}

// POST /api/folders (Create a new folder)
async function createFolder(req, res) {
  const { name, parentId } = req.body;
  const userId = req.user.id;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'Folder name is required and must be a non-empty string.' });
  }

  try {
    // If parentId is provided, check if it's a valid folder owned by the user
    if (parentId) {
      const parentFolder = await checkFolderOwnership(parentId, userId);
      if (!parentFolder) {
        return res.status(404).json({ error: 'Parent folder not found or access denied.' });
      }
    }

    const newFolder = await prisma.folder.create({
      data: {
        name: name.trim(),
        userId,
        parentId, // This will be null if not provided, creating a top-level folder
      },
    });
    res.status(201).json(newFolder);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // Unique constraint failed (e.g. folder with same name under same parent for this user)
      return res.status(409).json({ error: 'A folder with this name already exists at this level.' });
    }
    console.error('Error creating folder:', error);
    res.status(500).json({ error: 'Failed to create folder.' });
  }
}

// GET /api/folders (Get user's folder hierarchy)
async function getFolders(req, res) {
  const userId = req.user.id;
  const { parentId: queryParentId } = req.query; // queryParentId can be a specific ID or 'null' for root

  try {
    const whereClause = {
      userId,
      parentId: queryParentId === 'null' || queryParentId === undefined ? null : queryParentId,
    };

    const folders = await prisma.folder.findMany({
      where: whereClause,
      orderBy: { name: 'asc' },
      // Optionally include children or note counts if needed for specific views
      // include: { _count: { select: { children: true, notes: true } } }
    });
    res.status(200).json(folders);
  } catch (error) {
    console.error('Error fetching folders:', error);
    res.status(500).json({ error: 'Failed to fetch folders.' });
  }
}

// GET /api/folders/:folderId (Get a specific folder's details)
async function getFolderById(req, res) {
  const { folderId } = req.params;
  const userId = req.user.id;

  try {
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, userId }, // Ensures ownership
      // include: { children: true, notes: true } // Optionally include children and notes
    });

    if (!folder) {
      return res.status(404).json({ error: 'Folder not found or access denied.' });
    }
    res.status(200).json(folder);
  } catch (error) {
    console.error(`Error fetching folder ${folderId}:`, error);
    res.status(500).json({ error: 'Failed to fetch folder details.' });
  }
}

// PUT /api/folders/:folderId (Update a folder - e.g., rename, move)
async function updateFolder(req, res) {
  const { folderId } = req.params;
  const { name, parentId: newParentId } = req.body;
  const userId = req.user.id;

  if ((name !== undefined && (typeof name !== 'string' || name.trim() === '')) ||
      (newParentId !== undefined && (typeof newParentId !== 'string' && newParentId !== null))) {
    return res.status(400).json({ error: 'Invalid input: Name must be a non-empty string, parentId must be a string or null.' });
  }

  if (name === undefined && newParentId === undefined) {
    return res.status(400).json({ error: 'No update fields provided (name or parentId).' });
  }

  try {
    const folderToUpdate = await checkFolderOwnership(folderId, userId);
    if (!folderToUpdate) {
      return res.status(404).json({ error: 'Folder not found or access denied.' });
    }

    const updateData = {};
    if (name !== undefined) {
      updateData.name = name.trim();
    }

    if (newParentId !== undefined) {
      if (newParentId === folderId) {
        return res.status(400).json({ error: 'Folder cannot be its own parent.' });
      }
      if (newParentId === null) { // Moving to root
        updateData.parentId = null;
      } else {
        // Check if new parent exists and is owned by user
        const parentFolder = await checkFolderOwnership(newParentId, userId);
        if (!parentFolder) {
          return res.status(404).json({ error: 'Target parent folder not found or access denied.' });
        }
        // Check for circular dependency: newParent must not be a descendant of folderToUpdate
        let current = parentFolder;
        while (current) {
          if (current.parentId === folderId) {
            return res.status(400).json({ error: 'Circular dependency: Cannot move folder into one of its own children.' });
          }
          if (!current.parentId) break; // Reached root
          current = await prisma.folder.findUnique({ where: { id: current.parentId }});
           // ensure the fetched folder is also owned by the user (should be, due to parent check)
          if (current && current.userId !== userId) return res.status(403).json({ error: "Access denied to an ancestor folder."})
        }
        updateData.parentId = newParentId;
      }
    }

    if (Object.keys(updateData).length === 0) {
        // This case should ideally be caught by the initial check, but as a safeguard:
        return res.status(200).json(folderToUpdate); // No actual changes made
    }


    const updatedFolder = await prisma.folder.update({
      where: { id: folderId },
      data: updateData,
    });
    res.status(200).json(updatedFolder);
  } catch (error) {
     if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'A folder with this name already exists at the target level.' });
    }
    console.error(`Error updating folder ${folderId}:`, error);
    res.status(500).json({ error: 'Failed to update folder.' });
  }
}

// DELETE /api/folders/:folderId (Delete a folder)
async function deleteFolder(req, res) {
  const { folderId } = req.params;
  const userId = req.user.id;

  try {
    const folderToDelete = await checkFolderOwnership(folderId, userId);
    if (!folderToDelete) {
      return res.status(404).json({ error: 'Folder not found or access denied.' });
    }

    // Prisma's `onDelete: Cascade` on the self-relation handles child folders.
    // Prisma's `onDelete: SetNull` on Note.folder handles notes within this folder.
    // So, a direct delete on the folder is sufficient.
    await prisma.folder.delete({
      where: { id: folderId },
    });

    res.status(204).send();
  } catch (error) {
    console.error(`Error deleting folder ${folderId}:`, error);
    // P2014: "The change you are trying to make would violate the required relation '{relation_name}' between the {model_a_name} and {model_b_name} models."
    // This might occur if onDelete: Restrict was used and children/notes exist. With Cascade/SetNull, it should be fine.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2014'){
        return res.status(409).json({ error: "Cannot delete folder. It might have dependent items that prevent deletion (check relations)." })
    }
    res.status(500).json({ error: 'Failed to delete folder.' });
  }
}

module.exports = {
  createFolder,
  getFolders,
  getFolderById,
  updateFolder,
  deleteFolder,
};
