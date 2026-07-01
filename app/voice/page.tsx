'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { cleanTextForTTS, splitSentences, ttsUrl, normalizeVietnameseSpeech } from '@/lib/speech';
import { classifyAmbientIntent } from '@/lib/intent';

type ChatState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

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
  const [state, setState] = useState<ChatState>('idle');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  
  // Background images state
  const [backgroundImages, setBackgroundImages] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
  // Debug Logs State
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [logFilter, setLogFilter] = useState<'ALL' | 'SPEECH' | 'API' | 'ERROR'>('ALL');
  
  const recognitionRef = useRef<any>(null);
  const audioQueueRef = useRef<{ text: string; url: string; audio: HTMLAudioElement }[]>([]);
  const isPlayingAudioRef = useRef<boolean>(false);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const isStreamFinishedRef = useRef<boolean>(false);
  const chatHistoryRef = useRef<Message[]>([]);
  const isListeningLoopActive = useRef(false);
  const audioChunksBuffer = useRef<string>('');

  const chatStateRef = useRef<ChatState>('idle');
  const isRecognitionRunningRef = useRef<boolean>(false);

  // Barge-in (nói chèn lúc AI đang đọc) — dùng VAD trên stream có khử vọng (echoCancellation)
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const vadRafRef = useRef<number | null>(null);
  const speakStartRef = useRef<number>(0); // mốc thời gian câu hiện tại bắt đầu đọc
  const VAD_THRESHOLD = 0.06;  // ngưỡng âm lượng coi là "người dùng đang nói"
  const VAD_FRAMES = 6;        // số khung liên tiếp vượt ngưỡng mới cắt lời (chống nhiễu)
  const SPEAK_GRACE_MS = 400;  // bỏ qua 400ms đầu mỗi câu (tránh dư âm/echo)

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

  // Slideshow interval
  useEffect(() => {
    if (backgroundImages.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentImageIndex(prev => (prev + 1) % backgroundImages.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [backgroundImages]);

  const addLog = (type: LogItem['type'], message: string) => {
    addLogRef.current(type, message);
  };

  // Synchronous state update helper
  const updateState = (newState: ChatState) => {
    addLog('INFO', `Chuyển trạng thái: ${chatStateRef.current} -> ${newState}`);
    setState(newState);
    chatStateRef.current = newState;
  };

  // 1. Initialize Web APIs
  useEffect(() => {
    addLog('INFO', 'Khởi tạo trang VoicePage...');
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = 'vi-VN';
        
        rec.onstart = () => {
          isRecognitionRunningRef.current = true;
          addLog('SPEECH', 'Nhận diện giọng nói bắt đầu (onstart)');
          updateState('listening');
          setTranscript('Mời anh/chị nói chuyện ạ...');
          setErrorMsg('');
        };
        
        rec.onresult = (event: any) => {
          const rawText = event.results[0][0].transcript;
          const resultText = normalizeVietnameseSpeech(rawText) || rawText;
          addLog('SPEECH', `Nhận diện kết quả: "${resultText}" (gốc: "${rawText}")`);
          setTranscript(resultText);
          updateState('processing');
          handleUserSpeech(resultText);
        };
        
        rec.onerror = (event: any) => {
          addLog('ERROR', `Lỗi SpeechRecognition: ${event.error}`);
          console.error('Speech recognition error', event.error);
          
          if (event.error === 'no-speech' || event.error === 'aborted') {
            // Quietly handle no-speech and abort.
            // onend event will handle restarting if listening loop is active.
          } else if (event.error === 'network') {
            // Web Speech API network error recovery (very common on Chrome/Safari when connection fluctuates or long silence)
            // Lỗi này xảy ra rất thường xuyên, ta nên phục hồi ngầm thay vì nhá lỗi lên UI làm phiền user.
            addLog('WARN', 'Lỗi mạng SpeechRecognition (network error), sẽ phục hồi ngầm...');
            // KHÔNG gọi updateState('error') và setErrorMsg() ở đây.
            // Do state vẫn là 'listening', sự kiện onend (chạy ngay sau onerror) sẽ tự động kích hoạt startListening() lại.
            // Có thể thêm delay nhẹ ở onend nếu cần, nhưng thường tự động phục hồi ngay là tốt nhất.
          } else if (event.error === 'not-allowed') {
            setErrorMsg('Quyền truy cập Micro bị chặn. Hãy cấp quyền trong cài đặt trình duyệt.');
            updateState('error');
            stopAllVoiceActivities();
          } else {
            setErrorMsg(`Lỗi micro: ${event.error}`);
            updateState('error');
            if (isListeningLoopActive.current) {
              setTimeout(() => {
                if (isListeningLoopActive.current) {
                  startListening();
                }
              }, 4000);
            }
          }
        };
        
        rec.onend = () => {
          isRecognitionRunningRef.current = false;
          addLog('SPEECH', `Nhận diện kết quả kết thúc (onend). Trạng thái hiện tại: ${chatStateRef.current}`);
          
          // If we finished listening but didn't transition to processing or speaking, restart
          if (isListeningLoopActive.current && chatStateRef.current === 'listening') {
            addLog('SPEECH', 'Nhận diện dừng bất thường, tự động khởi động lại...');
            startListening();
          }
        };
        
        recognitionRef.current = rec;
        addLog('INFO', 'Đã khởi tạo Web Speech API thành công.');
      } else {
        addLog('ERROR', 'Trình duyệt không hỗ trợ Web Speech API.');
        setErrorMsg('Trình duyệt của bạn không hỗ trợ nhận diện giọng nói (Web Speech API). Hãy thử Chrome hoặc Safari.');
        updateState('error');
      }
    }
    
    return () => {
      addLog('INFO', 'Tắt/dọn dẹp VoicePage.');
      stopAllVoiceActivities();
    };
  }, []);

  const stopAllVoiceActivities = () => {
    addLog('INFO', 'Gọi stopAllVoiceActivities() - Dừng mọi hoạt động.');
    isListeningLoopActive.current = false;
    
    if (recognitionRef.current) {
      try {
        addLog('SPEECH', 'Hủy nhận diện (abort)');
        recognitionRef.current.abort();
      } catch(e) {}
    }
    
    if (activeAudioRef.current) {
      try {
        addLog('SPEECH', 'Dừng âm thanh đang phát');
        activeAudioRef.current.pause();
      } catch(e) {}
      activeAudioRef.current = null;
    }
    
    audioQueueRef.current = [];
    isPlayingAudioRef.current = false;
    isStreamFinishedRef.current = false;
    isRecognitionRunningRef.current = false;
    teardownVAD();
  };

  // Cắt lời AI: dừng audio đang đọc + hàng đợi, chuyển sang nghe ngay (giống ChatGPT Voice)
  const bargeIn = () => {
    if (chatStateRef.current !== 'speaking') return;
    addLog('SPEECH', 'Người dùng chèn lời (barge-in) → dừng đọc, chuyển sang nghe.');
    if (activeAudioRef.current) {
      try { activeAudioRef.current.pause(); } catch (e) {}
      activeAudioRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingAudioRef.current = false;
    isStreamFinishedRef.current = false;
    startListening();
  };

  // Thiết lập VAD: getUserMedia (khử vọng) + đo âm lượng để phát hiện người dùng nói lúc AI đang đọc
  const setupVAD = async () => {
    if (mediaStreamRef.current) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      mediaStreamRef.current = stream;
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new Ctx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      let loudFrames = 0;
      const tick = () => {
        vadRafRef.current = requestAnimationFrame(tick);
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / data.length);
        // Chỉ xét cắt lời khi AI đang đọc và đã qua mốc grace (tránh dư âm chính câu vừa phát)
        if (chatStateRef.current === 'speaking' && Date.now() - speakStartRef.current > SPEAK_GRACE_MS) {
          if (rms > VAD_THRESHOLD) loudFrames++; else loudFrames = Math.max(0, loudFrames - 1);
          if (loudFrames >= VAD_FRAMES) { loudFrames = 0; bargeIn(); }
        } else {
          loudFrames = 0;
        }
      };
      tick();
      addLog('INFO', 'Đã bật phát hiện chèn lời (VAD + khử vọng).');
    } catch (e) {
      addLog('WARN', 'Không bật được VAD (vẫn dùng được, chạm orb để cắt lời): ' + e);
    }
  };

  const teardownVAD = () => {
    if (vadRafRef.current != null) { cancelAnimationFrame(vadRafRef.current); vadRafRef.current = null; }
    if (mediaStreamRef.current) { try { mediaStreamRef.current.getTracks().forEach(t => t.stop()); } catch (e) {} mediaStreamRef.current = null; }
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch (e) {} audioCtxRef.current = null; }
  };

  const toggleVoiceSession = () => {
    if (isListeningLoopActive.current) {
      addLog('INFO', 'Người dùng bấm nút: DỪNG ĐÀM THOẠI.');
      stopAllVoiceActivities();
      updateState('idle');
      setTranscript('Đã dừng đàm thoại');
    } else {
      addLog('INFO', 'Người dùng bấm nút: BẮT ĐẦU ĐÀM THOẠI.');
      isListeningLoopActive.current = true;
      setupVAD();
      startListening();
    }
  };

  // Chạm orb: đang đọc -> cắt lời; đang idle -> bắt đầu; còn lại (listening/processing) -> no-op
  const onOrbClick = () => {
    if (chatStateRef.current === 'speaking') { bargeIn(); return; }
    if (!isListeningLoopActive.current) { toggleVoiceSession(); }
  };

  const startListening = () => {
    addLog('INFO', 'Gọi startListening()...');
    
    if (activeAudioRef.current) {
      try {
        addLog('SPEECH', 'Dừng âm thanh cũ để chuẩn bị nghe...');
        activeAudioRef.current.pause();
      } catch(e) {}
      activeAudioRef.current = null;
    }
    
    audioQueueRef.current = [];
    isPlayingAudioRef.current = false;
    isStreamFinishedRef.current = false;

    if (recognitionRef.current) {
      if (isRecognitionRunningRef.current) {
        addLog('WARN', 'Nhận diện giọng nói đang chạy, bỏ qua gọi start() trùng lặp.');
        return;
      }
      try {
        addLog('SPEECH', 'Khởi động SpeechRecognition (start)...');
        recognitionRef.current.start();
      } catch (e: any) {
        addLog('ERROR', `Lỗi khi gọi recognition.start(): ${e.message}`);
      }
    } else {
      addLog('ERROR', 'recognitionRef.current chưa sẵn sàng.');
    }
  };

  // 2-3. Làm sạch chữ + tách câu: dùng chung từ lib/speech.ts (xem import ở đầu file)
  //      Sentence-by-sentence TTS streaming playback via Server API
  const speakSentence = (sentence: string, isLast = false) => {
    if (isLast) {
      isStreamFinishedRef.current = true;
    }

    const cleanText = cleanTextForTTS(sentence);
    if (!cleanText) {
      addLog('WARN', `Bỏ qua câu trống/không hợp lệ: "${sentence}"`);
      if (isLast && !isPlayingAudioRef.current && audioQueueRef.current.length === 0) {
        if (isListeningLoopActive.current) {
          addLog('SPEECH', 'Chuỗi stream hết, không có audio phát, quay lại nghe.');
          startListening();
        } else {
          updateState('idle');
        }
      }
      return;
    }
    
    const audioUrl = ttsUrl(cleanText);
    addLog('SPEECH', `Thêm vào hàng đợi phát âm thanh: "${cleanText}"`);
    
    // Pre-create and preload the audio element to achieve near-zero latency playback (ChatGPT Voice style)
    const audio = new Audio(audioUrl);
    audio.preload = 'auto';
    
    audioQueueRef.current.push({ text: sentence, url: audioUrl, audio });
    
    playNextAudio();
  };

  const playNextAudio = () => {
    if (isPlayingAudioRef.current) {
      addLog('INFO', `Đang phát âm thanh khác. Hàng đợi còn lại: ${audioQueueRef.current.length}`);
      return;
    }

    if (audioQueueRef.current.length === 0) {
      if (isStreamFinishedRef.current) {
        addLog('SPEECH', 'Đã phát hết tất cả các câu phản hồi.');
        if (isListeningLoopActive.current) {
          addLog('SPEECH', 'Tiếp tục lắng nghe (đàm thoại rảnh tay)...');
          startListening();
        } else {
          updateState('idle');
        }
      }
      return;
    }

    const nextAudio = audioQueueRef.current.shift()!;
    isPlayingAudioRef.current = true;
    updateState('speaking');
    speakStartRef.current = Date.now(); // mốc để VAD bỏ qua dư âm đầu câu
    setResponse(nextAudio.text);
    addLog('SPEECH', `Bắt đầu phát âm thanh: "${nextAudio.text}"`);

    const audio = nextAudio.audio;
    activeAudioRef.current = audio;

    audio.onended = () => {
      addLog('SPEECH', `Đã phát xong câu: "${nextAudio.text}"`);
      isPlayingAudioRef.current = false;
      activeAudioRef.current = null;
      playNextAudio();
    };

    audio.onerror = (e) => {
      addLog('ERROR', `Lỗi tải/phát tệp âm thanh: ${nextAudio.url}`);
      console.error('Audio playback error', e);
      isPlayingAudioRef.current = false;
      activeAudioRef.current = null;
      playNextAudio();
    };

    audio.play().catch(err => {
      addLog('ERROR', `Lỗi tự động phát (Autoplay): ${err.message}`);
      console.error('Audio autoplay error', err);
      isPlayingAudioRef.current = false;
      activeAudioRef.current = null;
      playNextAudio();
    });
  };

  // 4. Handle sending speech to Vercel API and stream response
  const handleUserSpeech = async (speechText: string) => {
    addLog('API', `Bắt đầu gửi văn bản nhận diện: "${speechText}"`);
    setResponse('Đang suy nghĩ...');
    audioChunksBuffer.current = '';
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
          // not JSON, fallback to status text or response text
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
        isStreamFinishedRef.current = true;
        if (!isPlayingAudioRef.current && audioQueueRef.current.length === 0) {
          if (isListeningLoopActive.current) {
            addLog('SPEECH', 'Hoàn tất luồng xử lý câu thoại. Quay lại chế độ lắng nghe.');
            startListening();
          } else {
            updateState('idle');
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
      addLog('ERROR', `Lỗi trong quá trình kết nối API: ${err.message}`);
      console.error(err);
      setErrorMsg(err.message || 'Không thể kết nối đến máy chủ.');
      updateState('error');
      
      if (isListeningLoopActive.current) {
        addLog('INFO', 'Tự động thử lắng nghe lại sau 3 giây...');
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
      @keyframes slideUp {
        from { transform: translateY(100%); }
        to { transform: translateY(0); }
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
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const filteredLogs = logs.filter(log => {
    if (logFilter === 'ALL') return true;
    if (logFilter === 'ERROR') return log.type === 'ERROR';
    if (logFilter === 'API') return log.type === 'API';
    if (logFilter === 'SPEECH') return log.type === 'SPEECH';
    return true;
  });

  return (
    <main className="min-h-screen bg-neutral-950 text-white flex flex-col justify-between items-center p-6 relative overflow-hidden select-none">
      
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
          onClick={onOrbClick}
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
              <span className="text-white text-sm font-bold tracking-wide animate-pulse">🎙️ Mời anh/chị nói chuyện...</span>
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
        <div className="mt-12 w-full text-center px-4 min-h-[85px] max-h-[160px] overflow-y-auto">
          {state === 'listening' && (
            <p className="text-neutral-400 italic text-sm select-text">
              {transcript || 'Đang nghe...'}
            </p>
          )}
          {state === 'processing' && (
            <p className="text-purple-400 text-sm font-medium animate-pulse select-text">Robot đang suy nghĩ...</p>
          )}
          {state === 'speaking' && (
            <>
              <p className="text-emerald-400 text-sm font-medium leading-relaxed max-w-sm mx-auto select-text">
                {response}
              </p>
              <p className="text-neutral-500 text-xs mt-2">💬 Cứ nói để chen ngang, hoặc chạm quả cầu để cắt lời</p>
            </>
          )}
          {state === 'idle' && (
            <p className="text-neutral-500 text-sm">Chạm vào quả cầu để bắt đầu đàm thoại rảnh tay</p>
          )}
          {errorMsg && (
            <p className="text-red-400 text-xs font-semibold max-w-xs mx-auto mt-2 bg-red-950/40 border border-red-900/40 px-3 py-1.5 rounded-lg select-text">{errorMsg}</p>
          )}
        </div>
      </div>

      {/* Footer controls — kiểu ChatGPT Voice: [Logs] [Stop/Start] [Exit] */}
      <div className="w-full max-w-md z-10 flex flex-col items-center gap-3 pb-6">
        <div className="flex items-center justify-between w-full px-10">
          {/* Trái: Logs */}
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

          {/* Giữa: Dừng / Bắt đầu phiên */}
          <button
            onClick={toggleVoiceSession}
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

          {/* Phải: Thoát trang */}
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

      {/* Debug & Audit Drawer Overlay */}
      {showDebug && (
        <div className="fixed inset-x-0 bottom-0 h-[45vh] bg-neutral-900/95 backdrop-blur-md border-t border-neutral-800 z-50 flex flex-col animate-slide-up shadow-[0_-10px_30px_rgba(0,0,0,0.5)] select-text">
          {/* Header */}
          <div className="flex justify-between items-center px-4 py-2 border-b border-neutral-800 bg-neutral-950/80">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300">Nhật Ký Đàm Thoại & Audit</h3>
            </div>
            
            {/* Filter buttons */}
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

            {/* Action buttons */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  const txt = logs.map(l => `[${l.type}] ${l.time} - ${l.message}`).join('\n');
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

          {/* Logs List */}
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

          {/* Quick Metrics Bar */}
          <div className="px-4 py-1 bg-neutral-950 border-t border-neutral-800 flex justify-between text-[10px] text-neutral-500 font-mono select-none">
            <span>Trạng thái: <strong className="text-neutral-300">{state.toUpperCase()}</strong></span>
            <span>Microphone: <strong className={isRecognitionRunningRef.current ? "text-emerald-400" : "text-neutral-400"}>{isRecognitionRunningRef.current ? "Đang ghi âm" : "Tắt"}</strong></span>
            <span>Hàng đợi TTS: <strong className="text-neutral-300">{audioQueueRef.current.length} câu</strong></span>
            <span>Session: <strong className={isListeningLoopActive.current ? "text-emerald-400" : "text-neutral-400"}>{isListeningLoopActive.current ? "Đang mở" : "Đã đóng"}</strong></span>
          </div>
        </div>
      )}
    </main>
  );
}
