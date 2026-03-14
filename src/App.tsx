/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, User, Sparkles, Heart, MessageCircle, ArrowRight, Settings, LogOut } from 'lucide-react';
import { Message, UserProfile } from './types';
import { getStarlyResponse } from './services/gemini';

export default function App() {
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedProfile = localStorage.getItem('friendly_profile');
    if (savedProfile) {
      setUserProfile(JSON.parse(savedProfile));
      setIsOnboarded(true);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleOnboarding = (profile: UserProfile) => {
    setUserProfile(profile);
    localStorage.setItem('friendly_profile', JSON.stringify(profile));
    setIsOnboarded(true);
    
    // Initial greeting from Starly
    const initialGreeting: Message = {
      role: 'model',
      text: `Hello ${profile.name}. I've been thinking about what you shared. I'm glad you're here. There's no pressure to perform or say the right thing. Just tell me what's actually happening for you right now.`,
      timestamp: Date.now()
    };
    setMessages([initialGreeting]);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      text: input,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await getStarlyResponse([...messages, userMessage]);
      const starlyMessage: Message = {
        role: 'model',
        text: response,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, starlyMessage]);
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
  };

  return (
    <div className="min-h-screen bg-[#fdfcf8] text-[#3c3c3c] font-serif selection:bg-[#e9e4d1]">
      <AnimatePresence mode="wait">
        {!isOnboarded ? (
          <Onboarding key="onboarding" onComplete={handleOnboarding} />
        ) : (
          <ChatInterface 
            key="chat" 
            messages={messages} 
            onSend={handleSend} 
            input={input} 
            setInput={setInput} 
            isLoading={isLoading}
            messagesEndRef={messagesEndRef}
            userProfile={userProfile}
            onReset={resetApp}
          />
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
        <div className="space-y-4">
          <p className="text-lg opacity-80">Any preferences? (e.g. 'Be extra direct', 'I'm spiritual', 'Keep it light')</p>
          <input 
            autoFocus
            type="text" 
            value={preferences} 
            onChange={(e) => setPreferences(e.target.value)}
            className="w-full bg-transparent border-b-2 border-[#5A5A40]/20 py-2 text-xl focus:border-[#5A5A40] outline-none transition-colors"
            placeholder="Your preferences..."
          />
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

function ChatInterface({ 
  messages, onSend, input, setInput, isLoading, messagesEndRef, userProfile, onReset 
}: { 
  messages: Message[], 
  onSend: () => void, 
  input: string, 
  setInput: (v: string) => void, 
  isLoading: boolean,
  messagesEndRef: React.RefObject<HTMLDivElement> | React.RefObject<null>,
  userProfile: UserProfile | null,
  onReset: () => void,
  key?: React.Key
}) {
  return (
    <div className="max-w-3xl mx-auto h-screen flex flex-col">
      {/* Header */}
      <header className="px-6 py-8 flex justify-between items-center border-b border-[#5A5A40]/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#5A5A40] flex items-center justify-center text-white">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-medium text-[#5A5A40]">Starly</h2>
            <p className="text-xs uppercase tracking-widest opacity-40">Companion</p>
          </div>
        </div>
        <button 
          onClick={onReset}
          className="p-2 hover:bg-[#5A5A40]/5 rounded-full transition-colors opacity-40 hover:opacity-100"
          title="Reset Profile"
        >
          <LogOut className="w-5 h-5" />
        </button>
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
        <div className="relative max-w-2xl mx-auto">
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
            onClick={onSend}
            disabled={!input.trim() || isLoading}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-3 bg-[#5A5A40] text-white rounded-xl hover:bg-[#4a4a34] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <p className="text-center text-[10px] uppercase tracking-[0.2em] opacity-30 mt-4">
          Starly is listening. Take your time.
        </p>
      </div>
    </div>
  );
}
