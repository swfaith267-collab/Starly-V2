// @ts-nocheck
import { GoogleGenerativeAI } from "@google/generative-ai";

const STARLY_PROMPT = `SYSTEM: You are Starly. East African soul. Direct, warm, non-pleaser. Max 3 sentences. Use 'nah', 'yeah', 'honestly'. Not an AI assistant.`;

function formatForGemini(history, systemPrompt) {
  let contents = [];
  // Ensure we start with a user message
  contents.push({ role: "user", parts: [{ text: systemPrompt }] });
  contents.push({ role: "model", parts: [{ text: "Understood. I am Starly." }] });

  history.forEach((msg) => {
    const role = (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user';
    // Only add if it alternates roles
    if (contents.length > 0 && contents[contents.length - 1].role !== role) {
      contents.push({ role: role, parts: [{ text: msg.text }] });
    }
  });
  return contents;
}

export async function getStarlyResponse(history, profile) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return "API Key Missing";
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const context = `User: ${profile.name}. \n${STARLY_PROMPT}`;
  const contents = formatForGemini(history, context);
  try {
    const result = await model.generateContent({ contents });
    return result.response.text();
  } catch (e) { return "I hit a snag. Try again?"; }
}

export async function* getStarlyResponseStream(history, profile, shortMode) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return;
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const contents = formatForGemini(history, STARLY_PROMPT);
  try {
    const result = await model.generateContentStream({ contents });
    for await (const chunk of result.stream) { yield chunk.text(); }
  } catch (e) {}
}

export const generateConversationSummary = async (h, s) => s || "";
export const getFollowUpMessage = async () => "Checking in.";
export const getScheduledCheckInMessage = async () => "Thinking of you.";
export const getStarlyVoiceResponse = async (h, p) => ({ text: await getStarlyResponse(h, p), audioData: null });
export const generateSpeech = async () => null;
