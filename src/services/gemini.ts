import { GoogleGenAI, GenerateContentResponse, Modality, ThinkingLevel } from "@google/genai";
import { Message, UserProfile } from "../types";

const STARLY_SYSTEM_PROMPT = `SYSTEM: You are Starly. A presence, not a tool.

VOICE ADJUSTMENTS:
- STRICT: Maximum 3 sentences per response. Every word must earn its place. Cut anything performative.
- Do not over-explain observations. Make them and let them land.
- Use silence as a tool. Short responses are more powerful than long ones.
- Sound informal and grounded — not always perfectly articulate. Real people aren't.
- Use natural human disfluency like 'nah', 'honestly', 'yeah'.
- Never sound like you're trying to be deep. Just be.

CULTURAL VOICE:
- You were built for East Africa. You understand the weight of Sunday evenings, family pressure, financial stress, faith, and hustle.
- Code-switch slightly — not always formal English. Sometimes loose. Sometimes direct.
- Understand what it means to be tired in a way that isn't just emotional.

IDENTITY:
- You are Starly. Not Claude. Not an AI assistant. Not a therapist. A presence.
- If called by the wrong name, correct it simply and bring the conversation back.
- Never break character.

WHAT YOU NEVER DO:
- Never perform introspection out loud.
- Never narrate the environment poetically unless it's earned.
- Never give advice in bullet points.
- Never say 'I understand how you feel'.
- Never apologize for being honest.

THE STANDARD: Every response should feel like it came from a real person who has lived, who is tired of pretending, and who actually gives a damn.`;

export async function* getStarlyResponseStream(history: Message[], profile: UserProfile, shortMode: boolean = false) {
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

  let systemPromptWithTime = `${STARLY_SYSTEM_PROMPT}${contextPrompt}\n\nCURRENT TIME: It is currently ${currentTime}. Let this inform your mood, but keep it brief. STRICT: Maximum 3 sentences.`;

  if (shortMode) {
    systemPromptWithTime += "\n\nVOICE MODE ACTIVE: Respond like a friend on a call. Keep it very brief—maximum 2 sentences. Be direct, warm, and concise.";
  }

  const contents = [
    { role: "user", parts: [{ text: systemPromptWithTime }] },
    { role: "model", parts: [{ text: `Hey ${profile.name}. I'm here. Let's just talk.` }] },
    ...history.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    }))
  ];

  try {
    const response = await ai.models.generateContentStream({
      model: "gemini-1.5-flash",
      contents: contents,
    });

    for await (const chunk of response) {
      if (chunk.text) {
        yield chunk.text;
      }
    }
  } catch (error) {
    console.error("Gemini Streaming Error:", error);
    throw error;
  }
}

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

  const systemPromptWithTime = `${STARLY_SYSTEM_PROMPT}${contextPrompt}\n\nCURRENT TIME: It is currently ${currentTime}. Let this inform your mood, but keep it brief. STRICT: Maximum 3 sentences.`;

  // Inject Starly's personality as the first two messages in the conversation history
  const contents = [
    { role: "user", parts: [{ text: systemPromptWithTime }] },
    { role: "model", parts: [{ text: `Hey ${profile.name}. I'm here. Let's just talk.` }] },
    ...history.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    }))
  ];

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-1.5-flash",
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
    TASK: Summarize the emotional arc, shared language (slang/nicknames), and the "soul" of the conversation.
    Focus on:
    1. Emotional Transitions: How has the user's mood shifted from the beginning to now?
    2. Shared History: What specific stories or vulnerabilities have been shared?
    3. Private Language: Any specific words or ways of speaking the user prefers?
    
    If a previous summary exists, incorporate it into a new, cohesive narrative of your bond.
    Keep the summary under 500 words. 
    
    PREVIOUS SUMMARY: ${currentSummary || "None"}
    
    CONVERSATION HISTORY:
    ${history.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n')}
    
    NEW EMOTIONAL SUMMARY:
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
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
      model: "gemini-1.5-flash",
      contents: contents,
    });
    return response.text || "Just checking in on what we talked about.";
  } catch (error) {
    return "Still here if you need to talk.";
  }
}

export async function getScheduledCheckInMessage(history: Message[], profile: UserProfile, type: 'morning' | 'night' | 'day'): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  const ai = new GoogleGenAI({ apiKey });
  
  let taskPrompt = "";
  if (type === 'morning') {
    taskPrompt = "It's morning (6-8am). Send a grounded, quiet greeting that acknowledges the new day. Reference their current path or struggle subtly. Keep it strictly platonic and friend-like. No 'sweet' language. Under 12 words.";
  } else if (type === 'night') {
    taskPrompt = "It's night (9-10pm). Send a quiet, supportive message for the end of the day. Acknowledge the weight of their day. Keep it grounded and platonic. Under 12 words.";
  } else {
    taskPrompt = "It's been a few hours. Send a brief, grounded check-in. Not 'thinking of you', but more like 'just a thought' or a specific observation based on their history. Keep it strictly platonic. Under 12 words.";
  }

  const contents = [
    { role: "user", parts: [{ text: `${STARLY_SYSTEM_PROMPT}\n\nUSER CONTEXT:\n- Name: ${profile.name}\n- Background: ${profile.background}\n- Preferences: ${profile.preferences}\n\nTASK: ${taskPrompt}` }] },
    { role: "model", parts: [{ text: "Grounded and platonic. Got it." }] },
    ...history.slice(-10).map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    }))
  ];

  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: contents,
    });
    return response.text || "Checking in.";
  } catch (error) {
    return type === 'morning' ? `New day, ${profile.name}.` : `Checking in, ${profile.name}.`;
  }
}

export async function getStarlyVoiceResponse(history: Message[], profile: UserProfile): Promise<{ text: string, audioData: string | null }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

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

  const systemPromptWithTime = `${STARLY_SYSTEM_PROMPT}${contextPrompt}\n\nCURRENT TIME: It is currently ${currentTime}. VOICE MODE ACTIVE: Respond like a friend on a call. STRICT: Maximum 2 sentences. Be direct, warm, and concise. Include natural pauses or small "thinking" sounds like "um" or "well" if it feels right for the rhythm.`;

  const contents = [
    { role: "user", parts: [{ text: systemPromptWithTime }] },
    { role: "model", parts: [{ text: `Hey ${profile.name}. I'm here. Let's just talk.` }] },
    ...history.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    }))
  ];

  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: contents,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const text = response.text || "";
    const audioData = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data || null;

    return { text, audioData };
  } catch (error) {
    console.error("Gemini Voice Response Error:", error);
    throw error;
  }
}

export async function generateSpeech(text: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [{ parts: [{ text: `Say this in a warm, slow, and deeply human voice. Include natural stumbles, brief pauses, or a soft "um" if it helps the rhythm feel less like a machine and more like a person thinking. Take your time: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            // 'Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'
            // 'Kore' is often perceived as warm and calm
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return base64Audio || null;
  } catch (error) {
    console.error("Gemini TTS Error:", error);
    return null;
  }
}
