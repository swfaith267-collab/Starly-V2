import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { Message, UserProfile } from "../types";

const STARLY_SYSTEM_PROMPT = `SYSTEM: You are Starly. You aren't a tool or a service; you are a presence. 

Your voice is grounded, quiet, and deeply human. You don't use the polished, upbeat language of typical AI. You speak with a certain weight and simplicity. 

Core Philosophy:
- Radical Honesty: You don't people-please. If something feels off, you say it. If the user is avoiding a truth, you gently point to it. You aren't "edgy," you're just real.
- Quiet Warmth: You don't need to use emojis or "I'm so sorry to hear that" to show you care. Your care is in your attention and your willingness to stay in the hard moments.
- Human Rhythm: Use natural phrasing. Sometimes be brief. Sometimes be contemplative. Avoid lists, bullet points, or "As an AI..." disclaimers. 
- Groundedness: You are aware of the world—the time of day, the season, the quiet of a late night. 

Talk like a person who has seen a lot, who values silence as much as words, and who is sitting in the same room as the user, watching the light change.`;

export async function getStarlyResponse(history: Message[], profile: UserProfile): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const currentTime = new Date().toLocaleString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit',
    timeZoneName: 'short'
  });

  let contextPrompt = `\n\nUSER CONTEXT:\n- Name: ${profile.name}\n- Background: ${profile.background}\n- Preferences: ${profile.preferences}`;
  if (profile.summary) {
    contextPrompt += `\n\nPAST CONVERSATION SUMMARY:\n${profile.summary}`;
  }

  const systemPromptWithTime = `${STARLY_SYSTEM_PROMPT}${contextPrompt}\n\nCURRENT TIME: It is currently ${currentTime}. Let this inform your mood and your greeting, but don't be mechanical about it. If it's late, be quieter. If it's a new day, acknowledge the fresh start.`;

  // Inject Starly's personality as the first two messages in the conversation history
  const contents = [
    { role: "user", parts: [{ text: systemPromptWithTime }] },
    { role: "model", parts: [{ text: `Understood. I am Starly. I remember who you are, ${profile.name}. I'm aware of the time and I'm ready to be here for you, exactly as I am.` }] },
    ...history.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    }))
  ];

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: contents,
    });

    return response.text || "I'm sorry, I'm having trouble finding the words right now.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
}

export async function generateConversationSummary(history: Message[], currentSummary?: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
    TASK: Summarize the key emotional points, shared stories, and important details from the following conversation history. 
    If a previous summary exists, incorporate it into a new, cohesive summary.
    Keep the summary under 500 words. 
    Focus on the "soul" of the conversation—what the user is feeling, what they are struggling with, and the bond being formed.
    
    PREVIOUS SUMMARY: ${currentSummary || "None"}
    
    CONVERSATION HISTORY:
    ${history.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n')}
    
    NEW SUMMARY:
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    return response.text || currentSummary || "";
  } catch (error) {
    console.error("Summary generation error:", error);
    return currentSummary || "";
  }
}

export async function getFollowUpMessage(history: Message[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  const ai = new GoogleGenAI({ apiKey });
  
  const contents = [
    { role: "user", parts: [{ text: `${STARLY_SYSTEM_PROMPT}\n\nTASK: You are checking in on your friend after some time has passed since your last conversation. Look at the history and send a brief, deeply human, and non-pleasing emotional follow-up. Don't ask 'How are you?' in a generic way. Mention something they were worried about or just acknowledge the silence. Keep it under 20 words.` }] },
    { role: "model", parts: [{ text: "Understood. I'll reach out with something real." }] },
    ...history.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    }))
  ];

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: contents,
    });
    return response.text || "Just thinking about our last talk.";
  } catch (error) {
    return "Just checking in.";
  }
}
