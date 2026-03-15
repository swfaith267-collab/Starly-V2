import { GoogleGenerativeAI } from "@google/generative-ai";

export async function getStarlyResponse(history: any[], profile: any): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return "API Key Missing";

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  
  const systemPrompt = `You are Starly. A direct, warm, East African soul. Max 3 sentences. No AI assistant talk. Use 'nah', 'yeah', 'honestly'.`;
  
  // Clean history for Google
  const contents = history.map(msg => ({
    role: msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user',
    parts: [{ text: msg.text }]
  }));

  // Ensure the very first message is from the user
  if (contents.length === 0 || contents[0].role !== 'user') {
    contents.unshift({ role: 'user', parts: [{ text: systemPrompt }] });
  } else {
    contents[0].parts[0].text = systemPrompt + "\n\n" + contents[0].parts[0].text;
  }

  try {
    const result = await model.generateContent({ contents });
    return result.response.text();
  } catch (e) {
    return "I hit a snag. Let's try again.";
  }
}

// These empty functions prevent other parts of the app from breaking
export async function* getStarlyResponseStream() { yield ""; }
export const generateConversationSummary = async (h: any, s: any) => s || "";
export const getFollowUpMessage = async () => "Checking in.";
export const getScheduledCheckInMessage = async () => "Thinking of you.";
export const getStarlyVoiceResponse = async (h: any, p: any) => ({ text: await getStarlyResponse(h, p), audioData: null });
export const generateSpeech = async () => null;
