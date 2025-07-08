const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn('GEMINI_API_KEY is not set. AI features will not work.');
  // In a real app, you might throw an error or have a more robust fallback/notification
}

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const model = genAI ? genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' }) : null; // Or another suitable model

// Basic safety settings - adjust as needed
const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];

/**
 * Generates a chat completion using the Gemini API based on the provided history and new message.
 * @param {Array<Object>} history - The conversation history. Each object should have 'role' ('user' or 'model') and 'parts' (array of {text: "message content"}).
 * @param {String} newMessageContent - The new user message content.
 * @param {String} systemInstruction - An optional system instruction for the AI.
 * @returns {Promise<String>} The AI's reply text.
 * @throws {Error} If the API call fails or the API key is not set.
 */
async function generateChatCompletion(history, newMessageContent, systemInstruction = null) {
  if (!model) {
    throw new Error('Gemini AI model is not initialized. Check API Key.');
  }

  const chat = model.startChat({
    history: history, // Expects format: [{ role: "user", parts: [{ text: "Hello" }] }, { role: "model", parts: [{ text: "Hi there" }] }]
    safetySettings,
    generationConfig: {
      maxOutputTokens: 2000, // Adjust as needed
    },
    ...(systemInstruction && { systemInstruction: { parts: [{ text: systemInstruction }] } }),
  });

  try {
    const result = await chat.sendMessage(newMessageContent);
    const response = result.response;
    if (response && response.candidates && response.candidates.length > 0 && response.candidates[0].content) {
      // Check for finishReason other than "STOP"
      if (response.candidates[0].finishReason && response.candidates[0].finishReason !== "STOP" && response.candidates[0].finishReason !== "MAX_TOKENS") {
        // Potentially blocked by safety settings or other reasons
        const reason = response.candidates[0].finishReason;
        const safetyRatingsMessage = response.candidates[0].safetyRatings ? ` Safety Ratings: ${JSON.stringify(response.candidates[0].safetyRatings)}` : '';
        console.warn(`Gemini response finished with reason: ${reason}.${safetyRatingsMessage}`);
        if (reason === "SAFETY") {
            throw new Error(`AI response blocked due to safety settings.${safetyRatingsMessage}`);
        }
        // For other reasons, you might still want to return partial content if available, or a generic message
        // For now, if not "STOP" or "MAX_TOKENS", and there's no text, throw error.
        // If there is text, it might be a partial response before blockage.
      }
      if (response.candidates[0].content.parts && response.candidates[0].content.parts.length > 0 && response.candidates[0].content.parts[0].text) {
        return response.candidates[0].content.parts[0].text;
      } else {
         // This case might happen if the response is blocked and has no content parts
         const reason = response.candidates[0].finishReason || "Unknown";
         const safetyRatingsMessage = response.candidates[0].safetyRatings ? ` Safety Ratings: ${JSON.stringify(response.candidates[0].safetyRatings)}` : '';
         throw new Error(`AI response was empty or incomplete. Finish reason: ${reason}.${safetyRatingsMessage}`);
      }

    } else if (response && response.promptFeedback) {
        // Handle cases where the prompt itself was blocked
        const feedback = response.promptFeedback;
        console.warn('Gemini prompt feedback:', feedback);
        throw new Error(`AI request blocked. Reason: ${feedback.blockReason}. ${feedback.blockReasonMessage || ''}`);
    }

    throw new Error('Invalid or empty response from AI service.');
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    if (error.message.includes("SAFETY")) { // Propagate safety errors clearly
        throw error;
    }
    throw new Error(`Failed to get chat completion from AI: ${error.message}`);
  }
}


/**
 * Generates content for a specific action (e.g., summarize, brainstorm) using a direct prompt.
 * @param {String} promptContent - The full prompt content for the AI.
 * @param {String} systemInstruction - An optional system instruction.
 * @returns {Promise<String>} The AI's generated text.
 * @throws {Error} If the API call fails or the API key is not set.
 */
async function generateActionContent(promptContent, systemInstruction = null) {
  if (!model) {
    throw new Error('Gemini AI model is not initialized. Check API Key.');
  }

  const fullPrompt = [];
  if(systemInstruction) {
    // For non-chat generation, system instruction is usually part of the main prompt or specific config
    // For gemini-1.5-flash, it's better to prepend it to the user prompt if not using startChat()
     fullPrompt.push({text: `System Preamble: ${systemInstruction}\n\nUser Request:\n${promptContent}`});
  } else {
     fullPrompt.push({text: promptContent});
  }


  try {
    const result = await model.generateContent({
        contents: [{ role: "user", parts: fullPrompt }],
        safetySettings,
        generationConfig: {
          maxOutputTokens: 2000, // Adjust as needed
        },
    });
    const response = result.response;

    if (response && response.candidates && response.candidates.length > 0 && response.candidates[0].content) {
       if (response.candidates[0].finishReason && response.candidates[0].finishReason !== "STOP" && response.candidates[0].finishReason !== "MAX_TOKENS") {
        const reason = response.candidates[0].finishReason;
        const safetyRatingsMessage = response.candidates[0].safetyRatings ? ` Safety Ratings: ${JSON.stringify(response.candidates[0].safetyRatings)}` : '';
        console.warn(`Gemini response finished with reason: ${reason}.${safetyRatingsMessage}`);
         if (reason === "SAFETY") {
            throw new Error(`AI response blocked due to safety settings.${safetyRatingsMessage}`);
        }
      }
      if (response.candidates[0].content.parts && response.candidates[0].content.parts.length > 0 && response.candidates[0].content.parts[0].text) {
        return response.candidates[0].content.parts[0].text;
      } else {
         const reason = response.candidates[0].finishReason || "Unknown";
         const safetyRatingsMessage = response.candidates[0].safetyRatings ? ` Safety Ratings: ${JSON.stringify(response.candidates[0].safetyRatings)}` : '';
         throw new Error(`AI response was empty or incomplete. Finish reason: ${reason}.${safetyRatingsMessage}`);
      }
    } else if (response && response.promptFeedback) {
        const feedback = response.promptFeedback;
        console.warn('Gemini prompt feedback:', feedback);
        throw new Error(`AI request blocked. Reason: ${feedback.blockReason}. ${feedback.blockReasonMessage || ''}`);
    }
    throw new Error('Invalid or empty response from AI service for action content.');
  } catch (error) {
    console.error('Error calling Gemini API for action content:', error);
    if (error.message.includes("SAFETY")) {
        throw error;
    }
    throw new Error(`Failed to generate action content from AI: ${error.message}`);
  }
}


module.exports = {
  generateChatCompletion,
  generateActionContent,
};
