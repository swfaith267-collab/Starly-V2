/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, User, Sparkles, Heart, MessageCircle, ArrowRight, Settings, LogOut, Bell, BellOff, History, Plus, X, Trash2, Mic, MicOff, Share2, Check } from 'lucide-react';
import { Message, UserProfile, Conversation } from './types';
import { getStarlyResponse, getFollowUpMessage, generateConversationSummary, getScheduledCheckInMessage, generateSpeech, getStarlyResponseStream, getStarlyVoiceResponse } from './services/gemini';

const getGreeting = (name: string) => {
  const hour = new Date().getHours();
  if (hour < 12) return `Hey ${name}. You up?`;
  if (hour < 17) return `Hey ${name}. How's it going?`;
  if (hour < 21) return `Hey ${name}. You okay?`;
  return `Hey ${name}. Still awake?`;
};

export default function App() {
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isCallMode, setIsCallMode] = useState(false);
  const [showShareToast, setShowShareToast] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    const saved = localStorage.getItem('starly_notifications');
    return saved === 'true';
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const followUpTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);

  const playBase64Audio = async (base64Data: string) => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      const binaryString = window.atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768;
      }
      
      const buffer = audioContext.createBuffer(1, float32Array.length, 24000);
      buffer.getChannelData(0).set(float32Array);
      
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.start();
    } catch (e) {
      console.error("Audio playback error", e);
    }
  };

  const speak = async (text: string) => {
    if (!isCallMode) return;

    try {
      const base64Data = await generateSpeech(text);
      if (base64Data) {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }
        const binaryString = window.atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Assuming 16-bit PCM (standard for Gemini TTS)
        const int16Array = new Int16Array(bytes.buffer);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
          float32Array[i] = int16Array[i] / 32768;
        }
        
        const buffer = audioContext.createBuffer(1, float32Array.length, 24000);
        buffer.getChannelData(0).set(float32Array);
        
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start();
      } else {
        // Fallback to browser TTS if Gemini TTS fails
        if (!('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        
        const getVoices = () => {
          const voices = window.speechSynthesis.getVoices();
          const preferredVoice = voices.find(v => 
            v.name.includes('Google UK English Female') || 
            v.name.includes('Samantha') ||
            (v.name.includes('Female') && v.lang.startsWith('en'))
          ) || voices[0];
          if (preferredVoice) utterance.voice = preferredVoice;
        };

        getVoices();
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
          window.speechSynthesis.onvoiceschanged = getVoices;
        }

        utterance.pitch = 1.0;
        utterance.rate = 0.85;
        window.speechSynthesis.speak(utterance);
      }
    } catch (e) {
      console.error("Speech playback error", e);
    }
  };

  const toggleCallMode = () => {
    if (isCallMode) {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      }
      setIsRecording(false);
      setIsCallMode(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    setIsCallMode(true);
    startListening();
  };

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsRecording(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      handleSend(transcript);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
      // Auto-restart if still in call mode and not loading a response
      if (isCallMode && !isLoading) {
        setTimeout(() => {
          if (isCallMode && !isLoading) startListening();
        }, 300);
      }
    };

    try {
      recognition.start();
    } catch (e) {
      console.error("Failed to start recognition", e);
    }
  };

  useEffect(() => {
    const savedProfile = localStorage.getItem('friendly_profile');
    if (savedProfile) {
      let profile: UserProfile = JSON.parse(savedProfile);
      
      // Migration: Clean up old formal greetings from history
      const oldGreetingSuffix = "I've been thinking about what you shared.";
      
      if (profile.conversations) {
        let profileChanged = false;
        const updatedConversations = profile.conversations.map(conv => {
          const updatedMessages = conv.messages.map(msg => {
            // Check for the old bot-like greeting
            if (msg.role === 'model' && (msg.text.includes(oldGreetingSuffix) || msg.text.includes("There's no pressure to perform"))) {
              profileChanged = true;
              return { ...msg, text: getGreeting(profile.name) };
            }
            return msg;
          });
          return { ...conv, messages: updatedMessages };
        });
        
        if (profileChanged) {
          profile = { ...profile, conversations: updatedConversations };
          localStorage.setItem('friendly_profile', JSON.stringify(profile));
        }
      }

      setUserProfile(profile);
      setIsOnboarded(true);
      
      // Load most recent conversation or start a new one
      if (profile.conversations && profile.conversations.length > 0) {
        const lastConv = profile.conversations[0];
        setActiveConversationId(lastConv.id);
        
        // Check if we should show a "Welcome back" message (first time this session)
        const hasWelcomed = sessionStorage.getItem('starly_welcomed');
        if (!hasWelcomed) {
          const welcomeMsg: Message = {
            role: 'model',
            text: getGreeting(profile.name),
            timestamp: Date.now()
          };
          setMessages([...lastConv.messages, welcomeMsg]);
          sessionStorage.setItem('starly_welcomed', 'true');
        } else {
          setMessages(lastConv.messages);
        }
      } else {
        startNewConversation(profile);
      }
    }
    
    if (!localStorage.getItem('starly_notifications') && Notification.permission === 'granted') {
      setNotificationsEnabled(true);
      localStorage.setItem('starly_notifications', 'true');
    }
  }, []);

  const deleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!userProfile || !userProfile.conversations) return;
    
    const updatedConversations = userProfile.conversations.filter(c => c.id !== id);
    const updatedProfile = { ...userProfile, conversations: updatedConversations };
    
    setUserProfile(updatedProfile);
    localStorage.setItem('friendly_profile', JSON.stringify(updatedProfile));
    
    if (activeConversationId === id) {
      if (updatedConversations.length > 0) {
        switchConversation(updatedConversations[0].id);
      } else {
        startNewConversation(updatedProfile);
      }
    }
  };

  const startNewConversation = (profile: UserProfile) => {
    const newId = Math.random().toString(36).substring(7);
    const initialGreeting: Message = {
      role: 'model',
      text: getGreeting(profile.name),
      timestamp: Date.now()
    };
    
    const newConv: Conversation = {
      id: newId,
      title: "New Story",
      messages: [initialGreeting],
      timestamp: Date.now()
    };

    const updatedConversations = [newConv, ...(profile.conversations || [])];
    const updatedProfile = { ...profile, conversations: updatedConversations };
    
    setUserProfile(updatedProfile);
    setMessages([initialGreeting]);
    setActiveConversationId(newId);
    localStorage.setItem('friendly_profile', JSON.stringify(updatedProfile));
    setIsHistoryOpen(false);
  };

  const switchConversation = (id: string) => {
    if (!userProfile || !userProfile.conversations) return;
    const conv = userProfile.conversations.find(c => c.id === id);
    if (conv) {
      setActiveConversationId(id);
      setMessages(conv.messages);
      setIsHistoryOpen(false);
    }
  };

  // Handle follow-up logic
  useEffect(() => {
    if (!isOnboarded || messages.length === 0) return;

    // Clear existing timer
    if (followUpTimerRef.current) {
      clearTimeout(followUpTimerRef.current);
    }

    // Only set follow-up if the last message was from the user
    // or if it's been a long time since the last message overall.
    const lastMessage = messages[messages.length - 1];
    
    // Set a timer for a follow-up (e.g., 1 hour of inactivity)
    // For demo/testing, let's use a shorter time if needed, but 1 hour feels "real"
    const FOLLOW_UP_DELAY = 1000 * 60 * 60; // 1 hour

    followUpTimerRef.current = setTimeout(async () => {
      // Check if tab is hidden (user "hasn't touched the app")
      if (document.hidden && notificationsEnabled) {
        try {
          const followUpText = await getFollowUpMessage(messages);
          
          // Show notification
          new Notification("Starly", {
            body: followUpText,
            icon: "/favicon.ico" // Assuming there's an icon
          });

          // Add to messages so it's there when they return
          const followUpMsg: Message = {
            role: 'model',
            text: followUpText,
            timestamp: Date.now()
          };
          setMessages(prev => [...prev, followUpMsg]);
        } catch (err) {
          console.error("Follow-up failed", err);
        }
      }
    }, FOLLOW_UP_DELAY);

    return () => {
      if (followUpTimerRef.current) clearTimeout(followUpTimerRef.current);
    };
  }, [messages, isOnboarded, notificationsEnabled]);

  // Scheduled Check-ins Logic
  useEffect(() => {
    if (!isOnboarded || !notificationsEnabled || !userProfile || !activeConversationId) return;

    const checkScheduledMessages = async () => {
      const now = new Date();
      const hour = now.getHours();
      const today = now.toISOString().split('T')[0];
      
      const lastMorning = localStorage.getItem('last_morning_checkin');
      const lastNight = localStorage.getItem('last_night_checkin');
      const lastDay = localStorage.getItem('last_day_checkin');
      const lastDayTime = lastDay ? parseInt(lastDay) : 0;

      let checkInType: 'morning' | 'night' | 'day' | null = null;

      // Morning: 6-8am
      if (hour >= 6 && hour < 9 && lastMorning !== today) {
        checkInType = 'morning';
      } 
      // Night: 9-10pm
      else if (hour >= 21 && hour < 23 && lastNight !== today) {
        checkInType = 'night';
      }
      // Day: Every 4-6 hours (between 9am and 9pm)
      else if (hour >= 9 && hour < 21) {
        const hoursSinceLast = (now.getTime() - lastDayTime) / (1000 * 60 * 60);
        if (hoursSinceLast >= 5) { // Average of 4-6 hours
          checkInType = 'day';
        }
      }

      if (checkInType) {
        try {
          const messageText = await getScheduledCheckInMessage(messages, userProfile, checkInType);
          
          // Show notification safely
          if ('Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification("Starly", { body: messageText });
            } catch (e) {
              console.warn("Could not fire system notification", e);
            }
          }

          // Add to messages
          const checkInMsg: Message = {
            role: 'model',
            text: messageText,
            timestamp: Date.now()
          };
          
          const updatedMessages = [...messages, checkInMsg];
          setMessages(updatedMessages);

          // Update storage to prevent double-firing
          if (checkInType === 'morning') localStorage.setItem('last_morning_checkin', today);
          if (checkInType === 'night') localStorage.setItem('last_night_checkin', today);
          if (checkInType === 'day') localStorage.setItem('last_day_checkin', Date.now().toString());

          // Persist to conversation
          const updatedConversations = (userProfile.conversations || []).map(c => {
            if (c.id === activeConversationId) {
              return { ...c, messages: updatedMessages, timestamp: Date.now() };
            }
            return c;
          });
          const updatedProfile = { ...userProfile, conversations: updatedConversations };
          setUserProfile(updatedProfile);
          localStorage.setItem('friendly_profile', JSON.stringify(updatedProfile));

        } catch (err) {
          console.error("Scheduled check-in failed", err);
        }
      }
    };

    // Check every minute
    const interval = setInterval(checkScheduledMessages, 60000);
    // Also check immediately on mount/update
    checkScheduledMessages();

    return () => clearInterval(interval);
  }, [isOnboarded, notificationsEnabled, userProfile, messages, activeConversationId]);

  const requestNotificationPermission = async () => {
    try {
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          setNotificationsEnabled(true);
          return;
        }
      }
    } catch (e) {
      console.warn("Notification API not available or blocked in this context.");
    }
    
    // For the prototype: toggle anyway if browser blocks it, 
    // so the user can still see the check-ins appearing in the chat.
    const newState = !notificationsEnabled;
    setNotificationsEnabled(newState);
    localStorage.setItem('starly_notifications', newState.toString());
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleOnboarding = (profile: UserProfile) => {
    const newId = Math.random().toString(36).substring(7);
    const initialGreeting: Message = {
      role: 'model',
      text: getGreeting(profile.name),
      timestamp: Date.now()
    };
    
    const initialConv: Conversation = {
      id: newId,
      title: "First Story",
      messages: [initialGreeting],
      timestamp: Date.now()
    };

    const updatedProfile = { ...profile, conversations: [initialConv] };
    setUserProfile(updatedProfile);
    localStorage.setItem('friendly_profile', JSON.stringify(updatedProfile));
    setMessages([initialGreeting]);
    setActiveConversationId(newId);
    setIsOnboarded(true);
  };

  const handleSend = async (overrideInput?: string) => {
    const textToSend = overrideInput || input;
    if (!textToSend.trim() || isLoading || !userProfile) return;

    const userMessage: Message = {
      role: 'user',
      text: textToSend,
      timestamp: Date.now()
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    if (!overrideInput) setInput('');
    setIsLoading(true);

    try {
      if (isCallMode) {
        // Call Mode: Get text and audio together, but ONLY play audio
        const { text, audioData } = await getStarlyVoiceResponse(newMessages, userProfile);
        
        const starlyMessage: Message = {
          role: 'model',
          text: text,
          timestamp: Date.now()
        };
        
        // We still add it to messages for context, but the Call UI won't show it
        setMessages(prev => [...prev, starlyMessage]);
        
        if (audioData) {
          await playBase64Audio(audioData);
        } else {
          await speak(text); // Fallback
        }

        const updatedMessages = [...newMessages, starlyMessage];
        // Update conversations in profile
        const updatedConversations = (userProfile.conversations || []).map(c => {
          if (c.id === activeConversationId) {
            return { ...c, messages: updatedMessages, timestamp: Date.now() };
          }
          return c;
        });

        const updatedProfile = { ...userProfile, conversations: updatedConversations };
        setUserProfile(updatedProfile);
        localStorage.setItem('friendly_profile', JSON.stringify(updatedProfile));
        
        // After speaking, restart listening if still in call mode
        if (isCallMode) {
          startListening();
        }
      } else {
        // Standard Text Mode: Streaming text ONLY, no speech
        let fullResponse = '';
        const starlyMessage: Message = {
          role: 'model',
          text: '',
          timestamp: Date.now()
        };
        
        setMessages(prev => [...prev, starlyMessage]);
        
        const stream = getStarlyResponseStream(newMessages, userProfile, false);
        
        for await (const chunk of stream) {
          fullResponse += chunk;
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { ...starlyMessage, text: fullResponse };
            return updated;
          });
        }

        const updatedMessages = [...newMessages, { ...starlyMessage, text: fullResponse }];

        // Update conversations in profile
        const updatedConversations = (userProfile.conversations || []).map(c => {
          if (c.id === activeConversationId) {
            let title = c.title;
            if (title === "New Story" || title === "First Story") {
              const firstUserMsg = updatedMessages.find(m => m.role === 'user');
              if (firstUserMsg) {
                title = firstUserMsg.text.slice(0, 30) + (firstUserMsg.text.length > 30 ? "..." : "");
              }
            }
            return { ...c, messages: updatedMessages, title, timestamp: Date.now() };
          }
          return c;
        });

        let updatedProfile = { ...userProfile, conversations: updatedConversations };

        if (updatedMessages.length % 4 === 0) {
          const newSummary = await generateConversationSummary(updatedMessages, userProfile.summary);
          updatedProfile = { ...updatedProfile, summary: newSummary };
        }

        setUserProfile(updatedProfile);
        localStorage.setItem('friendly_profile', JSON.stringify(updatedProfile));
      }
    } catch (error) {
      const errorMessage: Message = {
        role: 'model',
        text: "I hit a snag in my thinking. Can we try that again?",
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const resetApp = () => {
    localStorage.removeItem('friendly_profile');
    setIsOnboarded(false);
    setUserProfile(null);
    setMessages([]);
    setActiveConversationId(null);
    setIsHistoryOpen(false);
    setShowResetConfirm(false);
  };

  const handleShare = () => {
    const sharedUrl = "https://ais-pre-qwplm2pxoo3ohdiwpfemmg-209068725449.europe-west1.run.app";
    navigator.clipboard.writeText(sharedUrl);
    setShowShareToast(true);
    setTimeout(() => setShowShareToast(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#fdfcf8] text-[#3c3c3c] font-serif selection:bg-[#e9e4d1] overflow-hidden">
      <AnimatePresence mode="wait">
        {!isOnboarded ? (
          <Onboarding key="onboarding" onComplete={handleOnboarding} />
        ) : (
          <div className="relative h-screen">
            {isCallMode ? (
              <CallScreen 
                key="call"
                isLoading={isLoading}
                isRecording={isRecording}
                onEndCall={toggleCallMode}
                userProfile={userProfile}
              />
            ) : (
              <ChatInterface 
                key="chat" 
                messages={messages} 
                onSend={handleSend} 
                input={input} 
                setInput={setInput} 
                isLoading={isLoading}
                isRecording={isRecording}
                onToggleCallMode={toggleCallMode}
                isCallMode={isCallMode}
                messagesEndRef={messagesEndRef}
                userProfile={userProfile}
                notificationsEnabled={notificationsEnabled}
                requestNotificationPermission={requestNotificationPermission}
                onOpenHistory={() => setIsHistoryOpen(true)}
                onShare={handleShare}
                showShareToast={showShareToast}
                onReset={resetApp}
                showResetConfirm={showResetConfirm}
                setShowResetConfirm={setShowResetConfirm}
              />
            )}
            
            {/* History Sidebar */}
            <AnimatePresence>
              {isHistoryOpen && (
                <>
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setIsHistoryOpen(false)}
                    className="absolute inset-0 bg-black/20 backdrop-blur-sm z-40"
                  />
                  <motion.div 
                    initial={{ x: '-100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '-100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="absolute inset-y-0 left-0 w-80 bg-[#fdfcf8] shadow-2xl z-50 flex flex-col border-r border-[#5A5A40]/10"
                  >
                    <div className="p-6 border-b border-[#5A5A40]/10 flex justify-between items-center">
                      <h3 className="text-xl font-medium text-[#5A5A40]">Your Stories</h3>
                      <button onClick={() => setIsHistoryOpen(false)} className="p-2 hover:bg-[#5A5A40]/5 rounded-full">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    
                    <div className="p-4">
                      <button 
                        onClick={() => startNewConversation(userProfile!)}
                        className="w-full flex items-center justify-center gap-2 bg-[#5A5A40] text-white py-3 rounded-xl hover:bg-[#4a4a34] transition-all mb-6"
                      >
                        <Plus className="w-5 h-5" />
                        New Story
                      </button>
                      
                      <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-200px)] scrollbar-hide">
                        {userProfile?.conversations?.map((conv) => (
                          <div key={conv.id} className="relative group">
                            <button
                              onClick={() => switchConversation(conv.id)}
                              className={`w-full text-left p-4 rounded-2xl transition-all pr-12 ${
                                activeConversationId === conv.id 
                                  ? 'bg-[#5A5A40]/10 border border-[#5A5A40]/20' 
                                  : 'hover:bg-[#5A5A40]/5 border border-transparent'
                              }`}
                            >
                              <p className="font-medium text-sm truncate">{conv.title}</p>
                              <p className="text-[10px] uppercase tracking-widest opacity-40 mt-1">
                                {new Date(conv.timestamp).toLocaleDateString()}
                              </p>
                            </button>
                            <button 
                              onClick={(e) => deleteConversation(conv.id, e)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 rounded-full transition-all"
                              title="Delete Story"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Onboarding({ onComplete }: { onComplete: (profile: UserProfile) => void, key?: React.Key }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [background, setBackground] = useState('');
  const [preferences, setPreferences] = useState('');

  const steps = [
    {
      title: "Meet Starly.",
      subtitle: "She's here to listen, observe, and show up for you.",
      content: (
        <div className="space-y-4">
          <p className="text-lg opacity-80">Before we begin, what should I call you?</p>
          <input 
            autoFocus
            type="text" 
            value={name} 
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-transparent border-b-2 border-[#5A5A40]/20 py-2 text-2xl focus:border-[#5A5A40] outline-none transition-colors"
            placeholder="Your name..."
          />
        </div>
      )
    },
    {
      title: "A little context.",
      subtitle: "Starly works best when she knows where you're coming from.",
      content: (
        <div className="space-y-4">
          <p className="text-lg opacity-80">What's been weighing on you lately? (Briefly)</p>
          <textarea 
            autoFocus
            value={background} 
            onChange={(e) => setBackground(e.target.value)}
            className="w-full bg-transparent border-2 border-[#5A5A40]/10 rounded-2xl p-4 text-lg focus:border-[#5A5A40]/30 outline-none transition-colors min-h-[120px]"
            placeholder="Work, relationships, just feeling 'off'..."
          />
        </div>
      )
    },
    {
      title: "One last thing.",
      subtitle: "How do you want Starly to talk to you?",
      content: (
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-lg opacity-80">Any preferences? (e.g. 'Be extra direct', 'I'm spiritual')</p>
            <input 
              autoFocus
              type="text" 
              value={preferences} 
              onChange={(e) => setPreferences(e.target.value)}
              className="w-full bg-transparent border-b-2 border-[#5A5A40]/20 py-2 text-xl focus:border-[#5A5A40] outline-none transition-colors"
              placeholder="Your preferences..."
            />
          </div>
          <div className="p-4 bg-[#5A5A40]/5 rounded-2xl flex items-start gap-4">
            <Bell className="w-6 h-6 text-[#5A5A40] mt-1" />
            <div className="space-y-1">
              <p className="font-medium">Best Friend Follow-ups</p>
              <p className="text-sm opacity-60">Starly can check in on you if you've been away for a while. You can enable this via the bell icon in the chat.</p>
            </div>
          </div>
        </div>
      )
    }
  ];

  const next = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete({ name, background, preferences });
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-2xl mx-auto px-6 py-24 min-h-screen flex flex-col justify-center"
    >
      <div className="space-y-2 mb-12">
        <h1 className="text-5xl font-light tracking-tight text-[#5A5A40]">{steps[step].title}</h1>
        <p className="text-xl italic opacity-60">{steps[step].subtitle}</p>
      </div>

      <motion.div 
        key={step}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="mb-12"
      >
        {steps[step].content}
      </motion.div>

      <div className="flex justify-end">
        <button 
          onClick={next}
          disabled={step === 0 && !name.trim()}
          className="group flex items-center gap-2 bg-[#5A5A40] text-white px-8 py-4 rounded-full text-lg hover:bg-[#4a4a34] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {step === steps.length - 1 ? "Start Conversation" : "Next"}
          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </motion.div>
  );
}

function CallScreen({ 
  isLoading, isRecording, onEndCall, userProfile 
}: { 
  isLoading: boolean, 
  isRecording: boolean, 
  onEndCall: () => void,
  userProfile: UserProfile | null,
  key?: string
}) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-[#1A1A1A] z-50 flex flex-col items-center justify-center text-white p-6"
    >
      <div className="absolute top-12 text-center space-y-2">
        <h2 className="text-2xl font-light tracking-widest uppercase opacity-60">Call with Starly</h2>
        <p className="text-sm opacity-40 italic">"I'm listening, {userProfile?.name}."</p>
      </div>

      <div className="relative">
        <motion.div 
          animate={{ 
            scale: isRecording ? [1, 1.1, 1] : 1,
            opacity: isRecording ? [0.5, 0.8, 0.5] : 0.5
          }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="w-48 h-48 rounded-full bg-[#5A5A40] blur-3xl absolute inset-0 -z-10"
        />
        <div className="w-48 h-48 rounded-full bg-[#5A5A40] flex items-center justify-center shadow-2xl border border-white/10">
          <Sparkles className={`w-20 h-20 text-white ${isLoading ? 'animate-pulse' : ''}`} />
        </div>
      </div>

      <div className="mt-24 space-y-8 text-center">
        <div className="h-8">
          {isRecording && (
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-lg font-light tracking-wide text-emerald-400"
            >
              Listening...
            </motion.p>
          )}
          {isLoading && (
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-lg font-light tracking-wide text-white/60"
            >
              Starly is thinking...
            </motion.p>
          )}
        </div>

        <button 
          onClick={onEndCall}
          className="p-8 bg-red-500 rounded-full hover:bg-red-600 transition-all shadow-xl shadow-red-900/20 group"
        >
          <MicOff className="w-8 h-8 group-hover:scale-110 transition-transform" />
        </button>
        <p className="text-xs uppercase tracking-[0.3em] opacity-30">Tap to end call</p>
      </div>
    </motion.div>
  );
}

function ChatInterface({ 
  messages, onSend, input, setInput, isLoading, isRecording, onToggleCallMode, 
  isCallMode, messagesEndRef, userProfile, onReset,
  notificationsEnabled, requestNotificationPermission, onOpenHistory,
  onShare, showShareToast, showResetConfirm, setShowResetConfirm
}: { 
  messages: Message[], 
  onSend: (override?: string) => void, 
  input: string, 
  setInput: (v: string) => void, 
  isLoading: boolean,
  isRecording: boolean,
  onToggleCallMode: () => void,
  isCallMode: boolean,
  messagesEndRef: React.RefObject<HTMLDivElement> | React.RefObject<null>,
  userProfile: UserProfile | null,
  onReset: () => void,
  notificationsEnabled: boolean,
  requestNotificationPermission: () => void,
  onOpenHistory: () => void,
  onShare: () => void,
  showShareToast: boolean,
  showResetConfirm: boolean,
  setShowResetConfirm: (v: boolean) => void,
  key?: React.Key
}) {
  return (
    <div className="max-w-3xl mx-auto h-screen flex flex-col">
      {/* Header */}
      <header className="px-6 py-8 flex justify-between items-center border-b border-[#5A5A40]/5">
        <div className="flex items-center gap-3">
          <button 
            onClick={onOpenHistory}
            className="p-2 hover:bg-[#5A5A40]/5 rounded-full transition-colors text-[#5A5A40]"
            title="History"
          >
            <History className="w-6 h-6" />
          </button>
          <div className="w-10 h-10 rounded-full bg-[#5A5A40] flex items-center justify-center text-white">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-medium text-[#5A5A40]">Starly</h2>
            <p className="text-xs uppercase tracking-widest opacity-40">Companion</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={onShare}
            className="p-2 hover:bg-[#5A5A40]/5 rounded-full transition-colors text-[#5A5A40] relative"
            title="Share Starly"
          >
            {showShareToast ? <Check className="w-6 h-6 text-emerald-600" /> : <Share2 className="w-6 h-6" />}
            <AnimatePresence>
              {showShareToast && (
                <motion.span 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-widest text-emerald-600 font-bold whitespace-nowrap"
                >
                  Copied!
                </motion.span>
              )}
            </AnimatePresence>
          </button>
          {notificationsEnabled && (
            <button 
              onClick={async () => {
                const text = await getFollowUpMessage(messages);
                new Notification("Starly (Test)", { body: text });
              }}
              className="p-2 text-[#5A5A40] opacity-40 hover:opacity-100 transition-colors"
              title="Test Follow-up"
            >
              <Sparkles className="w-4 h-4" />
            </button>
          )}
          <button 
            onClick={requestNotificationPermission}
            className={`p-3 rounded-full transition-all duration-300 ${
              notificationsEnabled 
                ? 'text-[#5A5A40] bg-[#5A5A40]/10 shadow-inner' 
                : 'text-[#5A5A40]/30 hover:bg-[#5A5A40]/5'
            }`}
            title={notificationsEnabled ? "Notifications Active" : "Enable Follow-ups"}
          >
            {notificationsEnabled ? <Bell className="w-6 h-6" /> : <BellOff className="w-6 h-6" />}
          </button>
          
          <div className="relative">
            <button 
              onClick={() => setShowResetConfirm(!showResetConfirm)}
              className={`p-2 rounded-full transition-all ${
                showResetConfirm 
                  ? 'bg-red-50 text-red-500 opacity-100' 
                  : 'hover:bg-[#5A5A40]/5 text-[#5A5A40] opacity-60 hover:opacity-100'
              }`}
              title="Reset Profile"
            >
              <LogOut className="w-5 h-5" />
            </button>
            
            <AnimatePresence>
              {showResetConfirm && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 10 }}
                  className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-xl border border-red-100 p-4 z-50"
                >
                  <p className="text-xs text-red-600 font-medium mb-3">This will delete all your stories. Are you sure?</p>
                  <div className="flex gap-2">
                    <button 
                      onClick={onReset}
                      className="flex-1 bg-red-500 text-white text-[10px] uppercase tracking-widest font-bold py-2 rounded-lg hover:bg-red-600 transition-colors"
                    >
                      Reset
                    </button>
                    <button 
                      onClick={() => setShowResetConfirm(false)}
                      className="flex-1 bg-gray-100 text-gray-500 text-[10px] uppercase tracking-widest font-bold py-2 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-8 space-y-8 scrollbar-hide">
        {messages.map((msg, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[85%] space-y-2 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
              <div className={`inline-block p-5 rounded-3xl text-lg leading-relaxed ${
                msg.role === 'user' 
                  ? 'bg-[#5A5A40] text-white rounded-tr-none shadow-sm' 
                  : 'bg-white border border-[#5A5A40]/10 rounded-tl-none shadow-sm'
              }`}>
                {msg.text}
              </div>
              <p className="text-[10px] uppercase tracking-widest opacity-30 px-2">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </motion.div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-[#5A5A40]/10 rounded-3xl rounded-tl-none p-5 shadow-sm">
              <div className="flex gap-1">
                <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1 }} className="w-2 h-2 bg-[#5A5A40] rounded-full" />
                <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-2 h-2 bg-[#5A5A40] rounded-full" />
                <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-2 h-2 bg-[#5A5A40] rounded-full" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-6">
        <div className="relative max-w-2xl mx-auto flex gap-3">
          <div className="relative flex-1">
            <textarea 
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              placeholder="Speak your truth..."
              className="w-full bg-white border border-[#5A5A40]/20 rounded-2xl py-4 pl-6 pr-16 text-lg focus:border-[#5A5A40] focus:ring-1 focus:ring-[#5A5A40] outline-none transition-all shadow-sm resize-none"
            />
            <button 
              onClick={() => onSend()}
              disabled={!input.trim() || isLoading}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-3 bg-[#5A5A40] text-white rounded-xl hover:bg-[#4a4a34] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          
          <button 
            onClick={onToggleCallMode}
            disabled={isLoading}
            className={`relative p-4 rounded-2xl transition-all duration-300 ${
              isCallMode 
                ? 'bg-[#5A5A40] text-white shadow-lg' 
                : 'bg-white border border-[#5A5A40]/20 text-[#5A5A40] hover:bg-[#5A5A40]/5 shadow-sm'
            }`}
          >
            <Mic className="w-6 h-6" />
          </button>
        </div>
        <p className="text-center text-[10px] uppercase tracking-[0.2em] opacity-30 mt-4">
          {isRecording ? "Starly is listening..." : "Starly is here. Take your time."}
        </p>
      </div>
    </div>
  );
}
