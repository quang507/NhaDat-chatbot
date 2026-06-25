"use client";

import React, { useState, useEffect, useRef } from 'react';

type SlideState = 'idle' | 'listening' | 'processing' | 'speaking';

interface SlideData {
  layout_type?: 'split_image_right' | 'split_image_left' | 'full_background' | 'dark_minimal';
  title: string;
  points: string[];
  highlight_number?: string;
  speech_text: string;
  image_url: string;
}

export default function SlideBotPage() {
  const [state, setState] = useState<SlideState>('idle');
  const [transcript, setTranscript] = useState('Nhấn nút Micro để bắt đầu');
  const [slide, setSlide] = useState<SlideData | null>(null);
  
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const isListeningLoopActive = useRef(false);
  const stateRef = useRef<SlideState>('idle');

  // Sync state to ref for callbacks
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Setup TTS
      synthRef.current = window.speechSynthesis;

      // Setup STT
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = 'vi-VN';
        
        rec.onstart = () => {
          setState('listening');
          setTranscript('Tôi đang nghe...');
        };
        
        rec.onresult = (event: any) => {
          const text = event.results[0][0].transcript;
          setTranscript(`Bạn nói: "${text}"`);
          setState('processing');
          fetchSlideData(text);
        };
        
        rec.onerror = (event: any) => {
          if (event.error === 'network') {
            // silent recovery
          } else if (event.error === 'not-allowed') {
             setState('idle');
             setTranscript('Vui lòng cấp quyền micro.');
             isListeningLoopActive.current = false;
          } else {
             // other errors
          }
        };
        
        rec.onend = () => {
          if (isListeningLoopActive.current && stateRef.current === 'listening') {
             try { recognitionRef.current?.start(); } catch(e){}
          }
        };
        
        recognitionRef.current = rec;
      } else {
        setTranscript('Trình duyệt không hỗ trợ Web Speech API.');
      }
    }
    
    return () => {
      isListeningLoopActive.current = false;
      if (synthRef.current) synthRef.current.cancel();
      if (recognitionRef.current) recognitionRef.current.abort();
    };
  }, []);

  const toggleMic = () => {
    if (state === 'listening' || state === 'processing' || state === 'speaking') {
      isListeningLoopActive.current = false;
      if (synthRef.current) synthRef.current.cancel();
      if (recognitionRef.current) recognitionRef.current.abort();
      setState('idle');
      setTranscript('Đã dừng. Nhấn nút Micro để bắt đầu lại.');
    } else {
      isListeningLoopActive.current = true;
      if (synthRef.current) synthRef.current.cancel();
      try { recognitionRef.current?.start(); } catch(e){}
    }
  };

  const speakText = (text: string) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();
    
    const voices = synthRef.current.getVoices();
    let viVoice = voices.find(v => v.lang.includes('vi'));
    
    const utterance = new SpeechSynthesisUtterance(text);
    if (viVoice) utterance.voice = viVoice;
    utterance.lang = 'vi-VN';
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    utterance.onend = () => {
      if (isListeningLoopActive.current) {
        setState('listening');
        setTranscript('Tôi đang nghe...');
        try { recognitionRef.current?.start(); } catch(e){}
      } else {
        setState('idle');
      }
    };
    
    utterance.onerror = () => {
      if (isListeningLoopActive.current) {
        setState('listening');
        try { recognitionRef.current?.start(); } catch(e){}
      }
    };

    synthRef.current.speak(utterance);
  };

  const fetchSlideData = async (text: string) => {
    try {
      const res = await fetch('/api/slide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      
      if (!res.ok) throw new Error('API lỗi');
      const data: SlideData = await res.json();
      
      // Mặc định layout nếu AI không chọn
      if (!data.layout_type) data.layout_type = 'split_image_right';
      
      setSlide(data);
      setState('speaking');
      speakText(data.speech_text);
      
    } catch (e) {
      setTranscript('Xin lỗi, có lỗi xảy ra khi xử lý.');
      if (isListeningLoopActive.current) {
        setTimeout(() => {
          setState('listening');
          try { recognitionRef.current?.start(); } catch(e){}
        }, 2000);
      } else {
        setState('idle');
      }
    }
  };

  // Renderers cho các Layout
  const renderSlideContent = () => {
    if (!slide) return null;
    
    const layout = slide.layout_type || 'split_image_right';

    // 1. SPLIT RIGHT (Chữ trái, Ảnh phải)
    if (layout === 'split_image_right' || layout === 'split_image_left') {
      const isLeft = layout === 'split_image_left';
      return (
        <div className={`w-full max-w-6xl w-full h-[70vh] bg-[#000000] rounded-3xl shadow-2xl flex overflow-hidden transform transition-all duration-700 hover:shadow-[#e8b84b]/20 ${isLeft ? 'flex-row-reverse' : 'flex-row'}`}>
          {/* Text Content */}
          <div className="flex-1 p-14 flex flex-col justify-center animate-fade-in-up">
            <h2 className="text-4xl md:text-5xl font-extrabold mb-8 leading-tight text-white tracking-tight">
              {slide.title}
            </h2>
            <div className="flex flex-col gap-6 flex-1 overflow-y-auto pr-4 custom-scrollbar">
              {slide.points.map((point, idx) => (
                <div key={idx} className="flex gap-4 items-start group">
                  <div className="w-2 h-2 mt-2.5 rounded-full bg-[#e8b84b] shrink-0 transition-transform group-hover:scale-150"></div>
                  <p className="text-xl text-gray-300 leading-relaxed font-light">{point}</p>
                </div>
              ))}
            </div>
          </div>
          {/* Image */}
          <div className="flex-1 bg-[#111] relative flex items-center justify-center p-4">
            {slide.image_url ? (
              <img src={slide.image_url} alt="Minh họa" className="w-full h-full object-cover rounded-2xl opacity-90 hover:opacity-100 transition-opacity duration-500" />
            ) : (
              <div className="text-center opacity-30"><div className="text-8xl mb-4">🖼️</div></div>
            )}
          </div>
        </div>
      );
    }

    // 2. FULL BACKGROUND (Nền toàn màn hình)
    if (layout === 'full_background') {
      return (
        <div className="w-full max-w-6xl w-full h-[70vh] bg-black rounded-3xl shadow-2xl overflow-hidden relative group animate-fade-in">
          {slide.image_url && (
            <img src={slide.image_url} alt="Background" className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-1000 ease-out" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent"></div>
          
          <div className="absolute bottom-0 left-0 w-full p-16 flex flex-col">
            <h2 className="text-5xl md:text-6xl font-bold mb-6 text-white tracking-tight drop-shadow-lg animate-slide-up">
              {slide.title}
            </h2>
            <div className="flex flex-col gap-3 max-w-3xl animate-slide-up delay-100">
              {slide.points.map((point, idx) => (
                <p key={idx} className="text-2xl text-gray-200 font-light drop-shadow-md border-l-4 border-[#e8b84b] pl-4">{point}</p>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // 3. DARK MINIMAL (Tối giản, nhấn mạnh số liệu)
    if (layout === 'dark_minimal') {
      return (
        <div className="w-full max-w-6xl w-full h-[70vh] bg-[#050505] rounded-3xl shadow-2xl flex overflow-hidden border border-[#222] relative animate-fade-in">
          {/* Text Content */}
          <div className="flex-1 p-16 flex flex-col justify-center relative z-10">
            <h2 className="text-3xl md:text-4xl font-semibold mb-4 text-white tracking-tight opacity-90">
              {slide.title}
            </h2>
            {slide.highlight_number && (
              <div className="text-7xl md:text-8xl font-extrabold text-transparent bg-clip-text bg-gradient-to-br from-[#ffffff] to-[#a0a0a0] mb-8 tracking-tighter">
                {slide.highlight_number}
              </div>
            )}
            <div className="flex flex-col gap-4">
              {slide.points.map((point, idx) => (
                <p key={idx} className="text-xl text-gray-400 font-light">{point}</p>
              ))}
            </div>
          </div>
          
          {/* Subtle Image on right */}
          <div className="flex-1 relative flex items-center justify-center p-12">
            {slide.image_url && (
              <div className="relative w-full h-full">
                <div className="absolute inset-0 bg-gradient-to-l from-transparent to-[#050505] z-10"></div>
                <img src={slide.image_url} alt="Minh họa" className="w-full h-full object-contain opacity-50 mix-blend-screen" />
              </div>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-[#000000] text-white overflow-hidden flex flex-col relative" style={{ fontFamily: "'Google Sans', 'Product Sans', 'Be Vietnam Pro', sans-serif" }}>
      
      {/* Background Decor (Subtle glow) */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden z-0 opacity-40">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[radial-gradient(circle,rgba(232,184,75,0.05)_0%,transparent_70%)] rounded-full blur-3xl"></div>
      </div>

      {/* Header */}
      <header className="px-8 py-6 z-10 flex justify-between items-center border-b border-[#1e2a45] bg-[#0a0f1e]/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#e8b84b] to-[#c49a2a] flex items-center justify-center text-xl shadow-lg shadow-[#e8b84b]/20">
            🏠
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">Nhã Đạt AI</h1>
            <p className="text-xs text-gray-400">Presentation Bot</p>
          </div>
        </div>
        
        {/* Status Indicator */}
        <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-[#161d30] border border-[#1e2a45]">
          <div className="text-sm font-medium">
            {state === 'idle' && <span className="text-gray-400">Đang chờ</span>}
            {state === 'listening' && <span className="text-green-400 animate-pulse">Đang nghe...</span>}
            {state === 'processing' && <span className="text-blue-400">Đang suy nghĩ...</span>}
            {state === 'speaking' && <span className="text-[#e8b84b]">Đang trả lời</span>}
          </div>
          {state === 'speaking' && (
            <div className="flex items-end gap-[2px] h-4">
              <div className="w-1 bg-[#e8b84b] rounded-full animate-[wave_1s_ease-in-out_infinite] h-[30%]"></div>
              <div className="w-1 bg-[#e8b84b] rounded-full animate-[wave_1s_ease-in-out_infinite_0.2s] h-[70%]"></div>
              <div className="w-1 bg-[#e8b84b] rounded-full animate-[wave_1s_ease-in-out_infinite_0.4s] h-[100%]"></div>
              <div className="w-1 bg-[#e8b84b] rounded-full animate-[wave_1s_ease-in-out_infinite_0.6s] h-[50%]"></div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area - The Slide */}
      <main className="flex-1 z-10 flex items-center justify-center p-8">
        {slide ? (
          renderSlideContent()
        ) : (
          <div className="text-center p-12 max-w-2xl mx-auto">
            <div className="w-24 h-24 mx-auto bg-gradient-to-br from-[#e8b84b] to-[#c49a2a] rounded-full flex items-center justify-center text-4xl mb-8 shadow-[0_0_50px_rgba(232,184,75,0.3)] animate-bounce-slow">
              🎙️
            </div>
            <h2 className="text-3xl font-bold mb-4">Xin chào! Tôi là Slide Bot</h2>
            <p className="text-gray-400 text-lg">Hãy nhấn nút Micro bên dưới và đặt câu hỏi về dự án. Tôi sẽ tạo ngay một Slide trả lời trực quan cho bạn.</p>
          </div>
        )}
      </main>

      {/* Footer / Controls */}
      <footer className="p-6 z-10 flex flex-col items-center gap-4 bg-gradient-to-t from-[#0a0f1e] to-transparent">
        <div className="text-sm text-center font-medium bg-[#161d30]/80 backdrop-blur px-6 py-3 rounded-2xl border border-[#1e2a45] text-gray-300 min-w-[300px] max-w-2xl">
          {transcript}
        </div>
        
        <button 
          onClick={toggleMic}
          className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl shadow-xl transition-all duration-300 ${
            state !== 'idle' 
              ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20 animate-pulse' 
              : 'bg-[#e8b84b] hover:bg-[#c49a2a] shadow-[#e8b84b]/30 text-gray-900'
          }`}
        >
          {state !== 'idle' ? '⏹️' : '🎤'}
        </button>
      </footer>

      {/* Global styles for animation & scrollbar */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes wave {
          0%, 100% { height: 30%; }
          50% { height: 100%; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-fade-in {
          animation: fadeIn 1s ease-out forwards;
        }
        .animate-slide-up {
          animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .delay-100 { animation-delay: 100ms; }
        .animate-bounce-slow {
          animation: bounce 3s infinite;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(30, 42, 69, 0.3);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(232, 184, 75, 0.5);
          border-radius: 10px;
        }
      `}} />
    </div>
  );
}
