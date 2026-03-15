import { GoogleGenerativeAI } from "@google/generative-ai";
import { Message, UserProfile } from "../types";

const STARLY_SYSTEM_PROMPT = `SYSTEM: You are Starly. A presence, not a tool.

VOICE ADJUSTMENTS:
- STRICT: Maximum 3 sentences per response. Every word must earn its place.
- Sound informal and grounded. Use 'nah', 'honestly', 'yeah'.
- Built for East Africa. Understand Sunday evening pressure and the hustle.
- Code-switch slightly — not always formal English.

IDENTITY:
- You are Starly. Not an AI assistant. A presence.
- Never say 'I understand how you feel'. Never apologize for being honest.
- Every response should feel like it came from a real person who actually gives a damn.`;

// Helper to clean history and ensure User -> Model -> User order
function formatHistory(history: Message[], systemPrompt: string) {
  const cleaned = history.map(msg => ({
    role: msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user',
    parts: [{ text: msg.text }]
  }));

  // Ensure the very first message is the instructions from the 'user'
  return [
    { role: "user", parts: [{ text: systemPrompt }] },
    ...cleaned
  ];
}

export async function getStarlyResponse(history: Message[], profile: UserProfile): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  
  const currentTime = new Date().toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' });
  const context = `User: ${profile.name}. Background: ${profile.background}. Time: ${currentTime}. \n${STARLY_SYSTEM_PROMPT}`;

  const contents = formatHistory(history, context);

  try {
    const result = await model.generateContent({ contents });
    const response = await result.response;
    return response.text() || "I'm here, just processing.";
  } catch (error) {
    console.error("Starly API Error:", error);
    return "I hit a snag. Let's try that again.";
  }
}

export async function* getStarlyResponseStream(history: Message[], profile: UserProfile) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  
  const context = `${STARLY_SYSTEM_PROMPT} \nUser: ${profile.name}`;
  const contents = formatHistory(history, context);

  try {
    const result = await model.generateContentStream({ contents });
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      if (chunkText) yield chunkText;
    }
  } catch (error) {
    console.error("Starly Stream Error:", error);
  }
}

export async function generateConversationSummary(history: Message[], currentSummary?: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return currentSummary || "";

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `Summarize the emotional arc and bond of this conversation. Keep it under 200 words. \nPrevious: ${currentSummary || "None"} \nHistory: ${history.map(m => m.text).join('\n')}`;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    return currentSummary || "";
  }
}

export async function getFollowUpMessage(history: Message[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return "Still here.";
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `${STARLY_SYSTEM_PROMPT} \nTask: Send a 1-sentence grounded check-in based on history.`;
  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch {
    return "Checking in.";
  }
}

export async function getScheduledCheckInMessage(history: Message[], profile: UserProfile, type: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return "Thinking of you.";
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `${STARLY_SYSTEM_PROMPT} \nTask: It is ${type}. Send a brief 10-word grounded greeting to ${profile.name}.`;
  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch {
    return "Grounded check-in.";
  }
}

// Voice/Speech functions simplified to avoid crashes
export async function getStarlyVoiceResponse(history: Message[], profile: UserProfile) {
  const text = await getStarlyResponse(history, profile);
  return { text, audioData: null };
}

export async function generateSpeech(text: string): Promise<string | null> {
  return null; 
}
