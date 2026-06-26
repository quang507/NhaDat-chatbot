"use client";

import React, { useState, useEffect, useRef } from 'react';

type SlideState = 'idle' | 'listening' | 'processing' | 'speaking';

interface SlideData {
  layout_type?: 'split_image_right' | 'split_image_left' | 'full_background' | 'dark_minimal' | 'text_only';
  title: string;
  points: string[];
  highlight_number?: string;
  speech_text: string;
  image_url?: string;
  image_urls?: string[];
}

export default function SlideBotPage() {
  const [state, setState] = useState<SlideState>('idle');
  const [transcript, setTranscript] = useState('Nhấn nút Micro để bắt đầu');
  const [slide, setSlide] = useState<SlideData | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const isListeningLoopActive = useRef(false);
  const stateRef = useRef<SlideState>('idle');
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<HTMLAudioElement[]>([]);
  const isPlayingRef = useRef(false);

  // Tốc độ đọc slide (đọc nhanh hơn bình thường cho đỡ lê thê)
  const SLIDE_TTS_RATE = '+15%';

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
      if (activeAudioRef.current) activeAudioRef.current.pause();
      audioQueueRef.current = [];
      isPlayingRef.current = false;
      if (recognitionRef.current) recognitionRef.current.abort();
    };
  }, []);

  const toggleMic = () => {
    if (state === 'listening' || state === 'processing' || state === 'speaking') {
      isListeningLoopActive.current = false;
      if (activeAudioRef.current) activeAudioRef.current.pause();
      audioQueueRef.current = [];
      isPlayingRef.current = false;
      if (recognitionRef.current) recognitionRef.current.abort();
      setState('idle');
      setTranscript('Đã dừng. Nhấn nút Micro để bắt đầu lại.');
    } else {
      isListeningLoopActive.current = true;
      if (activeAudioRef.current) activeAudioRef.current.pause();
      try { recognitionRef.current?.start(); } catch(e){}
    }
  };

  // Làm sạch nhẹ + chuẩn hóa cho giọng đọc tự nhiên (giống voice page)
  const cleanSpeech = (s: string): string => {
    return s
      .replace(/#\s*0*(\d+)/g, 'số $1')           // #03 -> số 3
      .replace(/(\d+)\s*[xX]\s*(\d+)/g, '$1 nhân $2') // 5x20 -> 5 nhân 20
      .replace(/(\d+)\s*(m²|m2)\b/gi, '$1 mét vuông')
      .replace(/\.{2,}/g, ', ')
      .replace(/[*_`#]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Tách đoạn thành câu (yêu cầu có khoảng trắng sau dấu kết -> không cắt nhầm "5.19", "Q.8")
  const toSentences = (text: string): string[] =>
    text.split(/(?<=[.!?…])\s+/).map(s => cleanSpeech(s)).filter(Boolean);

  // Khi đọc xong toàn bộ -> quay lại nghe (hands-free) hoặc idle
  const onSpeakDone = () => {
    if (isListeningLoopActive.current) {
      setState('listening');
      setTranscript('Tôi đang nghe...');
      try { recognitionRef.current?.start(); } catch (e) {}
    } else {
      setState('idle');
    }
  };

  const playNextSlideAudio = () => {
    if (isPlayingRef.current) return;
    const audio = audioQueueRef.current.shift();
    if (!audio) { onSpeakDone(); return; }
    isPlayingRef.current = true;
    activeAudioRef.current = audio;
    audio.onended = () => { isPlayingRef.current = false; activeAudioRef.current = null; playNextSlideAudio(); };
    audio.onerror = () => { isPlayingRef.current = false; activeAudioRef.current = null; playNextSlideAudio(); };
    audio.play().catch(() => { isPlayingRef.current = false; playNextSlideAudio(); });
  };

  // Đọc theo TỪNG CÂU: câu đầu phát ngay khi slide hiện, các câu sau preload song song -> hết trễ
  const speakText = (text: string) => {
    if (activeAudioRef.current) { try { activeAudioRef.current.pause(); } catch (e) {} }
    audioQueueRef.current = [];
    isPlayingRef.current = false;

    const sentences = toSentences(text || '');
    if (sentences.length === 0) { onSpeakDone(); return; }

    for (const s of sentences) {
      const audio = new Audio(`/api/tts?rate=${encodeURIComponent(SLIDE_TTS_RATE)}&text=${encodeURIComponent(s)}`);
      audio.preload = 'auto';
      audioQueueRef.current.push(audio);
    }
    playNextSlideAudio();
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
    
    // Lấy tất cả ảnh
    const images: string[] = [];
    if (slide.image_urls && Array.isArray(slide.image_urls)) {
      images.push(...slide.image_urls.filter(Boolean));
    } else if (slide.image_url) {
      images.push(slide.image_url);
    }

    const hasImages = images.length > 0;
    // Nếu không có ảnh, tự động ép sang text_only để hiển thị đẹp nhất
    const layout = hasImages ? (slide.layout_type || 'split_image_right') : 'text_only';

    // Helper render grid ảnh cho split/dark layouts
    const renderImageGrid = () => {
      if (!hasImages) return null;
      if (images.length === 1) {
        return (
          <div className="relative w-full h-full group/img overflow-hidden rounded-2xl">
            <img 
              src={images[0]} 
              alt="Minh họa" 
              className="w-full h-full object-cover opacity-95 hover:opacity-100 hover:scale-[1.02] transition-all duration-500 cursor-pointer"
              onClick={() => setSelectedImage(images[0])}
            />
            <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur px-3 py-1.5 rounded-lg text-xs text-white opacity-0 group-hover/img:opacity-100 transition-opacity duration-300 pointer-events-none flex items-center gap-1">
              🔍 Click để phóng to
            </div>
          </div>
        );
      }
      if (images.length === 2) {
        return (
          <div className="grid grid-cols-2 gap-4 w-full h-full">
            {images.map((img, idx) => (
              <div key={idx} className="relative w-full h-full group/img overflow-hidden rounded-2xl">
                <img 
                  src={img} 
                  alt={`Minh họa ${idx + 1}`} 
                  className="w-full h-full object-cover opacity-95 hover:opacity-100 hover:scale-[1.02] transition-all duration-500 cursor-pointer"
                  onClick={() => setSelectedImage(img)}
                />
                <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur px-3 py-1.5 rounded-lg text-xs text-white opacity-0 group-hover/img:opacity-100 transition-opacity duration-300 pointer-events-none">
                  🔍 Phóng to
                </div>
              </div>
            ))}
          </div>
        );
      }
      // >= 3 ảnh
      return (
        <div className="grid grid-cols-3 gap-4 w-full h-full">
          <div className="col-span-2 h-full relative group/img overflow-hidden rounded-2xl">
            <img 
              src={images[0]} 
              alt="Minh họa chính" 
              className="w-full h-full object-cover opacity-95 hover:opacity-100 hover:scale-[1.02] transition-all duration-500 cursor-pointer"
              onClick={() => setSelectedImage(images[0])}
            />
            <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur px-3 py-1.5 rounded-lg text-xs text-white opacity-0 group-hover/img:opacity-100 transition-opacity duration-300 pointer-events-none">
              🔍 Phóng to
            </div>
          </div>
          <div className="col-span-1 grid grid-rows-2 gap-4 h-full">
            {images.slice(1, 3).map((img, idx) => (
              <div key={idx} className="relative w-full h-full group/img overflow-hidden rounded-2xl">
                <img 
                  src={img} 
                  alt={`Minh họa ${idx + 2}`} 
                  className="w-full h-full object-cover opacity-95 hover:opacity-100 hover:scale-[1.02] transition-all duration-500 cursor-pointer"
                  onClick={() => setSelectedImage(img)}
                />
                <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur px-2 py-1 rounded-[6px] text-[10px] text-white opacity-0 group-hover/img:opacity-100 transition-opacity duration-300 pointer-events-none">
                  🔍 Phóng to
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    };

    // Định nghĩa class container chuẩn 16:9 to lớn chiếm gần trọn màn hình
    const containerClass = "w-full max-w-[95vw] md:max-w-[90vw] xl:max-w-[85vw] aspect-video max-h-[72vh] md:max-h-[75vh] xl:max-h-[78vh] bg-[#000000] rounded-3xl shadow-2xl border border-neutral-900/60 flex overflow-hidden transform transition-all duration-700 hover:shadow-[#e8b84b]/10";

    // 1. TEXT ONLY (Chỉ có văn bản)
    if (layout === 'text_only') {
      return (
        <div className={`${containerClass} flex-col justify-center items-center p-16 relative animate-fade-in`}>
          <div className="absolute inset-0 bg-gradient-to-br from-transparent via-[#e8b84b]/3 to-transparent pointer-events-none"></div>
          
          <div className="max-w-4xl text-center z-10 w-full flex flex-col justify-center items-center h-full">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold mb-8 text-white tracking-tight leading-tight">
              {slide.title}
            </h2>
            
            {slide.highlight_number && (
              <div className="text-6xl md:text-8xl font-extrabold text-transparent bg-clip-text bg-gradient-to-br from-[#ffffff] to-[#a0a0a0] mb-8 tracking-tighter">
                {slide.highlight_number}
              </div>
            )}
            
            <div className="flex flex-col gap-6 items-center w-full max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
              {slide.points.map((point, idx) => (
                <div key={idx} className="flex gap-4 items-start max-w-2xl text-left animate-fade-in-up" style={{ animationDelay: `${idx * 150}ms` }}>
                  <div className="w-2.5 h-2.5 mt-2.5 rounded-full bg-[#e8b84b] shrink-0"></div>
                  <p className="text-xl md:text-2xl text-gray-300 font-light leading-relaxed">{point}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // 2. SPLIT RIGHT / SPLIT LEFT (Chữ một bên, Ảnh một bên)
    if (layout === 'split_image_right' || layout === 'split_image_left') {
      const isLeft = layout === 'split_image_left';
      return (
        <div className={`${containerClass} ${isLeft ? 'flex-row-reverse' : 'flex-row'} animate-fade-in`}>
          {/* Text Content */}
          <div className="flex-1 p-12 md:p-16 flex flex-col justify-center animate-fade-in-up">
            <h2 className="text-3xl md:text-4.5xl font-extrabold mb-6 leading-tight text-white tracking-tight">
              {slide.title}
            </h2>
            <div className="flex flex-col gap-5 flex-1 overflow-y-auto pr-4 custom-scrollbar">
              {slide.points.map((point, idx) => (
                <div key={idx} className="flex gap-4 items-start group animate-fade-in-up" style={{ animationDelay: `${idx * 100}ms` }}>
                  <div className="w-2 h-2 mt-2.5 rounded-full bg-[#e8b84b] shrink-0 transition-transform group-hover:scale-150"></div>
                  <p className="text-lg md:text-xl text-gray-300 leading-relaxed font-light">{point}</p>
                </div>
              ))}
            </div>
          </div>
          {/* Image Grid Section */}
          <div className="flex-1 bg-[#0a0a0a] relative flex items-center justify-center p-6 border-l border-neutral-900/40">
            {renderImageGrid()}
          </div>
        </div>
      );
    }

    // 3. FULL BACKGROUND (Nền toàn màn hình)
    if (layout === 'full_background') {
      const bgImg = images[0];
      return (
        <div className={`${containerClass} flex-col overflow-hidden relative group animate-fade-in`}>
          {bgImg && (
            <div className="absolute inset-0 w-full h-full cursor-pointer overflow-hidden" onClick={() => setSelectedImage(bgImg)}>
              <img 
                src={bgImg} 
                alt="Background" 
                className="w-full h-full object-cover opacity-50 group-hover:scale-105 transition-transform duration-1000 ease-out" 
              />
              <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur px-3 py-1.5 rounded-lg text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                🔍 Click để xem ảnh gốc
              </div>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent pointer-events-none"></div>
          
          <div className="absolute bottom-0 left-0 w-full p-12 md:p-16 flex flex-col z-10">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 text-white tracking-tight drop-shadow-lg animate-slide-up">
              {slide.title}
            </h2>
            <div className="flex flex-col gap-4 max-w-3xl animate-slide-up delay-100">
              {slide.points.map((point, idx) => (
                <p key={idx} className="text-xl md:text-2xl text-gray-200 font-light drop-shadow-md border-l-4 border-[#e8b84b] pl-4">{point}</p>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // 4. DARK MINIMAL (Tối giản, nhấn mạnh số liệu)
    if (layout === 'dark_minimal') {
      return (
        <div className={`${containerClass} animate-fade-in`}>
          {/* Text Content */}
          <div className="flex-1 p-12 md:p-16 flex flex-col justify-center relative z-10">
            <h2 className="text-3xl md:text-4.5xl font-semibold mb-4 text-white tracking-tight opacity-90">
              {slide.title}
            </h2>
            {slide.highlight_number && (
              <div className="text-6xl md:text-8xl font-extrabold text-transparent bg-clip-text bg-gradient-to-br from-[#ffffff] to-[#a0a0a0] mb-6 tracking-tighter">
                {slide.highlight_number}
              </div>
            )}
            <div className="flex flex-col gap-4 max-h-[35vh] overflow-y-auto pr-2 custom-scrollbar">
              {slide.points.map((point, idx) => (
                <p key={idx} className="text-lg md:text-xl text-gray-400 font-light leading-relaxed">{point}</p>
              ))}
            </div>
          </div>
          
          {/* Image Section */}
          <div className="flex-1 relative flex items-center justify-center p-6 border-l border-neutral-900/40 bg-[#070707]">
            {hasImages && (
              <div className="w-full h-full">
                {images.length === 1 ? (
                  <div className="relative w-full h-full group/img overflow-hidden rounded-2xl">
                    <div className="absolute inset-0 bg-gradient-to-r from-[#070707] via-transparent to-transparent z-10 pointer-events-none"></div>
                    <img 
                      src={images[0]} 
                      alt="Minh họa" 
                      className="w-full h-full object-cover opacity-60 hover:opacity-80 transition-opacity duration-500 cursor-pointer"
                      onClick={() => setSelectedImage(images[0])}
                    />
                    <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur px-3 py-1.5 rounded-lg text-xs text-white opacity-0 group-hover/img:opacity-100 transition-opacity duration-300">
                      🔍 Phóng to
                    </div>
                  </div>
                ) : (
                  renderImageGrid()
                )}
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

      {/* Fullscreen Image Lightbox Modal */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md cursor-zoom-out animate-fade-in"
          onClick={() => setSelectedImage(null)}
        >
          <button 
            className="absolute top-6 right-6 text-white/70 hover:text-white text-4xl transition-colors font-light"
            onClick={() => setSelectedImage(null)}
          >
            &times;
          </button>
          <img 
            src={selectedImage} 
            alt="Fullscreen" 
            className="max-w-[95vw] max-h-[90vh] object-contain rounded-xl shadow-2xl border border-neutral-800/80 animate-scale-up"
          />
        </div>
      )}

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
        @keyframes scaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-fade-in {
          animation: fadeIn 0.4s ease-out forwards;
        }
        .animate-scale-up {
          animation: scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
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
