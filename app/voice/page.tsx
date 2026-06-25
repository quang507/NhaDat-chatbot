'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

type ChatState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function VoicePage() {
  const [state, setState] = useState<ChatState>('idle');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const activeUtterancesRef = useRef<SpeechSynthesisUtterance[]>([]);
  const chatHistoryRef = useRef<Message[]>([]);
  const isListeningLoopActive = useRef(false);
  const audioChunksBuffer = useRef<string>('');

  const stateRef = useRef<ChatState>(state);
  
  // Sync stateRef with state
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // 1. Initialize Web APIs
  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;
      
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = 'vi-VN';
        
        rec.onstart = () => {
          setState('listening');
          setTranscript('Đang nghe...');
          setErrorMsg('');
        };
        
        rec.onresult = (event: any) => {
          const resultText = event.results[0][0].transcript;
          setTranscript(resultText);
          setState('processing');
          handleUserSpeech(resultText);
        };
        
        rec.onerror = (event: any) => {
          console.error('Speech recognition error', event.error);
          if (event.error === 'no-speech' || event.error === 'aborted') {
            // Quietly handle no-speech and aborted actions
            if (isListeningLoopActive.current && stateRef.current === 'listening') {
              startListening();
            }
          } else {
            setErrorMsg(`Lỗi micro: ${event.error}`);
            setState('error');
          }
        };
        
        rec.onend = () => {
          // If we finished listening but didn't transition to processing or speaking, restart
          if (isListeningLoopActive.current && stateRef.current === 'listening') {
            startListening();
          }
        };
        
        recognitionRef.current = rec;
      } else {
        setErrorMsg('Trình duyệt của bạn không hỗ trợ nhận diện giọng nói (Web Speech API). Hãy thử Chrome hoặc Safari.');
        setState('error');
      }
    }
    
    return () => {
      stopAllVoiceActivities();
    };
  }, []);

  const stopAllVoiceActivities = () => {
    isListeningLoopActive.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch(e) {}
    }
    if (synthRef.current) {
      try { synthRef.current.cancel(); } catch(e) {}
    }
    activeUtterancesRef.current = [];
  };

  const toggleVoiceSession = () => {
    if (isListeningLoopActive.current) {
      stopAllVoiceActivities();
      setState('idle');
      setTranscript('Đã dừng đàm thoại');
    } else {
      isListeningLoopActive.current = true;
      startListening();
    }
  };

  const startListening = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    activeUtterancesRef.current = [];
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (e) {
        // Recognition might already be running
      }
    }
  };

  // 2. Clean text for natural speech (Javascript version of the Python VAD cleaner)
  const cleanTextForTTS = (text: string): string => {
    if (!text) return '';
    
    // Remove lines containing Google Maps or links
    let lines = text.split('\n');
    let cleanedLines = lines.filter(line => {
      const l = line.toLowerCase();
      return !(l.includes('google maps') || l.includes('link') || l.includes('website') || l.includes('bản đồ'));
    });
    let clean = cleanedLines.join('\n');
    
    // Remove URLs
    clean = clean.replace(/https?:\/\/\S+|www\.\S+/g, '');
    
    // Normalize m2 / m²
    clean = clean.replace(/(\d+)\s*m²?2?\b/gi, '$1 mét vuông');
    clean = clean.replace(/\bm²?2?\b/gi, 'mét vuông');
    
    // Replacements
    const replacements: [RegExp, string][] = [
      [/\bTP\.HCM\b/gi, 'Thành phố Hồ Chí Minh'],
      [/\bTpHCM\b/gi, 'Thành phố Hồ Chí Minh'],
      [/\bHCM\b/gi, 'Hồ Chí Minh'],
      [/\bQ\b\.(\d+)/gi, 'Quận $1'],
      [/\bđ\/c\b/gi, 'địa chỉ'],
      [/\bĐ\/c\b/gi, 'Địa chỉ'],
      [/\bNy'ah\b/gi, 'Ni a'],
      [/\bNyah\b/gi, 'Ni a'],
      [/\bVilla\b/gi, 'Vi la'],
      [/\bLtd\.\b/gi, 'công ty'],
      [/\bCo\.\b/gi, 'công ty'],
      [/\bTS\.\b/gi, 'Tiến sĩ'],
      [/\banh\/chị\b/gi, 'anh chị'],
      [/\banh chị\b/gi, 'anh chị'],
      [/\bAnh\/Chị\b/gi, 'Anh chị'],
      [/\bAnh Chị\b/gi, 'Anh chị']
    ];
    
    replacements.forEach(([pattern, replacement]) => {
      clean = clean.replace(pattern, replacement);
    });
    
    // Remove markdown formatting
    clean = clean.replace(/\*\*/g, '').replace(/__/g, '').replace(/\*/g, '').replace(/`/g, '');
    
    // Remove bullet points
    clean = clean.replace(/^\s*[-*+]\s+/gm, ' ');
    
    // Clean all special characters except letters, digits, spaces, periods, and question marks
    clean = clean.replace(/[^a-zA-Z0-9\s.?áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđĐ]/g, ' ');
    
    // Trim multiple spaces
    return clean.replace(/\s+/g, ' ').trim();
  };

  // 3. Sentence-by-sentence TTS streaming playback
  const speakSentence = (sentence: string, isLast = false) => {
    if (!synthRef.current) return;
    
    const cleanText = cleanTextForTTS(sentence);
    if (!cleanText) {
      if (isLast && activeUtterancesRef.current.length === 0) {
        // If it was the last chunk but empty, go back to listening
        if (isListeningLoopActive.current) {
          startListening();
        } else {
          setState('idle');
        }
      }
      return;
    }
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'vi-VN';
    
    // Set a good Vietnamese voice if available
    const voices = synthRef.current.getVoices();
    const viVoice = voices.find(v => v.lang.includes('vi') || v.lang.includes('VI'));
    if (viVoice) {
      utterance.voice = viVoice;
    }
    
    // Manage state during playback
    utterance.onstart = () => {
      setState('speaking');
      setResponse(sentence);
    };
    
    utterance.onend = () => {
      // Remove from active list
      activeUtterancesRef.current = activeUtterancesRef.current.filter(u => u !== utterance);
      
      // If no utterances left and we reached the end of stream, resume listening
      if (activeUtterancesRef.current.length === 0 && isLast) {
        if (isListeningLoopActive.current) {
          startListening();
        } else {
          setState('idle');
        }
      }
    };
    
    utterance.onerror = (e) => {
      console.error('Speech synthesis error', e);
      activeUtterancesRef.current = activeUtterancesRef.current.filter(u => u !== utterance);
      if (activeUtterancesRef.current.length === 0 && isLast) {
        if (isListeningLoopActive.current) {
          startListening();
        } else {
          setState('idle');
        }
      }
    };
    
    activeUtterancesRef.current.push(utterance);
    synthRef.current.speak(utterance);
  };

  const splitSentences = (buffer: string): { sentences: string[]; remaining: string } => {
    const sentences: string[] = [];
    let i = 0;
    
    while (i < buffer.length) {
      const char = buffer[i];
      if (['.', '?', '!', '\n'].includes(char)) {
        let isEnding = true;
        // Ignore decimal dots
        if (char === '.' && i > 0 && i < buffer.length - 1) {
          if (/\d/.test(buffer[i-1]) && /\d/.test(buffer[i+1])) {
            isEnding = false;
          }
        }
        
        if (isEnding) {
          const sentence = buffer.substring(0, i + 1).trim();
          buffer = buffer.substring(i + 1);
          i = 0; // Reset index
          if (sentence) {
            sentences.push(sentence);
          }
          continue;
        }
      }
      i++;
    }
    return { sentences, remaining: buffer };
  };

  // 4. Handle sending speech to Vercel API and stream response
  const handleUserSpeech = async (speechText: string) => {
    setResponse('Đang suy nghĩ...');
    audioChunksBuffer.current = '';
    
    try {
      const history = chatHistoryRef.current;
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: speechText, history }),
      });
      
      if (!res.ok || !res.body) {
        throw new Error('Lỗi kết nối máy chủ');
      }
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = '';
      let sentenceBuffer = '';
      
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        accumulatedText += chunk;
        sentenceBuffer += chunk;
        
        // Split and play sentences immediately
        const { sentences, remaining } = splitSentences(sentenceBuffer);
        sentenceBuffer = remaining;
        
        sentences.forEach(sentence => {
          speakSentence(sentence, false);
        });
      }
      
      // Play any remaining text left in buffer
      if (sentenceBuffer.trim()) {
        speakSentence(sentenceBuffer.trim(), true);
      } else {
        // Mark the last utterance to trigger microphone restart on end
        if (activeUtterancesRef.current.length > 0) {
          const lastUtt = activeUtterancesRef.current[activeUtterancesRef.current.length - 1];
          const originalEnd = lastUtt.onend;
          lastUtt.onend = (e) => {
            if (originalEnd) originalEnd.call(lastUtt, e);
            if (isListeningLoopActive.current && activeUtterancesRef.current.length === 0) {
              startListening();
            }
          };
        } else {
          // No sentences spoken, restart immediately
          if (isListeningLoopActive.current) {
            startListening();
          }
        }
      }
      
      // Update history
      chatHistoryRef.current = [
        ...history,
        { role: 'user' as const, content: speechText },
        { role: 'assistant' as const, content: accumulatedText }
      ].slice(-20);
      
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Không thể kết nối đến máy chủ.');
      setState('error');
      if (isListeningLoopActive.current) {
        setTimeout(startListening, 3000);
      }
    }
  };

  // 5. CSS Animations styles injected dynamically
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      @keyframes orbPulse {
        0%, 100% { transform: scale(1); box-shadow: 0 0 40px rgba(59, 130, 246, 0.4), inset 0 0 20px rgba(59, 130, 246, 0.2); }
        50% { transform: scale(1.05); box-shadow: 0 0 60px rgba(96, 165, 250, 0.6), inset 0 0 30px rgba(96, 165, 250, 0.4); }
      }
      @keyframes orbSpin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      @keyframes ripple {
        0% { transform: scale(0.95); opacity: 1; }
        100% { transform: scale(1.6); opacity: 0; }
      }
      .animate-pulse-orb {
        animation: orbPulse 3s infinite ease-in-out;
      }
      .animate-spin-orb {
        animation: orbSpin 2s infinite linear;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <main className="min-h-screen bg-neutral-950 text-white flex flex-col justify-between items-center p-6 relative overflow-hidden select-none">
      {/* Background radial gradient glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.08)_0%,transparent_70%)] pointer-events-none" />

      {/* Header */}
      <div className="w-full max-w-md flex justify-between items-center z-10 pt-2">
        <Link href="/" className="text-neutral-400 hover:text-white transition flex items-center gap-1 text-sm bg-neutral-900/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-neutral-800">
          <span>✕</span> Thoát đàm thoại
        </Link>
        <span className="text-xs uppercase tracking-widest text-neutral-500 font-semibold flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${isListeningLoopActive.current ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-600'}`} />
          {isListeningLoopActive.current ? 'Đang bật' : 'Đã tắt'}
        </span>
      </div>

      {/* Center Animated Orb Section */}
      <div className="flex flex-col items-center justify-center flex-1 w-full max-w-md z-10 py-10 relative">
        
        {/* Ripple effects for active states */}
        {state === 'listening' && (
          <>
            <div className="absolute w-48 h-48 rounded-full border border-blue-500/30 pointer-events-none" style={{ animation: 'ripple 2s infinite ease-out' }} />
            <div className="absolute w-48 h-48 rounded-full border border-sky-400/20 pointer-events-none" style={{ animation: 'ripple 2s infinite ease-out 0.6s' }} />
          </>
        )}
        {state === 'speaking' && (
          <>
            <div className="absolute w-48 h-48 rounded-full border border-emerald-500/30 pointer-events-none" style={{ animation: 'ripple 1.5s infinite ease-out' }} />
          </>
        )}

        {/* The Main Glowing Orb */}
        <button
          onClick={toggleVoiceSession}
          className={`w-48 h-48 rounded-full flex items-center justify-center transition-all duration-700 relative overflow-hidden focus:outline-none shadow-2xl
            ${state === 'idle' ? 'bg-gradient-to-tr from-blue-900/80 to-sky-800/80 border border-blue-500/30 animate-pulse-orb' : ''}
            ${state === 'listening' ? 'bg-gradient-to-tr from-blue-600 to-sky-400 scale-105 border border-sky-300 shadow-sky-500/20 animate-pulse-orb' : ''}
            ${state === 'processing' ? 'bg-gradient-to-tr from-indigo-800/80 to-purple-800/80 border border-purple-500/30' : ''}
            ${state === 'speaking' ? 'bg-gradient-to-tr from-emerald-600 to-cyan-400 scale-105 border border-emerald-300 shadow-emerald-500/20 animate-pulse-orb' : ''}
            ${state === 'error' ? 'bg-gradient-to-tr from-red-950 to-red-800 border border-red-500/40' : ''}
          `}
        >
          {/* Inner details of the orb */}
          <div className="absolute inset-2 rounded-full bg-black/10 backdrop-blur-[2px] flex items-center justify-center">
            {state === 'idle' && (
              <span className="text-neutral-400 text-sm font-medium tracking-wide">Chạm để nói</span>
            )}
            {state === 'listening' && (
              <span className="text-white text-lg font-bold tracking-wide animate-pulse">🎙️ Nói đi...</span>
            )}
            {state === 'processing' && (
              <div className="w-12 h-12 rounded-full border-4 border-purple-500/20 border-t-purple-400 animate-spin-orb" />
            )}
            {state === 'speaking' && (
              <div className="flex gap-1.5 items-end justify-center h-6">
                <span className="w-1 bg-white h-4 rounded-full animate-pulse" style={{ animationDelay: '0.1s' }} />
                <span className="w-1 bg-white h-6 rounded-full animate-pulse" style={{ animationDelay: '0.3s' }} />
                <span className="w-1 bg-white h-3 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                <span className="w-1 bg-white h-5 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
              </div>
            )}
            {state === 'error' && (
              <span className="text-red-300 text-sm font-medium">Lỗi kết nối</span>
            )}
          </div>
        </button>

        {/* Subtitles / Captions */}
        <div className="mt-12 w-full text-center px-4 min-h-[80px]">
          {state === 'listening' && (
            <p className="text-neutral-400 italic text-sm">
              {transcript || 'Đang nghe...'}
            </p>
          )}
          {state === 'processing' && (
            <p className="text-purple-400 text-sm font-medium animate-pulse">Robot đang suy nghĩ...</p>
          )}
          {state === 'speaking' && (
            <p className="text-emerald-400 text-sm font-medium leading-relaxed max-w-sm mx-auto">
              {response}
            </p>
          )}
          {state === 'idle' && (
            <p className="text-neutral-500 text-sm">Chạm vào quả cầu để bắt đầu đàm thoại rảnh tay</p>
          )}
          {errorMsg && (
            <p className="text-red-400 text-xs font-semibold max-w-xs mx-auto mt-2 bg-red-950/40 border border-red-900/40 px-3 py-1.5 rounded-lg">{errorMsg}</p>
          )}
        </div>
      </div>

      {/* Footer controls */}
      <div className="w-full max-w-md z-10 flex flex-col items-center gap-4 pb-4">
        {/* Toggle connection state */}
        <button
          onClick={toggleVoiceSession}
          className={`w-full py-3.5 rounded-full font-bold tracking-wide transition shadow-md text-sm border
            ${isListeningLoopActive.current 
              ? 'bg-neutral-900 text-red-500 border-neutral-800 hover:bg-neutral-850' 
              : 'bg-white text-black border-white hover:bg-neutral-200'}`}
        >
          {isListeningLoopActive.current ? '🔴 DỪNG CUỘC GỌI' : '🎙️ BẮT ĐẦU ĐÀM THOẠI'}
        </button>
        <p className="text-neutral-600 text-[10px] text-center max-w-xs">
          Mẹo: Hãy cho phép truy cập Micro của bạn khi trình duyệt yêu cầu. Nên dùng trên Chrome hoặc Safari di động.
        </p>
      </div>
    </main>
  );
}
