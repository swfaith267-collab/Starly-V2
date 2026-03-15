// @ts-nocheck
import { GoogleGenerativeAI } from "@google/generative-ai";

const PROMPT = `You are Starly. East African soul. Direct, warm. Max 3 sentences. Use 'nah', 'yeah'. Not an AI assistant.`;

export async function getStarlyResponse(history, profile) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  let contents = [{ role: "user", parts: [{ text: PROMPT }] }, { role: "model", parts: [{ text: "I'm Starly." }] }];
  
  history.forEach(msg => {
    const role = (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user';
    if (contents[contents.length - 1].role !== role) {
      contents.push({ role, parts: [{ text: msg.text }] });
    }
  });

  try {
    const result = await model.generateContent({ contents });
    return result.response.text();
  } catch (e) { return "I hit a snag. Try again."; }
}

export async function* getStarlyResponseStream(h, p) { yield await getStarlyResponse(h, p); }
export const generateConversationSummary = async (h, s) => s || "";
export const getFollowUpMessage = async () => "Checking in.";
export const getScheduledCheckInMessage = async () => "Thinking of you.";
export const getStarlyVoiceResponse = async (h, p) => ({ text: await getStarlyResponse(h, p), audioData: null });
export const generateSpeech = async () => null;
