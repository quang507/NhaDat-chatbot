"use client";

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { splitCleanSentences, ttsUrl, normalizeVietnameseSpeech } from '@/lib/speech';
import { classifyAmbientIntent } from '@/lib/intent';



type SlideState = 'idle' | 'listening' | 'processing' | 'speaking';

interface SlideData {
  layout_type?: 'split_image_right' | 'split_image_left' | 'full_background' | 'dark_minimal' | 'text_only';
  title: string;
  points: string[];
  highlight_number?: string;
  speech_text: string;
  image_url?: string;
  image_urls?: string[];
  maps_url?: string;
  skip?: boolean;   // nghe ngầm: true = đoạn nói không liên quan, bỏ qua
}

export default function SlideBotPage() {
  const [state, setState] = useState<SlideState>('idle');
  const [transcript, setTranscript] = useState('Nhấn nút Micro để bắt đầu');
  const [slide, setSlide] = useState<SlideData | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  // Chế độ nghe ngầm (ambient) + bật/tắt đọc to
  const [voiceOn, setVoiceOn] = useState(false);
  const isListeningLoopActive = useRef(false);
  const stateRef = useRef<SlideState>('idle');
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<HTMLAudioElement[]>([]);
  const isPlayingRef = useRef(false);
  const nextSentenceTimeoutRef = useRef<any>(null);

  // Refs cho ambient (đọc trong callback STT đã set 1 lần lúc mount)
  const ambientRef = useRef(true); // luôn nghe ngầm (chỉ 1 chế độ)
  const voiceOnRef = useRef(false);
  const bufferRef = useRef('');            // gom lời nói gần đây
  const debounceRef = useRef<any>(null);   // hẹn giờ sau khi ngừng nói
  const lastGenRef = useRef(0);            // mốc lần tạo slide gần nhất (cooldown)
  const lastQueryRef = useRef('');         // query lần trước (tránh lặp)
  const suppressListenRef = useRef(false); // đang đọc to -> tạm ngắt nghe
  const isGeneratingRef = useRef(false);   // đang gọi API slide -> bỏ qua ambient trigger mới
  const activeTopicRef = useRef<{topic: string, expiry: number} | null>(null);
  const shortContextRef = useRef<string[]>([]);
  const lastInstantRef = useRef(0);        // mốc lần bắn slide tức thì gần nhất
  const watchdogRef = useRef<any>(null);   // timer kiểm tra STT "chết câm" để khởi động lại
  const autoStartGestureRef = useRef<(() => void) | null>(null); // handler auto-start ở cử chỉ đầu tiên
  const INSTANT_COOLDOWN_MS = 3000;        // tối thiểu 3s giữa 2 lần bắn tức thì
  const AMBIENT_DEBOUNCE_MS = 600;        // ngừng nói 0.6s mới xét tạo slide -> Rất nhanh!
  const AMBIENT_COOLDOWN_MS = 3500;     // tối thiểu 3.5s giữa 2 slide -> tránh nhảy liên miên khi STT nghe sai/nhiễu

  useEffect(() => { voiceOnRef.current = voiceOn; }, [voiceOn]);

  const slideRef = useRef<SlideData | null>(null);
  const brokenImagesRef = useRef<Record<string, boolean>>({});
  useEffect(() => { slideRef.current = slide; }, [slide]);
  useEffect(() => { brokenImagesRef.current = brokenImages; }, [brokenImages]);

  // Preload toàn bộ ảnh tĩnh ngay khi load trang để tăng tốc đổi slide lên 0ms (no network delay)
  useEffect(() => {
    const staticImages = [
      '/images/01_NyAh-PhuDinh/tien_ich/18_phut_den_Quan_1_Chi_tiet.jpg',
      '/images/01_NyAh-PhuDinh/tien_ich/nyah-phu-dinh_cong-vien.png',
      '/images/01_NyAh-PhuDinh/tien_ich/vi_tri.jpg',
      '/images/01_NyAh-PhuDinh/phoi_canh/nyah-phu-dinh_phoi-canh-garage.png',
      '/images/01_NyAh-PhuDinh/phoi_canh/nyah-phu-dinh_phoi-canh-phong-khach.png',
      '/images/01_NyAh-PhuDinh/phoi_canh/nyah-phu-dinh_phoi-canh-wc.png',
      '/images/01_NyAh-PhuDinh/mat_bang/nyah-phu-ding_mat-bang-tang-1.jpg',
      '/images/01_NyAh-PhuDinh/mat_bang/nyah-phu-dinh_mat-bang-tang-2.jpg',
      '/images/01_NyAh-PhuDinh/mat_bang/nyah-phu-dinh_mat-bang-tang-3.jpg',
      '/images/01_NyAh-PhuDinh/noi_that/opus/opus_bep.jpg',
      '/images/01_NyAh-PhuDinh/noi_that/opus/opus_phong-ngu-1.jpg',
      '/images/01_NyAh-PhuDinh/noi_that/opus/opus_phong-ngu-2.jpg',
      '/images/01_NyAh-PhuDinh/noi_that/opus/opus_phong-ngu-master.jpg',
      '/images/01_NyAh-PhuDinh/noi_that/opus/opus_tang-1.jpg',
      '/images/01_NyAh-PhuDinh/noi_that/opus/opus_tang-2.jpg',
      '/images/01_NyAh-PhuDinh/noi_that/opus/opus_wc.jpg',
      '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_bep.png',
      '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_gara.png',
      '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_phong-khach.png',
      '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_ngu-master.png',
      '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_phong-ngu-2.png',
      '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_phong-ngu-3.png',
      '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_tang-2.png',
      '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_wc.png',
      '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_gara.png',
      '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_phong-khach.png',
      '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_master-bedroom.png',
      '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_phong-hoc.png',
      '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_phong-ngu-con.png',
      '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_tang-2.png',
      '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_tang-3.png',
    ];
    staticImages.forEach(src => {
      const img = new Image();
      img.src = src;
    });
  }, []);

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  // Tăng mỗi lần có slide mới -> ép remount để animation vào lại mượt (kể cả khi chỉ đổi nội dung)
  const [slideKey, setSlideKey] = useState(0);
  const toggleMicRef = useRef<() => void>(() => {});
  const volumeVisualRef = useRef<HTMLDivElement>(null);

  // Slideshow interval tự động chuyển ảnh mỗi 4.5 giây
  useEffect(() => {
    if (!slide) return;
    const imgs: string[] = [];
    if (slide.image_urls && Array.isArray(slide.image_urls)) {
      imgs.push(...slide.image_urls.filter(img => img && !brokenImages[img]));
    } else if (slide.image_url && !brokenImages[slide.image_url]) {
      imgs.push(slide.image_url);
    }
    
    if (imgs.length <= 1) return;
    
    const interval = setInterval(() => {
      setCurrentImageIndex(prev => (prev + 1) % imgs.length);
    }, 4500);
    
    return () => clearInterval(interval);
  }, [slide, brokenImages]);

  const SLIDE_TTS_RATE = '+22%';

  // ===== ENGINE STT: Web Speech API (Chrome Cloud STT xịn) =====
  const recognitionRef = useRef<any>(null);
  const isRecognitionRunningRef = useRef<boolean>(false);
  const isWakeWordModeRef = useRef<boolean>(false);
  const firstGestureRef = useRef<boolean>(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const vadRafRef = useRef<number | null>(null);
  const speakStartRef = useRef<number>(0);

  const startListening = () => {
    if (!recognitionRef.current || isRecognitionRunningRef.current) return;
    try {
      recognitionRef.current.start();
      isRecognitionRunningRef.current = true;
    } catch (e) {
      console.warn('[Speech] Không thể start SpeechRecognition:', e);
    }
  };

  const stopAmbientListening = () => {
    isRecognitionRunningRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
    }
  };

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let handleKeyDown: (e: KeyboardEvent) => void;
    if (typeof window !== 'undefined') {
      handleKeyDown = (e: KeyboardEvent) => {
        if (e.code === 'Space') {
          e.preventDefault();
          toggleMicRef.current();
        } else if (e.key === 'Escape') {
          setSelectedImage(null);
        }
      };
      window.addEventListener('keydown', handleKeyDown);

      const handleFirstGesture = () => {
        if (!firstGestureRef.current) {
          firstGestureRef.current = true;
          isWakeWordModeRef.current = true;
          startListening();
        }
      };
      autoStartGestureRef.current = handleFirstGesture;
      window.addEventListener('pointerdown', handleFirstGesture, { once: true });
      window.addEventListener('keydown', handleFirstGesture, { once: true });

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = 'vi-VN';

        rec.onstart = () => {
          isRecognitionRunningRef.current = true;
          if (isListeningLoopActive.current) {
            setState('listening');
            setTranscript('🎙️ Ny\'ah đang lắng nghe bạn...');
          } else if (isWakeWordModeRef.current) {
            setTranscript('Đang chờ gọi tên (Hey Ny\'ah)...');
          }
        };

        rec.onresult = (event: any) => {
          const rawText = event.results[0][0].transcript;
          const resultText = normalizeVietnameseSpeech(rawText) || rawText;

          if (!isListeningLoopActive.current) {
            const clean = resultText.toLowerCase();
            const wakeWords = ['nhã ơi', 'ê nhã', 'hey nhã', 'hey ny', 'hey nỉ', 'ny\'ah ơi', 'hey ny\'ah', 'ny ah ơi', 'hi ny\'ah', 'chào ny\'ah'];
            if (wakeWords.some(kw => clean.includes(kw))) {
               isListeningLoopActive.current = true;
               isWakeWordModeRef.current = false;
               setupVAD();
               setState('listening');
               setTranscript("👋 Dạ, Ny'ah đang nghe đây ạ!");
               const tts = new Audio(ttsUrl("Dạ, Ny'ah đang nghe đây ạ"));
               tts.play().catch(() => {});
            }
            return;
          }

          if (handleVoiceCommands(resultText)) return;

          setTranscript(`🎧 Nhận diện: "${resultText}"`);
          setState('processing');
          handleAmbientSpeech(resultText);
        };

        rec.onerror = (event: any) => {
          isRecognitionRunningRef.current = false;
          if (event.error === 'no-speech' || event.error === 'aborted') {
          } else if (event.error === 'not-allowed') {
            setTranscript('Quyền truy cập Micro bị chặn.');
            setState('idle');
          }
        };

        rec.onend = () => {
          isRecognitionRunningRef.current = false;
          if (isListeningLoopActive.current || isWakeWordModeRef.current) {
            startListening();
          }
        };

        recognitionRef.current = rec;
      }
    }

    return () => {
      if (typeof window !== 'undefined' && handleKeyDown) {
        window.removeEventListener('keydown', handleKeyDown);
      }
      stopAmbientListening();
      teardownVAD();
    };
  }, []);

  const handleVoiceCommands = (text: string): boolean => {
    const clean = text.toLowerCase().trim();
    const zoomInKeywords = ['phóng to', 'phóng lớn', 'xem ảnh to', 'zoom to', 'zoom lên', 'mở to'];
    if (zoomInKeywords.some(kw => clean.includes(kw))) {
      const images: string[] = [];
      if (slideRef.current?.image_urls && Array.isArray(slideRef.current.image_urls)) {
        images.push(...slideRef.current.image_urls.filter(img => img && !brokenImagesRef.current[img]));
      } else if (slideRef.current?.image_url && !brokenImagesRef.current[slideRef.current.image_url]) {
        images.push(slideRef.current.image_url);
      }
      if (images.length > 0) {
        setSelectedImage(images[0]);
        setState('idle');
        return true;
      }
    }
    const zoomOutKeywords = ['thu nhỏ', 'đóng ảnh', 'đóng hình', 'thoát ảnh', 'quay lại', 'tắt ảnh'];
    if (zoomOutKeywords.some(kw => clean.includes(kw))) {
      setSelectedImage(null);
      setState('idle');
      return true;
    }
    return false;
  };

  const toggleMic = () => {
    if (isListeningLoopActive.current) {
      isListeningLoopActive.current = false;
      isWakeWordModeRef.current = false;
      if (activeAudioRef.current) activeAudioRef.current.pause();
      stopAmbientListening();
      teardownVAD();
      setState('idle');
      setTranscript('Đã dừng. Nhấn nút Micro để nghe lại.');
    } else {
      isListeningLoopActive.current = true;
      isWakeWordModeRef.current = false;
      setupVAD();
      startListening();
    }
  };

  useEffect(() => { toggleMicRef.current = toggleMic; }, [toggleMic]);

  const bargeIn = () => {
    if (stateRef.current !== 'speaking') return;
    if (nextSentenceTimeoutRef.current) {
      clearTimeout(nextSentenceTimeoutRef.current);
      nextSentenceTimeoutRef.current = null;
    }
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    startListening(); 
  };

  const handleAmbientSpeech = (text: string) => {
    bufferRef.current = text;
    maybeGenerateAmbient();
  };

  const maybeGenerateAmbient = () => {
    if (!isListeningLoopActive.current || isGeneratingRef.current) return;
    const query = bufferRef.current.trim();
    if (!query) return;
    const intent = classifyAmbientIntent(query);
    if (!intent.shouldGenerate) return;
    const now = Date.now();
    const wait = AMBIENT_COOLDOWN_MS - (now - lastGenRef.current);
    if (wait > 0 && intent.reason !== 'explicit_slide_request') return;
    
    setTranscript('💡 Chuẩn bị slide...');
    if (intent.topic) activeTopicRef.current = { topic: intent.topic, expiry: now + 45000 };
    fetchSlideData(query, true);
  };

  const teardownVAD = () => {
    if (vadRafRef.current != null) { cancelAnimationFrame(vadRafRef.current); vadRafRef.current = null; }
    if (mediaStreamRef.current) { try { mediaStreamRef.current.getTracks().forEach(t => t.stop()); } catch (e) {} mediaStreamRef.current = null; }
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch (e) {} audioCtxRef.current = null; }
  };

  const setupVAD = async () => {
    if (mediaStreamRef.current) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      mediaStreamRef.current = stream;
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      try { if (ctx.state === 'suspended') ctx.resume(); } catch (e) {}
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);

      const checkVolume = () => {
        vadRafRef.current = requestAnimationFrame(checkVolume);
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        
        if (volumeVisualRef.current) {
          const scale = 1 + Math.min(rms * 5, 2.0);
          volumeVisualRef.current.style.transform = `scale(${scale})`;
          volumeVisualRef.current.style.backgroundColor = rms > 0.01 ? 'rgba(232, 184, 75, 0.25)' : 'rgba(239, 68, 68, 0.15)';
        }

        const elapsed = Date.now() - speakStartRef.current;
        if (rms > 0.045 && elapsed > 900 && stateRef.current === 'speaking') {
          bargeIn();
        }
      };
      checkVolume();
    } catch (e) {
      console.warn('VAD setup failed:', e);
    }
  };

  // Khi đọc xong toàn bộ -> quay lại nghe (hands-free) hoặc idle
  const onSpeakDone = () => {
    teardownVAD();
    if (isListeningLoopActive.current) {
      setState('listening');
      setTranscript('🎙️ Ny\'ah đang lắng nghe bạn...');
      startListening();
    } else {
      setState('idle');
    }
  };

  const playNextSlideAudio = () => {
    if (nextSentenceTimeoutRef.current) {
      clearTimeout(nextSentenceTimeoutRef.current);
      nextSentenceTimeoutRef.current = null;
    }
    if (isPlayingRef.current) return;
    const audio = audioQueueRef.current.shift();
    if (!audio) { onSpeakDone(); return; }
    isPlayingRef.current = true;
    activeAudioRef.current = audio;
    speakStartRef.current = Date.now(); // mốc để VAD bỏ qua dư âm đầu câu
    audio.onended = () => { 
      isPlayingRef.current = false; 
      activeAudioRef.current = null; 
      // Nghỉ 450ms giữa 2 câu để tạo nhịp thở tự nhiên giống người thật!
      nextSentenceTimeoutRef.current = setTimeout(playNextSlideAudio, 450); 
    };
    audio.onerror = () => { isPlayingRef.current = false; activeAudioRef.current = null; playNextSlideAudio(); };
    audio.play().catch(() => { isPlayingRef.current = false; playNextSlideAudio(); });
  };

  // Đọc theo TỪNG CÂU: câu đầu phát ngay khi slide hiện, các câu sau preload song song -> hết trễ
  const speakText = (text: string) => {
    if (nextSentenceTimeoutRef.current) {
      clearTimeout(nextSentenceTimeoutRef.current);
      nextSentenceTimeoutRef.current = null;
    }
    if (activeAudioRef.current) { try { activeAudioRef.current.pause(); } catch (e) {} }
    audioQueueRef.current = [];
    isPlayingRef.current = false;

    const sentences = splitCleanSentences(text || '');
    if (sentences.length === 0) { onSpeakDone(); return; }

    for (const s of sentences) {
      const audio = new Audio(ttsUrl(s, SLIDE_TTS_RATE));
      audio.preload = 'auto';
      audioQueueRef.current.push(audio);
    }
    playNextSlideAudio();
  };

  const fetchSlideData = async (text: string, ambient = false) => {
    try {
      isGeneratingRef.current = true;
      if (!ambient) setState('processing');
      const res = await fetch('/api/slide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, ambient })
      });

      if (!res.ok) throw new Error('API lỗi');
      const data: SlideData = await res.json();

      // Nếu AI báo skip hoặc không có dữ liệu trả lời phù hợp -> Giữ nguyên slide cũ, không đọc, không đổi màn hình
      if (data.skip || !data.speech_text || !data.title || data.title === 'Lỗi hiển thị' || data.title.includes('Lỗi hiển thị')) {
        if (ambient) {
          setTranscript('🎧 Đang nghe ngầm… (chưa có chủ đề rõ ràng)');
        } else {
          setTranscript('Không tìm thấy thông tin phù hợp trong dữ liệu dự án.');
          setState('idle');
        }
        return;
      }

      // Mặc định layout nếu AI không chọn
      if (!data.layout_type) data.layout_type = 'split_image_right';
      setBrokenImages({});
      setCurrentImageIndex(0);
      setSlideKey(k => k + 1);
      setSlide(data);
      if (ambient) {
        lastGenRef.current = Date.now();
      }

      if (voiceOnRef.current) {
        // Có đọc to: tạm ngắt mic khi đang đọc (tránh loa vọng vào mic)
        stopAmbientListening();
        setupVAD();
        setState('speaking');
        speakText(data.speech_text);
      } else {
        // Im lặng: chỉ hiện slide
        setState('listening');
        setTranscript('🎙️ Ny\'ah đang lắng nghe bạn...');
        startListening();
      }
    } catch (e) {
      if (ambient) {
        setState('listening');
        setTranscript('🎙️ Ny\'ah đang lắng nghe bạn...');
        startListening();
        return;
      }
      setTranscript('Xin lỗi, có lỗi xảy ra khi xử lý.');
      if (isListeningLoopActive.current) {
        setState('listening');
        setTranscript('🎙️ Ny\'ah đang lắng nghe bạn...');
        startListening();
      } else {
        setState('idle');
      }
    } finally {
      // Luôn reset in-flight guard dù thành công hay thất bại
      isGeneratingRef.current = false;
    }
  };

  // Renderers cho các Layout
  const renderSlideContent = () => {
    if (!slide) return null;
    
    // Lấy tất cả ảnh
    const images: string[] = [];
    if (slide.image_urls && Array.isArray(slide.image_urls)) {
      images.push(...slide.image_urls.filter(img => img && !brokenImages[img]));
    } else if (slide.image_url && !brokenImages[slide.image_url]) {
      images.push(slide.image_url);
    }

    const hasImages = images.length > 0;
    // Nếu không có ảnh, tự động ép sang text_only để hiển thị đẹp nhất
    const layout = hasImages ? (slide.layout_type || 'split_image_right') : 'text_only';

    // Helper render grid ảnh cho split/dark layouts
    // Helper render slideshow ảnh tự động cho các layout
    const renderImageGrid = () => {
      if (!hasImages) return null;
      
      return (
        <div className="relative w-full h-full group/img overflow-hidden bg-[#070707] flex items-center justify-center">
          {/* Render các ảnh đè lên nhau, chỉ hiển thị ảnh active bằng transition mờ dần */}
          {images.map((img, idx) => {
            const isActive = idx === (currentImageIndex % images.length);
            const isMap = img.includes('vi_tri') || img.includes('18_phut');
            return (
              <div 
                key={img + '-' + idx}
                className={`absolute inset-0 w-full h-full flex items-center justify-center transition-all duration-1000 ease-in-out overflow-hidden bg-black ${
                  isActive ? 'opacity-95 scale-100 z-10' : 'opacity-0 scale-95 z-0 pointer-events-none'
                }`}
                style={{ willChange: 'opacity, transform', transform: 'translate3d(0,0,0)' }}
              >
                {/* Lớp nền mờ chìm phía sau giúp lấp đầy khoảng đen nếu ảnh bị hẹp */}
                <div 
                  className="absolute inset-0 w-full h-full bg-cover bg-center blur-2xl opacity-40 scale-[1.15]" 
                  style={{ backgroundImage: `url('${img}')` }}
                ></div>
                
                {/* Ảnh chính nổi lên trên */}
                <img 
                  src={img} 
                  alt={`Minh họa ${idx + 1}`} 
                  className={`relative z-10 w-full h-full cursor-pointer transition-transform duration-500 hover:scale-[1.02] drop-shadow-2xl object-contain`}
                  style={{ willChange: 'transform', transform: 'translate3d(0,0,0)' }}
                  onClick={() => setSelectedImage(img)}
                  onError={() => setBrokenImages(prev => ({ ...prev, [img]: true }))}
                />
                
                {/* Lồng mã QR Code Google Maps ngay góc nếu ảnh này là bản đồ */}
                {isMap && isActive && (() => {
                  const qrUrl = slide.maps_url || 'https://maps.app.goo.gl/qwf4XibyMCL9sEX6A';
                  return (
                    <div className="absolute bottom-4 left-4 bg-black/85 backdrop-blur p-3 rounded-2xl border border-white/10 flex flex-col items-center gap-1.5 shadow-2xl animate-scale-up z-20">
                      <a href={qrUrl} target="_blank" rel="noopener noreferrer" className="block">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrUrl)}`}
                          alt="QR Vị Trí"
                          className="w-[100px] h-[100px] rounded-lg bg-white p-1 hover:scale-105 transition-transform"
                        />
                      </a>
                      <span className="text-[9px] text-gray-300 font-bold tracking-tight text-center max-w-[100px] leading-normal">
                        Quét bản đồ
                      </span>
                    </div>
                  );
                })()}
              </div>
            );
          })}

          {/* Chỉ báo phóng to */}
          <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur px-3 py-1.5 rounded-lg text-xs text-white opacity-0 group-hover/img:opacity-100 transition-opacity duration-300 pointer-events-none z-20 flex items-center gap-1">
            🔍 Click để phóng to
          </div>

          {/* Dots Indicator nếu có nhiều ảnh */}
          {images.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-20 bg-black/50 backdrop-blur px-3 py-1.5 rounded-full border border-white/10 shadow-lg">
              {images.map((_, idx) => {
                const isActive = idx === (currentImageIndex % images.length);
                return (
                  <button
                    key={idx}
                    onClick={() => setCurrentImageIndex(idx)}
                    className={`w-2 h-2 rounded-full transition-all duration-300 ${
                      isActive ? 'bg-[#e8b84b] w-4' : 'bg-white/40 hover:bg-white/70'
                    }`}
                    aria-label={`Go to slide ${idx + 1}`}
                  />
                );
              })}
            </div>
          )}
        </div>
      );
    };

    // Định nghĩa class container to lớn chiếm gần trọn màn hình (độ cao chiếm 72-84vh để tối đa chiều cao ảnh)
    const containerClass = "slide-stage w-full max-w-[95vw] md:max-w-[92vw] xl:max-w-[88vw] h-[72vh] md:h-[78vh] xl:h-[84vh] rounded-3xl shadow-2xl border border-white/5 flex overflow-hidden transform transition-all duration-700 hover:shadow-[#e8b84b]/10";

    // 1. TEXT ONLY (Chỉ có văn bản)
    if (layout === 'text_only') {
      return (
        <div className={`${containerClass} flex-col justify-center items-center p-16 relative animate-fade-in`}>
          <div className="absolute inset-0 bg-gradient-to-br from-transparent via-[#e8b84b]/3 to-transparent pointer-events-none"></div>
          
          <div key={slide.title} className="max-w-4xl text-center z-10 w-full flex flex-col justify-center items-center h-full animate-fade-in-up">
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
                  <p className="text-lg md:text-xl lg:text-[21px] text-gray-300 font-light leading-relaxed">{point}</p>
                </div>
              ))}
              
              {/* Lời giải thích chi tiết / Phần hồn chữ viết */}
              {slide.speech_text && (
                <div className="mt-6 pt-6 border-t border-white/10 max-w-3xl animate-fade-in-up" style={{ animationDelay: '500ms' }}>
                  <p className="text-[19px] md:text-[22px] text-gray-400/90 font-light italic leading-relaxed text-center">
                    "{slide.speech_text}"
                  </p>
                </div>
              )}
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
          {/* Text Content — chiếm 40% */}
          <div key={slide.title} className="basis-[40%] shrink-0 p-10 md:p-12 flex flex-col justify-center animate-fade-in-up">
            <h2 className="text-4xl md:text-5xl lg:text-[3.25rem] font-extrabold mb-6 leading-[1.1] text-white tracking-tight">
              {slide.title}
            </h2>
            <div className="flex flex-col gap-5 flex-1 overflow-y-auto pr-3 custom-scrollbar">
              {slide.points.map((point, idx) => (
                <div key={idx} className="flex gap-3.5 items-start group animate-fade-in-up" style={{ animationDelay: `${idx * 100}ms` }}>
                  <div className="w-2.5 h-2.5 mt-[0.7rem] rounded-full bg-[#e8b84b] shrink-0 transition-transform group-hover:scale-150"></div>
                  <p className="text-lg md:text-xl lg:text-[21px] text-gray-200 leading-relaxed font-light">{point}</p>
                </div>
              ))}

              {/* Lời giải thích chi tiết / Phần hồn chữ viết */}
              {slide.speech_text && (
                <div className="mt-4 pt-4 border-t border-white/10 animate-fade-in-up" style={{ animationDelay: '400ms' }}>
                  <p className="text-[17px] md:text-[19px] text-gray-400/90 font-light italic leading-relaxed">
                    "{slide.speech_text}"
                  </p>
                </div>
              )}
            </div>
          </div>
          {/* Image Section — chiếm 60%, ảnh tràn viền (không chừa khoảng) */}
          <div className="basis-[60%] shrink-0 relative flex items-stretch justify-center border-l border-white/5">
            {renderImageGrid()}
          </div>
        </div>
      );
    }

    // 3. FULL BACKGROUND — ảnh chiếm TRỌN khung, chữ nằm trong khung mờ ở 1 GÓC (dưới-trái).
    if (layout === 'full_background') {
      const bgImg = images[currentImageIndex % images.length];
      return (
        <div className={`${containerClass} flex-col overflow-hidden relative group animate-fade-in`}>
          {bgImg && (
            <div className="absolute inset-0 w-full h-full cursor-pointer overflow-hidden bg-black" onClick={() => setSelectedImage(bgImg)}>
              {/* Lớp nền mờ lấp khoảng đen */}
              <div 
                className="absolute inset-0 w-full h-full bg-cover bg-center blur-3xl opacity-30 scale-[1.15] transition-transform duration-[3000ms] ease-out group-hover:scale-[1.25]"
                style={{ backgroundImage: `url('${bgImg}')` }}
              ></div>
              {/* Ảnh chính */}
              <img
                src={bgImg}
                alt="Ảnh dự án"
                className="relative z-10 w-full h-full object-contain drop-shadow-2xl transition-transform duration-[2000ms] ease-out group-hover:scale-[1.02]"
                onError={() => setBrokenImages(prev => ({ ...prev, [bgImg]: true }))}
              />
            </div>
          )}
          {/* Lớp tối nhẹ chỉ ở góc dưới-trái để chữ nổi mà ảnh vẫn rõ */}
          <div className="absolute inset-0 bg-gradient-to-tr from-black/75 via-black/10 to-transparent pointer-events-none"></div>

          {/* Khung chữ ở GÓC dưới-trái */}
          <div key={slide.title} className="absolute bottom-6 left-6 md:bottom-8 md:left-8 max-w-[58%] md:max-w-[48%] z-10 animate-fade-in-up">
            <div className="bg-black/55 backdrop-blur-md rounded-2xl border border-white/10 px-6 py-5 md:px-7 md:py-6 shadow-2xl">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-3 md:mb-4 text-white tracking-tight leading-tight">
                {slide.title}
              </h2>
              <div className="flex flex-col gap-2.5">
                {slide.points.slice(0, 4).map((point, idx) => (
                  <p key={idx} className="text-base md:text-lg text-gray-100 font-light leading-snug border-l-[3px] border-[#e8b84b] pl-3">{point}</p>
                ))}
                
                {/* Lời giải thích chi tiết / Phần hồn chữ viết */}
                {slide.speech_text && (
                  <div className="mt-3 pt-3 border-t border-white/20 animate-fade-in-up" style={{ animationDelay: '300ms' }}>
                    <p className="text-sm md:text-base text-gray-300 font-light italic leading-snug">
                      "{slide.speech_text}"
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Chấm chuyển ảnh nếu nhiều ảnh */}
          {images.length > 1 && (
            <div className="absolute bottom-4 right-4 flex gap-1.5 z-20 bg-black/50 backdrop-blur px-3 py-1.5 rounded-full border border-white/10">
              {images.map((_, idx) => (
                <span key={idx} className={`w-2 h-2 rounded-full transition-all ${idx === (currentImageIndex % images.length) ? 'bg-[#e8b84b] w-4' : 'bg-white/40'}`} />
              ))}
            </div>
          )}
        </div>
      );
    }

    // 4. DARK MINIMAL (Tối giản, nhấn mạnh số liệu)
    if (layout === 'dark_minimal') {
      return (
        <div className={`${containerClass} animate-fade-in`}>
          {/* Text Content */}
          <div key={slide.title} className="flex-1 p-12 md:p-16 flex flex-col justify-center relative z-10 animate-fade-in-up">
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
                <p key={idx} className="text-[16px] md:text-[18px] text-gray-400 font-light leading-relaxed">{point}</p>
              ))}
              
              {/* Lời giải thích chi tiết / Phần hồn chữ viết */}
              {slide.speech_text && (
                <div className="mt-6 pt-5 border-t border-white/10 animate-fade-in-up" style={{ animationDelay: '400ms' }}>
                  <p className="text-[17px] md:text-[19px] text-gray-500 font-light italic leading-relaxed">
                    "{slide.speech_text}"
                  </p>
                </div>
              )}
            </div>
          </div>
          
          {/* Image Section */}
          <div className="flex-1 relative flex items-center justify-center p-6 border-l border-neutral-900/40 bg-[#070707]">
            {renderImageGrid()}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="h-screen max-h-screen text-white overflow-hidden flex flex-col relative slide-page-bg" style={{ fontFamily: "'Google Sans', 'Product Sans', 'Be Vietnam Pro', sans-serif" }}>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes floatSlow1 {
          0% { transform: translate(-10%, -10%) scale(1); }
          50% { transform: translate(15%, 20%) scale(1.15); }
          100% { transform: translate(-10%, -10%) scale(1); }
        }
        @keyframes floatSlow2 {
          0% { transform: translate(20%, 30%) scale(1.1); }
          50% { transform: translate(-5%, -10%) scale(0.9); }
          100% { transform: translate(20%, 30%) scale(1.1); }
        }
        @keyframes particleFloat1 {
          0% { transform: translate(15vw, 105vh) scale(0.8); opacity: 0; }
          10% { opacity: 0.15; }
          90% { opacity: 0.15; }
          100% { transform: translate(25vw, -5vh) scale(1.2); opacity: 0; }
        }
        @keyframes particleFloat2 {
          0% { transform: translate(75vw, 105vh) scale(1.2); opacity: 0; }
          10% { opacity: 0.12; }
          90% { opacity: 0.12; }
          100% { transform: translate(65vw, -5vh) scale(0.8); opacity: 0; }
        }
        @keyframes particleFloat3 {
          0% { transform: translate(45vw, 105vh) scale(1); opacity: 0; }
          10% { opacity: 0.18; }
          90% { opacity: 0.18; }
          100% { transform: translate(55vw, -5vh) scale(1.3); opacity: 0; }
        }
        @keyframes particleFloat4 {
          0% { transform: translate(5vw, 105vh) scale(1.1); opacity: 0; }
          10% { opacity: 0.1; }
          90% { opacity: 0.1; }
          100% { transform: translate(15vw, -5vh) scale(0.7); opacity: 0; }
        }
        @keyframes particleFloat5 {
          0% { transform: translate(90vw, 105vh) scale(0.7); opacity: 0; }
          10% { opacity: 0.15; }
          90% { opacity: 0.15; }
          100% { transform: translate(80vw, -5vh) scale(1.1); opacity: 0; }
        }
        @keyframes particleFloat6 {
          0% { transform: translate(30vw, 105vh) scale(1); opacity: 0; }
          10% { opacity: 0.16; }
          90% { opacity: 0.16; }
          100% { transform: translate(40vw, -5vh) scale(1.2); opacity: 0; }
        }
        @keyframes particleFloat7 {
          0% { transform: translate(60vw, 105vh) scale(1.3); opacity: 0; }
          10% { opacity: 0.1; }
          90% { opacity: 0.1; }
          100% { transform: translate(50vw, -5vh) scale(0.9); opacity: 0; }
        }
        @keyframes particleFloat8 {
          0% { transform: translate(80vw, 105vh) scale(0.9); opacity: 0; }
          10% { opacity: 0.14; }
          90% { opacity: 0.14; }
          100% { transform: translate(85vw, -5vh) scale(1.1); opacity: 0; }
        }

        .animate-float-slow-1 {
          animation: floatSlow1 35s ease-in-out infinite;
          top: -20%; left: -10%;
          will-change: transform;
        }
        .animate-float-slow-2 {
          animation: floatSlow2 40s ease-in-out infinite;
          bottom: -15%; right: -10%;
          will-change: transform;
        }
        .animate-particle-1 { animation: particleFloat1 25s linear infinite; }
        .animate-particle-2 { animation: particleFloat2 30s linear infinite; animation-delay: 3s; }
        .animate-particle-3 { animation: particleFloat3 22s linear infinite; animation-delay: 7s; }
        .animate-particle-4 { animation: particleFloat4 28s linear infinite; animation-delay: 11s; }
        .animate-particle-5 { animation: particleFloat5 35s linear infinite; animation-delay: 5s; }
        .animate-particle-6 { animation: particleFloat6 24s linear infinite; animation-delay: 15s; }
        .animate-particle-7 { animation: particleFloat7 32s linear infinite; animation-delay: 9s; }
        .animate-particle-8 { animation: particleFloat8 20s linear infinite; animation-delay: 18s; }
      ` }} />

      {/* Background Decor (bokeh glow + floating particles) */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden z-0 bg-[#060b16]">
        {/* Lớp mây sáng lớn di chuyển chậm */}
        <div className="absolute w-[65vw] h-[65vh] bg-[radial-gradient(circle,rgba(232,184,75,0.025)_0%,transparent_70%)] rounded-full blur-[100px] animate-float-slow-1"></div>
        <div className="absolute w-[55vw] h-[55vh] bg-[radial-gradient(circle,rgba(30,58,138,0.05)_0%,transparent_70%)] rounded-full blur-[100px] animate-float-slow-2"></div>
        
        {/* Các hạt bụi vàng (bokeh particles) bay lơ lửng */}
        <div className="absolute w-2.5 h-2.5 rounded-full bg-[#e8b84b] blur-[0.5px] animate-particle-1"></div>
        <div className="absolute w-3 h-3 rounded-full bg-[#e8b84b] blur-[1px] animate-particle-2"></div>
        <div className="absolute w-1.5 h-1.5 rounded-full bg-[#e8b84b] blur-[0.5px] animate-particle-3"></div>
        <div className="absolute w-2 h-2 rounded-full bg-[#e8b84b] blur-[1px] animate-particle-4"></div>
        <div className="absolute w-3.5 h-3.5 rounded-full bg-[#e8b84b] blur-[1.5px] animate-particle-5"></div>
        <div className="absolute w-2 h-2 rounded-full bg-[#e8b84b] blur-[0.5px] animate-particle-6"></div>
        <div className="absolute w-3.5 h-3.5 rounded-full bg-[#e8b84b] blur-[1px] animate-particle-7"></div>
        <div className="absolute w-1.5 h-1.5 rounded-full bg-[#e8b84b] blur-[0.5px] animate-particle-8"></div>
      </div>

      {/* Header */}
      <header className="px-4 md:px-6 py-2 z-10 flex justify-between items-center border-b border-[#1e2a45] bg-[#0a0f1e]/80 backdrop-blur-md shrink-0">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-lg shrink-0"><img src="/logo.svg" alt="Ny'ah Phú Định" className="w-[82%] h-[82%] object-contain" /></span>
          <div>
            <h1 className="font-bold text-sm leading-tight">Ny'ah Phú Định</h1>
            <p className="text-[10px] text-gray-400 leading-tight">Trình chiếu thông minh · Nhã Đạt AI</p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
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

          {/* Điều hướng: sang Voice / thoát về trang chủ */}
          <Link
            href="/voice"
            title="Chuyển sang đàm thoại giọng nói"
            className="hidden sm:flex items-center gap-1.5 text-sm px-3 py-2 rounded-full bg-[#161d30] border border-[#1e2a45] text-gray-300 hover:text-white hover:border-[#e8b84b]/50 transition"
          >
            🎧 <span className="hidden md:inline">Voice</span>
          </Link>
          <Link
            href="/"
            onClick={() => { isListeningLoopActive.current = false; if (activeAudioRef.current) activeAudioRef.current.pause(); stopAmbientListening(); teardownVAD(); }}
            title="Thoát về trang chủ"
            className="w-9 h-9 flex items-center justify-center rounded-full bg-[#161d30] border border-[#1e2a45] text-gray-400 hover:text-white hover:border-red-500/50 transition"
          >
            ✕
          </Link>
        </div>
      </header>

      {/* Main Content Area - The Slide */}
      <main className="flex-1 min-h-0 z-10 flex items-center justify-center p-3">
        {slide ? (
          <div className="w-full h-full flex items-center justify-center">
            {renderSlideContent()}
          </div>
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
      <footer className="px-4 py-3 z-10 flex flex-wrap items-center justify-center gap-2.5 bg-gradient-to-t from-[#0a0f1e] to-transparent shrink-0">
        <div className={`text-sm font-medium bg-[#161d30]/80 backdrop-blur px-4 py-2.5 rounded-2xl border text-gray-300 min-w-0 max-w-[42vw] flex-1 flex items-center justify-center gap-2.5 transition-colors ${
          state === 'listening' ? 'border-green-500/60' : state === 'processing' ? 'border-blue-500/60' : 'border-[#1e2a45]'
        }`}>
          {state === 'listening' && (
            // Tín hiệu sóng âm "đang nghe" — 3 vạch nhấp nháy lệch pha
            <span className="flex items-end gap-0.5 h-4 shrink-0" aria-hidden>
              <span className="w-0.5 bg-green-400 rounded-full animate-sound-wave" style={{ height: '40%', animationDelay: '0ms' }} />
              <span className="w-0.5 bg-green-400 rounded-full animate-sound-wave" style={{ height: '100%', animationDelay: '150ms' }} />
              <span className="w-0.5 bg-green-400 rounded-full animate-sound-wave" style={{ height: '60%', animationDelay: '300ms' }} />
            </span>
          )}
          {state === 'processing' && (
            <span className="w-3.5 h-3.5 shrink-0 border-2 border-blue-400/40 border-t-blue-400 rounded-full animate-spin" aria-hidden />
          )}
          <span className="truncate">{transcript}</span>
        </div>

        {/* Chỉ còn toggle Đọc to (nghe ngầm điều khiển bằng nút mic) */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const newVal = !voiceOn;
              setVoiceOn(newVal);
              // Khi tắt đọc: dừng audio đang phát ngay lập tức
              if (!newVal) {
                if (activeAudioRef.current) {
                  try { activeAudioRef.current.onended = null; activeAudioRef.current.pause(); } catch (e) {}
                  activeAudioRef.current = null;
                }
                audioQueueRef.current = [];
                isPlayingRef.current = false;
                onSpeakDone();
              }
            }}
            title="Bật/tắt giọng đọc khi slide hiện"
            className={`px-4 py-2 rounded-full text-xs font-semibold border transition-all flex items-center gap-1.5 ${
              voiceOn
                ? 'bg-[#e8b84b]/15 border-[#e8b84b]/50 text-[#e8b84b]'
                : 'bg-[#161d30] border-[#1e2a45] text-gray-400 hover:text-gray-200'
            }`}
          >
            {voiceOn ? '🔊 Đọc: Bật' : '🔇 Đọc: Tắt'}
          </button>
        </div>

        <div className="relative">
          {/* Vòng tròn lan tỏa sáng nhấp nháy theo âm lượng giọng nói thực tế (VAD RMS) kiểu ChatGPT Voice */}
          {state !== 'idle' && (
            <div 
              ref={volumeVisualRef}
              className="absolute inset-0 rounded-full transition-transform duration-75 pointer-events-none z-0"
              style={{ transform: 'scale(1)', backgroundColor: 'rgba(239, 68, 68, 0.2)', willChange: 'transform' }}
            />
          )}
          <button
            onClick={toggleMic}
            className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl shadow-xl transition-all duration-300 relative z-10 ${
              state !== 'idle'
                ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20'
                : 'bg-[#e8b84b] hover:bg-[#c49a2a] shadow-[#e8b84b]/30 text-gray-900'
            }`}
          >
            {state !== 'idle' ? '⏹️' : '🎤'}
          </button>
        </div>

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
          will-change: transform, opacity;
        }
        .animate-fade-in {
          animation: fadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          will-change: opacity;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-fade-in-up, .animate-fade-in, .animate-scale-up, .animate-slide-up, .animate-bounce-slow {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
          }
        }
        .animate-scale-up {
          animation: scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-sound-wave {
          animation: wave 0.9s ease-in-out infinite;
          will-change: height;
        }
        /* Nền trang: tối sang, hơi ngả navy/charcoal như ảnh bokeh */
        .slide-page-bg {
          background:
            radial-gradient(120% 80% at 50% 0%, #14161f 0%, #0b0c12 45%, #06070b 100%);
        }
        /* Khung slide: gradient charcoal đậm + ánh sáng nhẹ ở góc */
        .slide-stage {
          background:
            radial-gradient(90% 120% at 15% 10%, rgba(40,44,60,0.55) 0%, transparent 55%),
            radial-gradient(80% 100% at 100% 100%, rgba(60,50,80,0.30) 0%, transparent 60%),
            linear-gradient(140deg, #101218 0%, #0a0b10 50%, #0c0d14 100%);
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
