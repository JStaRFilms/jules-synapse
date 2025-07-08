const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const geminiService = require('../services/gemini.service.js');

/**
 * Handles chat interaction with the AI in the context of a specific note.
 */
async function chatWithNoteAI(req, res) {
  const { noteId } = req.params;
  const { message } = req.body;
  const authorId = req.user.id;

  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'Message is required and must be a non-empty string.' });
  }

  try {
    // 1. Verify note ownership and retrieve note content + chat history
    const note = await prisma.note.findFirst({
      where: { id: noteId, authorId },
    });

    if (!note) {
      return res.status(404).json({ error: 'Note not found or access denied.' });
    }

    let currentChatHistory = [];
    if (note.chatHistory && Array.isArray(note.chatHistory)) {
      // Ensure chat history is in the format expected by Gemini service: { role, parts: [{ text }] }
      currentChatHistory = note.chatHistory.map(entry => ({
        role: entry.role, // 'user' or 'model'
        parts: [{ text: entry.content }],
      }));
    }

    // 2. Construct system instruction (optional, can be more sophisticated)
    const systemInstruction = `You are an AI assistant helping a user with their personal note. The note content is provided below. Please be concise and helpful. Note Content:\n"""\nTitle: ${note.title}\nContent: ${note.content || 'No content.'}\n"""`;

    // 3. Call Gemini service
    const aiReplyContent = await geminiService.generateChatCompletion(
      currentChatHistory,
      message,
      systemInstruction
    );

    // 4. Append user message and AI reply to chat history for storage
    const newHistoryForStorage = [
      ...(note.chatHistory && Array.isArray(note.chatHistory) ? note.chatHistory : []), // old history in DB format
      { role: 'user', content: message, timestamp: new Date().toISOString() },
      { role: 'model', content: aiReplyContent, timestamp: new Date().toISOString() },
    ];

    // 5. Update note with new chat history
    await prisma.note.update({
      where: { id: noteId },
      data: { chatHistory: newHistoryForStorage },
    });

    // 6. Return AI's reply and the updated history (in DB format)
    res.status(200).json({
      reply: aiReplyContent,
      updatedChatHistory: newHistoryForStorage,
    });

  } catch (error) {
    console.error(`Error in chatWithNoteAI for note ${noteId}:`, error);
    if (error.message.includes("AI response blocked due to safety settings")) {
        return res.status(400).json({ error: error.message });
    }
    if (error.message.includes("AI request blocked")) {
        return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: `Failed to process AI chat request: ${error.message}` });
  }
}

/**
 * Handles AI performing a specific action (e.g., summarize) on a note.
 */
async function performNoteActionAI(req, res) {
  const { noteId } = req.params;
  const { action, selection } = req.body; // selection is optional selected text
  const authorId = req.user.id;

  if (!action || typeof action !== 'string') {
    return res.status(400).json({ error: 'Action is required and must be a string.' });
  }

  try {
    // 1. Verify note ownership and retrieve note content
    const note = await prisma.note.findFirst({
      where: { id: noteId, authorId },
    });

    if (!note) {
      return res.status(404).json({ error: 'Note not found or access denied.' });
    }

    const textToProcess = selection || note.content || ''; // Use selection if available, else full content
    if (!textToProcess && action !== 'brainstorm') { // Brainstorm might not need initial text
        return res.status(400).json({ error: 'No content available in the note or selection to perform this action.' });
    }

    let promptContent;
    let systemInstruction = "You are an AI assistant helping a user with their personal note.";

    // 2. Construct prompt based on action
    switch (action.toLowerCase()) {
      case 'summarize':
        promptContent = `Please summarize the following text:\n"""\n${textToProcess}\n"""`;
        break;
      case 'brainstorm_ideas':
        promptContent = `Based on the following text (or general topic if text is short/empty), please help me brainstorm some related ideas, questions, or next steps:\n"""\n${textToProcess}\n"""\nNote Title: ${note.title}`;
        systemInstruction = "You are a creative AI assistant helping a user brainstorm ideas related to their note. Provide a list of distinct ideas or questions."
        break;
      case 'explain_concept':
         promptContent = `Please explain the core concept in the following text in simpler terms:\n"""\n${textToProcess}\n"""`;
         systemInstruction = "You are an AI assistant skilled at explaining complex topics simply."
        break;
      // Add more actions as needed
      default:
        return res.status(400).json({ error: `Unsupported action: ${action}` });
    }

    // 3. Call Gemini service
    const aiResultText = await geminiService.generateActionContent(promptContent, systemInstruction);

    // 4. Return AI's textual output
    // For AI-01, we are not modifying the note directly or saving this interaction to chatHistory by default for actions.
    // This could be an enhancement if actions should also be part of the chat log.
    res.status(200).json({
      action: action,
      result: aiResultText,
    });

  } catch (error) {
    console.error(`Error in performNoteActionAI for note ${noteId}, action ${action}:`, error);
    if (error.message.includes("AI response blocked due to safety settings")) {
        return res.status(400).json({ error: error.message });
    }
     if (error.message.includes("AI request blocked")) {
        return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: `Failed to process AI action request: ${error.message}` });
  }
}

module.exports = {
  chatWithNoteAI,
  performNoteActionAI,
};
