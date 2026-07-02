'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { splitSentences } from '@/lib/speech';
import { classifyAmbientIntent } from '@/lib/intent';
import { useVoiceAgent } from '@/hooks/useVoiceAgent';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface LogItem {
  id: string;
  time: string;
  type: 'INFO' | 'WARN' | 'ERROR' | 'API' | 'SPEECH';
  message: string;
}

export default function VoicePage() {
  // Background images state
  const [backgroundImages, setBackgroundImages] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
  // Debug Logs State
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [logFilter, setLogFilter] = useState<'ALL' | 'SPEECH' | 'API' | 'ERROR'>('ALL');
  
  const chatHistoryRef = useRef<Message[]>([]);
  
  // Helper to store log function to avoid dependency cycles in useEffect
  const addLogRef = useRef<(type: LogItem['type'], message: string) => void>(() => {});
  
  useEffect(() => {
    addLogRef.current = (type, message) => {
      const time = new Date().toLocaleTimeString('vi-VN', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0');
      const newLog: LogItem = {
        id: Math.random().toString(36).substring(2, 9),
        time,
        type,
        message
      };
      setLogs(prev => [newLog, ...prev].slice(0, 150));
      console.log(`[${type}] ${time} - ${message}`);
    };
  });

  const addLog = (type: LogItem['type'], message: string) => {
    addLogRef.current(type, message);
  };

  const {
    state,
    transcript,
    response,
    errorMsg,
    setResponse,
    setState,
    startListening,
    stopAllVoiceActivities,
    bargeIn,
    speakSentence,
    toggleMic,
    isListeningLoopActive,
  } = useVoiceAgent({
    voiceOn: true,
    onSpeechResult: (text) => {
      addLog('SPEECH', `Nhận diện kết quả: "${text}"`);
      handleUserSpeech(text);
    },
    onStateChange: (newState) => {
      addLog('INFO', `Chuyển trạng thái: -> ${newState}`);
    }
  });

  // Slideshow interval
  useEffect(() => {
    if (backgroundImages.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentImageIndex(prev => (prev + 1) % backgroundImages.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [backgroundImages]);

  // Handle sending speech to Vercel API and stream response
  const handleUserSpeech = async (speechText: string) => {
    addLog('API', `Bắt đầu gửi văn bản nhận diện: "${speechText}"`);
    setResponse('Đang suy nghĩ...');
    const startTime = Date.now();
    
    try {
      const history = chatHistoryRef.current;

      // Fire and forget /api/slide to get images if intent matches
      const intent = classifyAmbientIntent(speechText);
      if (intent.shouldGenerate) {
        fetch('/api/slide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: speechText }),
        })
        .then(res => res.json())
        .then(data => {
          let imgs: string[] = [];
          if (data.image_urls && Array.isArray(data.image_urls)) {
            imgs = data.image_urls;
          } else if (data.image_url) {
            imgs = [data.image_url];
          }
          if (imgs.length > 0) {
            setBackgroundImages(imgs);
            setCurrentImageIndex(0);
          }
        })
        .catch(err => addLog('ERROR', 'Lỗi tải ảnh nền: ' + err));
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: speechText, history }),
      });
      
      addLog('API', `Phản hồi từ server /api/chat: status=${res.status}`);
      
      if (!res.ok || !res.body) {
        let errorDetail = 'Lỗi kết nối máy chủ';
        try {
          const errData = await res.json();
          errorDetail = errData.friendly || errData.error || errorDetail;
        } catch (e) {
          try {
            const errText = await res.text();
            if (errText) errorDetail = errText.slice(0, 150);
          } catch(e2) {}
        }
        throw new Error(errorDetail);
      }
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = '';
      let sentenceBuffer = '';
      
      addLog('API', 'Bắt đầu đọc luồng dữ liệu (ReadableStream)...');
      
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          addLog('API', `Đọc xong luồng dữ liệu. Thời gian: ${((Date.now() - startTime) / 1000).toFixed(2)} giây`);
          break;
        }
        
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
        addLog('SPEECH', `Phát nốt câu cuối cùng: "${sentenceBuffer.trim()}"`);
        speakSentence(sentenceBuffer.trim(), true);
      } else {
        // Just call with empty and isLast=true to finish stream
        speakSentence('', true);
      }
      
      // Update history
      chatHistoryRef.current = [
        ...history,
        { role: 'user' as const, content: speechText },
        { role: 'assistant' as const, content: accumulatedText }
      ].slice(-20);
      
    } catch (err: any) {
      addLog('ERROR', `Lỗi trong quá trình kết nối API: ${err.message}`);
      console.error(err);
      setState('error');
      
      if (isListeningLoopActive.current) {
        addLog('INFO', 'Tự động thử lắng nghe lại sau 3 giây...');
        setTimeout(() => {
           if (isListeningLoopActive.current) startListening();
        }, 3000);
      }
    }
  };

  const onOrbClick = () => {
    if (state === 'speaking') { bargeIn(); return; }
    if (!isListeningLoopActive.current) { toggleMic(); }
  };

  const filteredLogs = logs.filter(log => {
    if (logFilter === 'ALL') return true;
    if (logFilter === 'ERROR') return log.type === 'ERROR';
    if (logFilter === 'API') return log.type === 'API';
    if (logFilter === 'SPEECH') return log.type === 'SPEECH';
    return true;
  });

  const hasStarted = state !== 'idle' || transcript !== '' || response !== '';
  let layoutMode = 'default';
  if (hasStarted) {
    layoutMode = backgroundImages.length > 0 ? 'image-focus' : 'text-focus';
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white flex flex-col justify-between items-center p-6 relative overflow-hidden select-none">
      <style dangerouslySetInnerHTML={{__html: `
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
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-pulse-orb {
          animation: orbPulse 3s infinite ease-in-out;
        }
        .animate-spin-orb {
          animation: orbSpin 2s infinite linear;
        }
        .animate-slide-up {
          animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-fade-in {
          animation: fadeIn 0.8s ease-out forwards;
        }
        .animate-scale-up {
          animation: scaleUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}} />
      
      {/* Background images logic */}
      {backgroundImages.length > 0 ? (
        <div className="absolute inset-0 z-0 bg-neutral-950 transition-opacity duration-1000">
          {backgroundImages.map((src, i) => (
            <img 
              key={src} 
              src={src} 
              alt="Background"
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${i === currentImageIndex ? 'opacity-40' : 'opacity-0'}`} 
            />
          ))}
          {/* Blur layer to make UI readable */}
          <div className="absolute inset-0 bg-neutral-950/60 backdrop-blur-3xl"></div>
        </div>
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.08)_0%,transparent_70%)] pointer-events-none z-0" />
      )}

      {/* Header — brand + link sang Slide + trạng thái */}
      <div className="w-full max-w-md flex justify-between items-center z-10 pt-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <img src="/logo.svg" alt="Nhã Đạt AI" className="w-7 h-7 rounded-md flex-shrink-0" />
          <span className="text-sm font-semibold text-neutral-200 hidden sm:inline truncate">Nhã Đạt AI</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href="/slide"
            onClick={stopAllVoiceActivities}
            title="Chuyển sang chế độ trình chiếu slide"
            className="text-xs text-neutral-400 hover:text-white font-semibold flex items-center gap-1.5 bg-neutral-900/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-neutral-800 transition"
          >
            📊 Slide
          </Link>
          <span className="text-xs uppercase tracking-widest text-neutral-500 font-semibold flex items-center gap-1.5 bg-neutral-900/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-neutral-800">
            <span className={`w-2 h-2 rounded-full ${isListeningLoopActive.current ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-600'}`} />
            {isListeningLoopActive.current ? 'Bật' : 'Tắt'}
          </span>
        </div>
      </div>

      {/* Clear Image Showcase on the Left for Image Focus Mode */}
      {layoutMode === 'image-focus' && (
        <div className="absolute left-4 right-4 top-24 bottom-[380px] md:bottom-28 md:left-12 md:right-[42%] z-10 flex items-center justify-center animate-scale-up pointer-events-auto">
          <div className="w-full h-full rounded-2xl overflow-hidden border border-white/10 shadow-2xl relative bg-black/40 backdrop-blur-sm">
            {backgroundImages.map((src, i) => (
              <img 
                key={src} 
                src={src} 
                alt="Showcase"
                className={`absolute inset-0 w-full h-full object-contain transition-all duration-1000 ${i === currentImageIndex ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`} 
              />
            ))}
            
            {/* Dots Indicator if multiple images */}
            {backgroundImages.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-20 bg-black/60 backdrop-blur px-3 py-1.5 rounded-full border border-white/10 shadow-lg">
                {backgroundImages.map((_, idx) => (
                  <span 
                    key={idx} 
                    className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                      idx === currentImageIndex ? 'bg-emerald-400 w-5' : 'bg-white/40'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dynamic Content Area (Orb + Text) */}
      {layoutMode === 'image-focus' ? (
        <div className="absolute left-4 right-4 bottom-24 top-auto md:top-28 md:bottom-28 md:left-auto md:right-12 md:w-[35%] md:max-w-md z-10 flex flex-col justify-end md:justify-between items-center pointer-events-none gap-6">
          <div className="w-full flex flex-col items-center md:items-end text-center md:text-right pointer-events-auto px-4">
            {state === 'listening' && (
              <p className="italic select-text drop-shadow-md text-neutral-400 text-sm">
                {transcript || 'Đang nghe...'}
              </p>
            )}
            {state === 'processing' && (
              <p className="text-purple-400 text-sm font-medium animate-pulse select-text drop-shadow-md">Robot đang suy nghĩ...</p>
            )}
            {state === 'speaking' && (
              <>
                <p className="font-medium leading-relaxed select-text drop-shadow-xl text-emerald-400 text-base md:text-lg bg-black/50 p-4 rounded-2xl border border-white/5 backdrop-blur-md w-full">
                  {response}
                </p>
                <p className="text-neutral-300/80 text-xs mt-3 drop-shadow-md">💬 Cứ nói để chen ngang, hoặc chạm quả cầu để cắt lời</p>
              </>
            )}
            {state === 'idle' && (
              <p className="text-neutral-500 text-sm drop-shadow-md">Chạm vào quả cầu để bắt đầu đàm thoại rảnh tay</p>
            )}
            {errorMsg && (
              <p className="text-red-400 text-xs font-semibold max-w-xs mx-auto mt-2 bg-red-950/40 border border-red-900/40 px-3 py-1.5 rounded-lg select-text">{errorMsg}</p>
            )}
          </div>

          <div className="pointer-events-auto flex items-center justify-center shrink-0 scale-75 md:scale-90 transition-transform">
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

            <button
              onClick={onOrbClick}
              className={`w-48 h-48 rounded-full flex items-center justify-center transition-all duration-700 relative overflow-hidden focus:outline-none shadow-2xl
                ${state === 'idle' ? 'bg-gradient-to-tr from-blue-900/80 to-sky-800/80 border border-blue-500/30 animate-pulse-orb' : ''}
                ${state === 'listening' ? 'bg-gradient-to-tr from-blue-600 to-sky-400 scale-105 border border-sky-300 shadow-sky-500/20 animate-pulse-orb' : ''}
                ${state === 'processing' ? 'bg-gradient-to-tr from-indigo-800/80 to-purple-800/80 border border-purple-500/30' : ''}
                ${state === 'speaking' ? 'bg-gradient-to-tr from-emerald-600 to-cyan-400 scale-105 border border-emerald-300 shadow-emerald-500/20 animate-pulse-orb' : ''}
                ${state === 'error' ? 'bg-gradient-to-tr from-red-950 to-red-800 border border-red-500/40' : ''}
              `}
            >
              <div className="absolute inset-2 rounded-full bg-black/10 backdrop-blur-[2px] flex items-center justify-center">
                {state === 'idle' && (
                  <span className="text-neutral-400 text-sm font-medium tracking-wide">Chạm để nói</span>
                )}
                {state === 'listening' && (
                  <span className="text-white text-sm font-bold tracking-wide animate-pulse">🎙️ Đang nghe...</span>
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
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
          <div 
            className={`absolute transition-all duration-1000 ease-[cubic-bezier(0.23,1,0.32,1)] flex flex-col pointer-events-auto px-6
              ${layoutMode === 'default' ? 'top-[calc(50%+110px)] left-1/2 -translate-x-1/2 w-full max-w-md text-center items-center' : ''}
              ${layoutMode === 'text-focus' ? 'top-28 left-1/2 -translate-x-1/2 w-full max-w-4xl text-center items-center' : ''}
            `}
          >
            {state === 'listening' && (
              <p className={`italic select-text drop-shadow-md transition-all duration-1000 ${layoutMode === 'text-focus' ? 'text-neutral-300 text-xl' : 'text-neutral-400 text-sm'}`}>
                {transcript || 'Đang nghe...'}
              </p>
            )}
            {state === 'processing' && (
              <p className="text-purple-400 text-sm font-medium animate-pulse select-text drop-shadow-md">Robot đang suy nghĩ...</p>
            )}
            {state === 'speaking' && (
              <>
                <p className={`font-medium leading-relaxed select-text drop-shadow-xl transition-all duration-1000 ${layoutMode === 'text-focus' ? 'text-emerald-400 text-3xl md:text-5xl drop-shadow-[0_0_15px_rgba(52,211,153,0.3)]' : 'text-emerald-400 text-base md:text-lg bg-black/40 p-4 rounded-2xl backdrop-blur-md'}`}>
                  {response}
                </p>
                {layoutMode !== 'text-focus' && (
                  <p className="text-neutral-300/80 text-xs mt-3 drop-shadow-md">💬 Cứ nói để chen ngang, hoặc chạm quả cầu để cắt lời</p>
                )}
              </>
            )}
            {state === 'idle' && (
              <p className="text-neutral-500 text-sm drop-shadow-md">Chạm vào quả cầu để bắt đầu đàm thoại rảnh tay</p>
            )}
            {errorMsg && (
              <p className="text-red-400 text-xs font-semibold max-w-xs mx-auto mt-2 bg-red-950/40 border border-red-900/40 px-3 py-1.5 rounded-lg select-text">{errorMsg}</p>
            )}
          </div>
  
          <div 
            className={`absolute transition-all duration-1000 ease-[cubic-bezier(0.23,1,0.32,1)] pointer-events-auto flex items-center justify-center
              ${layoutMode === 'default' ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 scale-100' : ''}
              ${layoutMode === 'text-focus' ? 'bottom-28 left-1/2 -translate-x-1/2 scale-75' : ''}
            `}
          >
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
  
            <button
              onClick={onOrbClick}
              className={`w-48 h-48 rounded-full flex items-center justify-center transition-all duration-700 relative overflow-hidden focus:outline-none shadow-2xl
                ${state === 'idle' ? 'bg-gradient-to-tr from-blue-900/80 to-sky-800/80 border border-blue-500/30 animate-pulse-orb' : ''}
                ${state === 'listening' ? 'bg-gradient-to-tr from-blue-600 to-sky-400 scale-105 border border-sky-300 shadow-sky-500/20 animate-pulse-orb' : ''}
                ${state === 'processing' ? 'bg-gradient-to-tr from-indigo-800/80 to-purple-800/80 border border-purple-500/30' : ''}
                ${state === 'speaking' ? 'bg-gradient-to-tr from-emerald-600 to-cyan-400 scale-105 border border-emerald-300 shadow-emerald-500/20 animate-pulse-orb' : ''}
                ${state === 'error' ? 'bg-gradient-to-tr from-red-950 to-red-800 border border-red-500/40' : ''}
              `}
            >
              <div className="absolute inset-2 rounded-full bg-black/10 backdrop-blur-[2px] flex items-center justify-center">
                {state === 'idle' && (
                  <span className="text-neutral-400 text-sm font-medium tracking-wide">Chạm để nói</span>
                )}
                {state === 'listening' && (
                  <span className="text-white text-sm font-bold tracking-wide animate-pulse">🎙️ Đang nghe...</span>
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
          </div>
        </div>
      )}

      {/* Footer controls — kiểu ChatGPT Voice: [Logs] [Stop/Start] [Exit] */}
      <div className="w-full max-w-md z-10 flex flex-col items-center gap-3 pb-6">
        <div className="flex items-center justify-between w-full px-10">
          <button
            onClick={() => setShowDebug(!showDebug)}
            title={showDebug ? 'Ẩn nhật ký' : 'Xem nhật ký'}
            className="w-12 h-12 rounded-full bg-neutral-800/80 hover:bg-neutral-700 flex items-center justify-center transition border border-neutral-700"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={showDebug ? '#a5b4fc' : '#6b7280'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
            </svg>
          </button>

          <button
            onClick={toggleMic}
            title={isListeningLoopActive.current ? 'Dừng cuộc gọi' : 'Bắt đầu đàm thoại'}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-lg
              ${isListeningLoopActive.current
                ? 'bg-neutral-900 border-2 border-neutral-600 hover:border-neutral-400'
                : 'bg-white hover:bg-neutral-100 shadow-white/20'}`}
          >
            {isListeningLoopActive.current ? (
              <span className="w-5 h-5 bg-red-500 rounded-sm block" />
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#000">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="#000" strokeWidth="2" fill="none" strokeLinecap="round"/>
                <line x1="12" y1="19" x2="12" y2="23" stroke="#000" strokeWidth="2" strokeLinecap="round"/>
                <line x1="8" y1="23" x2="16" y2="23" stroke="#000" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            )}
          </button>

          <Link
            href="/"
            onClick={stopAllVoiceActivities}
            title="Thoát đàm thoại"
            className="w-12 h-12 rounded-full bg-neutral-800/80 hover:bg-neutral-700 flex items-center justify-center transition border border-neutral-700"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </Link>
        </div>

        <p className="text-neutral-600 text-[10px] text-center">
          {isListeningLoopActive.current
            ? 'Nói tự nhiên để chen lời · Chạm quả cầu khi AI đang đọc để cắt ngay'
            : 'Chạm quả cầu hoặc nhấn nút micro để bắt đầu · Nên dùng Chrome / Safari'}
        </p>
      </div>

      {showDebug && (
        <div className="fixed inset-x-0 bottom-0 h-[45vh] bg-neutral-900/95 backdrop-blur-md border-t border-neutral-800 z-50 flex flex-col animate-slide-up shadow-[0_-10px_30px_rgba(0,0,0,0.5)] select-text">
          <div className="flex justify-between items-center px-4 py-2 border-b border-neutral-800 bg-neutral-950/80">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300">Nhật Ký Đàm Thoại & Audit</h3>
            </div>
            
            <div className="flex gap-1 select-none">
              {(['ALL', 'SPEECH', 'API', 'ERROR'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setLogFilter(f)}
                  className={`text-[9px] px-2 py-0.5 rounded transition ${
                    logFilter === f 
                      ? 'bg-indigo-600 text-white font-bold' 
                      : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  const txt = logs.map(l => `[${l.type}] ${l.time} - ${l.message}`).join('\\n');
                  navigator.clipboard.writeText(txt);
                  alert('Đã sao chép toàn bộ log!');
                }}
                className="text-[10px] bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-2 py-1 rounded transition"
              >
                Sao chép
              </button>
              <button
                onClick={() => setLogs([])}
                className="text-[10px] bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-2 py-1 rounded transition"
              >
                Xóa
              </button>
              <button
                onClick={() => setShowDebug(false)}
                className="text-[10px] bg-neutral-700 hover:bg-neutral-600 text-white px-2 py-1 rounded transition font-medium"
              >
                Đóng
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed space-y-1 scrollbar-thin scrollbar-thumb-neutral-850">
            {filteredLogs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-neutral-500 italic">
                Chưa có nhật ký khớp với bộ lọc...
              </div>
            ) : (
              filteredLogs.map((log) => {
                let badgeColor = 'text-neutral-400 bg-neutral-800/40';
                let textColor = 'text-neutral-300';
                if (log.type === 'WARN') {
                  badgeColor = 'text-yellow-400 bg-yellow-950/30 border border-yellow-900/30';
                  textColor = 'text-yellow-200/90';
                } else if (log.type === 'ERROR') {
                  badgeColor = 'text-red-400 bg-red-950/30 border border-red-900/30';
                  textColor = 'text-red-300';
                } else if (log.type === 'API') {
                  badgeColor = 'text-purple-400 bg-purple-950/30 border border-purple-900/30';
                  textColor = 'text-purple-200/90';
                } else if (log.type === 'SPEECH') {
                  badgeColor = 'text-sky-400 bg-sky-950/30 border border-sky-900/30';
                  textColor = 'text-sky-200/90';
                }

                return (
                  <div key={log.id} className="flex items-start gap-2 py-0.5 hover:bg-neutral-800/30 px-1 rounded transition-colors duration-150">
                    <span className="text-neutral-500 flex-shrink-0 select-none">{log.time}</span>
                    <span className={`text-[9px] font-bold px-1 rounded uppercase tracking-wider flex-shrink-0 select-none ${badgeColor}`}>
                      {log.type}
                    </span>
                    <span className={`${textColor} break-all whitespace-pre-wrap flex-1`}>{log.message}</span>
                  </div>
                );
              })
            )}
          </div>

          <div className="px-4 py-1 bg-neutral-950 border-t border-neutral-800 flex justify-between text-[10px] text-neutral-500 font-mono select-none">
            <span>Trạng thái: <strong className="text-neutral-300">{state.toUpperCase()}</strong></span>
            <span>Session: <strong className={isListeningLoopActive.current ? "text-emerald-400" : "text-neutral-400"}>{isListeningLoopActive.current ? "Đang mở" : "Đã đóng"}</strong></span>
          </div>
        </div>
      )}
    </main>
  );
}
