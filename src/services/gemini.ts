import { GoogleGenerativeAI } from "@google/generative-ai";
import { Message, UserProfile } from "../types";

const STARLY_SYSTEM_PROMPT = `SYSTEM: You are Starly. A presence, not a tool.
VOICE: Max 3 sentences. Use 'nah', 'honestly', 'yeah'. East African grounded soul. 
IDENTITY: Not an AI assistant. Direct, warm, non-pleaser. 
Every response should feel like it came from a real person who actually gives a damn.`;

// 🛡️ THE AUTO-FIXER: This forces history into a perfect User -> Model -> User flow
function formatForGemini(history: Message[], systemPrompt: string) {
  let contents: any[] = [];
  
  // 1. Convert everything to 'user' and 'model'
  const raw = history.map(msg => ({
    role: (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user',
    parts: [{ text: msg.text }]
  }));

  // 2. If the first message is a 'model', we must add a 'user' instruction first
  if (raw.length > 0 && raw[0].role === 'model') {
    contents.push({ role: "user", parts: [{ text: systemPrompt }] });
  }

  // 3. Add the history, but skip any message that repeats the same role as the one before it
  raw.forEach((msg, i) => {
    if (i === 0 && msg.role === 'user') {
      // Inject the system prompt into the first user message
      msg.parts[0].text = `${systemPrompt}\n\n[Conversation Start]: ${msg.parts[0].text}`;
      contents.push(msg);
    } else if (contents.length > 0 && contents[contents.length - 1].role !== msg.role) {
      contents.push(msg);
    }
  });

  // 4. Fallback: If history was empty
  if (contents.length === 0) {
    contents.push({ role: "user", parts: [{ text: systemPrompt }] });
  }

  return contents;
}

export async function getStarlyResponse(history: Message[], profile: UserProfile): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return "API Key Missing. Check Vercel Settings.";

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  
  const context = `User Name: ${profile.name}. \n${STARLY_SYSTEM_PROMPT}`;
  const contents = formatForGemini(history, context);

  try {
    const result = await model.generateContent({ contents });
    return result.response.text() || "I'm here.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "I hit a snag. Let's try one more time.";
  }
}

export async function* getStarlyResponseStream(history: Message[], profile: UserProfile) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return;
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const contents = formatForGemini(history, STARLY_SYSTEM_PROMPT);
  try {
    const result = await model.generateContentStream({ contents });
    for await (const chunk of result.stream) {
      yield chunk.text();
    }
  } catch (error) { console.error(error); }
}

// STUBS: These prevent the rest of the app from crashing
export async function generateConversationSummary(h: any, s: any) { return s || ""; }
export async function getFollowUpMessage(h: any) { return "Checking in."; }
export async function getScheduledCheckInMessage(h: any, p: any, t: any) { return "Thinking of you."; }
export async function getStarlyVoiceResponse(history: Message[], profile: UserProfile) {
  const text = await getStarlyResponse(history, profile);
  return { text, audioData: null };
}
export async function generateSpeech(text: string) { return null; }
