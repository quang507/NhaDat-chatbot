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

  // Tăng mỗi lần có slide mới -> ép remount để animation vào lại mượt (kể cả khi chỉ đổi nội dung)
  const [slideKey, setSlideKey] = useState(0);
  const toggleMicRef = useRef<() => void>(() => {});
  const volumeVisualRef = useRef<HTMLDivElement>(null);

  // ===== Phát hiện hướng ảnh (ngang/dọc) qua naturalWidth/naturalHeight sau khi load =====
  // Layout tự chọn cách xếp (cột / hàng / nổi bật) theo SỐ ẢNH + HƯỚNG từng ảnh,
  // thay cho slideshow xoay theo giờ trước đây (slide chỉ đổi khi ĐỔI CHỦ ĐỀ qua intent).
  const [imgOrient, setImgOrient] = useState<Record<string, 'landscape' | 'portrait'>>({});

  const collectImages = (s: SlideData | null): string[] => {
    if (!s) return [];
    const imgs: string[] = [];
    if (s.image_urls && Array.isArray(s.image_urls)) imgs.push(...s.image_urls.filter(Boolean));
    else if (s.image_url) imgs.push(s.image_url);
    return imgs.filter(img => !brokenImages[img]).slice(0, 3);
  };

  useEffect(() => {
    const imgs = collectImages(slide);
    imgs.forEach(src => {
      if (imgOrient[src]) return;
      const im = new window.Image();
      im.onload = () => setImgOrient(prev => (prev[src] ? prev : { ...prev, [src]: im.naturalWidth >= im.naturalHeight ? 'landscape' : 'portrait' }));
      im.onerror = () => setBrokenImages(prev => ({ ...prev, [src]: true }));
      im.src = src;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // ===== GIAO DIỆN EDITORIAL DỌC — thiết kế cho màn 85 inch đặt portrait =====
  // Style: poster tuyển dụng (headline 2 tông, chấm bi, vòng tròn, badge góc) đổi sang
  // tông xanh lá mạ, nền giấy sáng, sạch kiểu editorial khớp kiến trúc showroom.

  const SLOGAN = 'Sống đẹp hơn chung cư — Sinh lời hơn thổ cư';

  // Tách đoạn thành từng câu để animate từng dòng (không dùng lookbehind — Safari cũ crash)
  const toLines = (t: string): string[] =>
    (t || '').replace(/\s+/g, ' ').match(/[^.!?…]+[.!?…]?/g)?.map(s => s.trim()).filter(Boolean) || [];

  // Tách title thành 2 tông màu kiểu poster "WE ARE / HIRING"
  const splitTitle = (t: string): [string, string] => {
    const w = (t || '').trim().split(/\s+/);
    if (w.length <= 2) return [w.join(' '), ''];
    const cut = Math.ceil(w.length / 2);
    return [w.slice(0, cut).join(' '), w.slice(cut).join(' ')];
  };

  // 1 dòng chữ trượt từ dưới lên trong "mặt nạ" (overflow hidden), lóe sáng nhẹ rồi mờ dần
  const Line = ({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) => (
    <span className="line-mask block">
      <span className={`line-in block ${className}`} style={{ animationDelay: `${delay}ms` }}>{children}</span>
    </span>
  );

  // ===== KHỐI ẢNH: layout tự chọn theo SỐ ẢNH + HƯỚNG (ngang/dọc) từng ảnh =====
  // Ảnh luôn object-contain (không crop), vào tuần tự: ảnh 1 hiện trước, ảnh sau trượt vào.
  const renderImages = () => {
    const imgs = collectImages(slide);
    if (imgs.length === 0) return null;
    const o = (u: string) => imgOrient[u] || 'landscape';
    const baseDelay = 550;

    const Card = ({ src, delay, className = '' }: { src: string; delay: number; className?: string }) => {
      const isMap = src.includes('vi_tri') || src.includes('18_phut');
      const qrUrl = slide?.maps_url || 'https://maps.app.goo.gl/qwf4XibyMCL9sEX6A';
      return (
        <div
          className={`img-card relative rounded-[28px] overflow-hidden bg-white border border-black/[0.06] shadow-[0_24px_60px_-24px_rgba(14,90,52,0.35)] cursor-zoom-in ${className}`}
          style={{ animationDelay: `${delay}ms` }}
          onClick={() => setSelectedImage(src)}
        >
          <img
            src={src}
            alt="Hình ảnh dự án"
            className="w-full h-full object-contain"
            onError={() => setBrokenImages(prev => ({ ...prev, [src]: true }))}
          />
          {isMap && (
            <a
              href={qrUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-3 left-3 bg-white/95 rounded-xl p-2 shadow-lg border border-black/5 flex flex-col items-center"
              onClick={e => e.stopPropagation()}
            >
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrUrl)}`} alt="QR bản đồ" className="w-16 h-16" />
              <span className="text-[9px] font-bold text-neutral-600 mt-1">Quét bản đồ</span>
            </a>
          )}
        </div>
      );
    };

    // 1 ẢNH: dọc -> khung cao ở giữa; ngang -> khung rộng full
    if (imgs.length === 1) {
      const one = imgs[0];
      return o(one) === 'portrait'
        ? <div className="flex justify-center min-h-0"><Card src={one} delay={baseDelay} className="h-[42vh] w-[74%]" /></div>
        : <Card src={one} delay={baseDelay} className="h-[30vh] w-full" />;
    }

    // 2 ẢNH
    if (imgs.length === 2) {
      const [a, b] = imgs;
      const twoP = o(a) === 'portrait' && o(b) === 'portrait';
      const twoL = o(a) === 'landscape' && o(b) === 'landscape';
      if (twoP) {
        return (
          <div className="grid grid-cols-2 gap-4 h-[38vh] min-h-0">
            <Card src={a} delay={baseDelay} className="h-full" />
            <Card src={b} delay={baseDelay + 420} className="h-full" />
          </div>
        );
      }
      if (twoL) {
        return (
          <div className="grid grid-rows-2 gap-4 h-[44vh] min-h-0">
            <Card src={a} delay={baseDelay} className="h-full min-h-0" />
            <Card src={b} delay={baseDelay + 420} className="h-full min-h-0" />
          </div>
        );
      }
      // Trộn ngang/dọc: ảnh dọc làm cột cao bên trái, ảnh ngang căn giữa bên phải
      const p = o(a) === 'portrait' ? a : b;
      const l = p === a ? b : a;
      return (
        <div className="grid grid-cols-5 gap-4 h-[40vh] min-h-0">
          <Card src={p} delay={baseDelay} className="col-span-2 h-full" />
          <div className="col-span-3 flex items-center min-h-0">
            <Card src={l} delay={baseDelay + 420} className="h-[72%] w-full" />
          </div>
        </div>
      );
    }

    // 3 ẢNH
    const [a, b, c] = imgs;
    const allP = imgs.every(u => o(u) === 'portrait');
    const allL = imgs.every(u => o(u) === 'landscape');
    if (allP) {
      return (
        <div className="grid grid-cols-3 gap-4 h-[34vh] min-h-0">
          {imgs.map((u, i) => <Card key={u} src={u} delay={baseDelay + i * 380} className="h-full" />)}
        </div>
      );
    }
    if (allL) {
      return (
        <div className="grid grid-rows-3 gap-3 h-[50vh] min-h-0">
          {imgs.map((u, i) => <Card key={u} src={u} delay={baseDelay + i * 380} className="h-full min-h-0" />)}
        </div>
      );
    }
    // Trộn: ảnh đầu nổi bật full-width, 2 ảnh còn lại hàng dưới
    return (
      <div className="flex flex-col gap-4 min-h-0">
        <Card src={a} delay={baseDelay} className="h-[26vh] w-full" />
        <div className="grid grid-cols-2 gap-4 h-[18vh]">
          <Card src={b} delay={baseDelay + 420} className="h-full" />
          <Card src={c} delay={baseDelay + 800} className="h-full" />
        </div>
      </div>
    );
  };

  // ===== THÂN SLIDE =====
  const renderSlideBody = () => {
    if (!slide) {
      // Màn chờ: poster editorial lớn
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-[2.5vh]">
          <Line delay={100}>
            <span className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[#E3F0E3] text-[#0E5A34] font-bold tracking-[0.2em] uppercase text-[clamp(11px,1.2vw,17px)]">
              Smart Showroom · Nhã Đạt
            </span>
          </Line>
          <h1 className="uppercase font-black leading-[0.95] tracking-tight">
            <Line delay={240} className="text-[#2E9E5B] text-[clamp(44px,9vw,150px)]">Ny&apos;ah</Line>
            <Line delay={400} className="text-[#161616] text-[clamp(52px,11vw,190px)]">Phú Định</Line>
          </h1>
          <Line delay={580} className="text-neutral-500 text-[clamp(15px,2vw,28px)] max-w-[78%] mx-auto leading-relaxed">
            Nói &ldquo;Hey Ny&apos;ah&rdquo; hoặc chạm nút micro — slide sẽ tự hiện theo câu chuyện của bạn.
          </Line>
        </div>
      );
    }

    const [t1, t2] = splitTitle(slide.title);
    const speechLines = toLines(slide.speech_text || '').slice(0, 4);

    return (
      <div key={slideKey} className="flex-1 min-h-0 flex flex-col gap-[2.2vh] py-1">
        {/* Kicker + headline 2 tông */}
        <div className="shrink-0">
          <Line delay={60}>
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#E3F0E3] text-[#0E5A34] font-bold tracking-[0.2em] uppercase text-[clamp(10px,1.1vw,15px)]">
              Ny&apos;ah Phú Định
            </span>
          </Line>
          <h1 className="mt-[1.2vh] uppercase font-black leading-[0.98] tracking-tight">
            <Line delay={180} className="text-[#2E9E5B] text-[clamp(30px,4.6vw,84px)]">{t1}</Line>
            {t2 && <Line delay={330} className="text-[#161616] text-[clamp(34px,5.4vw,100px)]">{t2}</Line>}
          </h1>
          {slide.highlight_number && (
            <Line delay={470} className="mt-1 font-black leading-none text-transparent text-[clamp(40px,7vw,120px)]">
              <span style={{ WebkitTextStroke: '3px #2E9E5B' }}>{slide.highlight_number}</span>
            </Line>
          )}
        </div>

        {/* Khối ảnh (không có ảnh -> bỏ qua, text chiếm trọn) */}
        {renderImages()}

        {/* Bullet points */}
        {slide.points && slide.points.length > 0 && (
          <ul className="shrink-0 space-y-[1vh]">
            {slide.points.slice(0, 5).map((p, i) => (
              <li key={i} className="line-mask">
                <span
                  className="line-in flex items-start gap-3 text-neutral-800 font-medium leading-snug text-[clamp(16px,2.1vw,32px)]"
                  style={{ animationDelay: `${1000 + i * 160}ms` }}
                >
                  <span className="mt-[0.5em] w-2.5 h-2.5 rounded-full bg-[#2E9E5B] shrink-0" />
                  <span>{p}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Lời thoại chi tiết — từng câu trượt lên lần lượt */}
        {speechLines.length > 0 && (
          <div className="mt-auto shrink-0 border-l-4 border-[#2E9E5B] pl-4 pb-1">
            {speechLines.map((ln, i) => (
              <Line key={i} delay={1350 + i * 200} className="text-neutral-500 italic font-light leading-relaxed text-[clamp(13px,1.6vw,24px)]">
                {ln}
              </Line>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="h-screen max-h-screen overflow-hidden flex flex-col relative text-[#161616] bg-[#F5F3EC]"
      style={{ fontFamily: "'Be Vietnam Pro', 'Inter', 'Google Sans', system-ui, sans-serif" }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .dots { background-image: radial-gradient(rgba(22,22,22,.28) 1.6px, transparent 1.6px); background-size: 16px 16px; }
        .line-mask { overflow: hidden; }
        .line-in {
          animation: lineUp .7s cubic-bezier(.22,1,.36,1) both, glowFade 1.15s ease-out both;
          will-change: transform, opacity;
        }
        @keyframes lineUp {
          0% { transform: translateY(112%); opacity: 0; }
          55% { opacity: 1; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes glowFade {
          0% { text-shadow: 0 0 16px rgba(255,255,255,.95), 0 4px 28px rgba(46,158,91,.45); }
          100% { text-shadow: 0 0 0 rgba(255,255,255,0), 0 0 0 rgba(46,158,91,0); }
        }
        .img-card { animation: imgIn .85s cubic-bezier(.22,1,.36,1) both; will-change: transform, opacity; }
        @keyframes imgIn {
          0% { opacity: 0; transform: translateY(26px) scale(.965); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .marquee-track { animation: marquee 26s linear infinite; }
        @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes wave { 0%,100% { height: 30%; } 50% { height: 100%; } }
        .animate-sound-wave { animation: wave .9s ease-in-out infinite; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in { animation: fadeIn .4s ease-out both; }
        @keyframes scaleUp { from { transform: scale(.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .animate-scale-up { animation: scaleUp .3s cubic-bezier(.22,1,.36,1) both; }
        @media (prefers-reduced-motion: reduce) {
          .line-in, .img-card, .marquee-track, .animate-sound-wave {
            animation-duration: .01ms !important;
            animation-iteration-count: 1 !important;
          }
        }
      ` }} />

      {/* Trang trí editorial: chấm bi + vòng tròn (không bắt sự kiện chuột) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="dots absolute top-[8%] right-[5%] w-44 h-28 opacity-70" />
        <div className="dots absolute top-[46%] left-[3%] w-28 h-44 opacity-60" />
        <div className="absolute -top-[10vh] -left-[10vh] w-[26vw] h-[26vw] rounded-full bg-[#E3F0E3]" />
        <div className="absolute top-[17%] -right-16 w-[18vw] h-[18vw] rounded-full border-[3px] border-[#2E9E5B]/20" />
        <div className="absolute bottom-[15%] -left-10 w-[12vw] h-[12vw] rounded-full border-2 border-[#2E9E5B]/15" />
      </div>

      {/* Header: badge logo + tên | trạng thái + điều hướng */}
      <header className="relative z-10 px-[5vw] pt-[2vh] pb-[1vh] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 rounded-2xl overflow-hidden bg-white shadow-md border border-black/5 flex items-center justify-center shrink-0">
            <img src="/logo.svg" alt="Nhã Đạt" className="w-[82%] h-[82%] object-contain" />
          </span>
          <div>
            <p className="font-black tracking-tight leading-none text-[clamp(15px,1.6vw,26px)]">NY&apos;AH PHÚ ĐỊNH</p>
            <p className="text-neutral-500 font-semibold tracking-[0.22em] uppercase mt-1 text-[clamp(9px,0.9vw,13px)]">A development by Nhã Đạt</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`px-4 py-2 rounded-full font-bold uppercase tracking-wide flex items-center gap-2 border text-[clamp(10px,1vw,15px)] ${
            state === 'listening' ? 'bg-[#E3F0E3] text-[#0E5A34] border-[#2E9E5B]/30'
            : state === 'processing' ? 'bg-amber-50 text-amber-700 border-amber-200'
            : state === 'speaking' ? 'bg-[#2E9E5B] text-white border-[#2E9E5B]'
            : 'bg-white text-neutral-400 border-black/10'
          }`}>
            {state === 'listening' && (
              <span className="flex items-end gap-0.5 h-3" aria-hidden>
                <span className="w-0.5 bg-[#0E5A34] rounded-full animate-sound-wave" style={{ height: '40%', animationDelay: '0ms' }} />
                <span className="w-0.5 bg-[#0E5A34] rounded-full animate-sound-wave" style={{ height: '100%', animationDelay: '150ms' }} />
                <span className="w-0.5 bg-[#0E5A34] rounded-full animate-sound-wave" style={{ height: '60%', animationDelay: '300ms' }} />
              </span>
            )}
            {state === 'idle' && 'Đang chờ'}
            {state === 'listening' && 'Đang nghe'}
            {state === 'processing' && 'Đang suy nghĩ…'}
            {state === 'speaking' && 'Đang trả lời'}
          </div>
          <Link
            href="/voice"
            title="Chuyển sang đàm thoại giọng nói"
            className="w-10 h-10 hidden sm:flex items-center justify-center rounded-full bg-white border border-black/10 text-neutral-500 hover:text-[#0E5A34] hover:border-[#2E9E5B]/40 transition"
          >
            🎧
          </Link>
          <Link
            href="/"
            onClick={() => { isListeningLoopActive.current = false; if (activeAudioRef.current) activeAudioRef.current.pause(); stopAmbientListening(); teardownVAD(); }}
            title="Thoát về trang chủ"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-black/10 text-neutral-500 hover:text-red-500 hover:border-red-300 transition"
          >
            ✕
          </Link>
        </div>
      </header>

      {/* Nội dung slide */}
      <main className="relative z-10 flex-1 min-h-0 px-[5vw] flex flex-col">
        {renderSlideBody()}
      </main>

      {/* Marquee slogan CTA */}
      <div className="relative z-10 shrink-0 overflow-hidden bg-[#0E5A34] py-[1.1vh]">
        <div className="marquee-track flex w-max items-center gap-12 whitespace-nowrap font-black uppercase tracking-wider text-[#F5F3EC] text-[clamp(14px,1.9vw,30px)]">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="flex items-center gap-12">
              <span>{SLOGAN}</span>
              <span className="w-2.5 h-2.5 rounded-full bg-[#A8D94A] inline-block" />
            </span>
          ))}
        </div>
      </div>

      {/* Điều khiển: transcript + toggle đọc + micro */}
      <footer className="relative z-10 px-[4vw] py-[1.2vh] flex items-center justify-center gap-3 shrink-0">
        <div className={`flex-1 max-w-[46vw] min-w-0 flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-2xl bg-white border font-medium text-neutral-600 transition-colors text-[clamp(11px,1.2vw,17px)] ${
          state === 'listening' ? 'border-[#2E9E5B]/50' : state === 'processing' ? 'border-amber-300' : 'border-black/10'
        }`}>
          {state === 'listening' && (
            <span className="flex items-end gap-0.5 h-4 shrink-0" aria-hidden>
              <span className="w-0.5 bg-[#2E9E5B] rounded-full animate-sound-wave" style={{ height: '40%', animationDelay: '0ms' }} />
              <span className="w-0.5 bg-[#2E9E5B] rounded-full animate-sound-wave" style={{ height: '100%', animationDelay: '150ms' }} />
              <span className="w-0.5 bg-[#2E9E5B] rounded-full animate-sound-wave" style={{ height: '60%', animationDelay: '300ms' }} />
            </span>
          )}
          {state === 'processing' && (
            <span className="w-3.5 h-3.5 shrink-0 border-2 border-amber-400/40 border-t-amber-500 rounded-full animate-spin" aria-hidden />
          )}
          <span className="truncate">{transcript}</span>
        </div>

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
          className={`px-4 py-2.5 rounded-full font-semibold border transition-all flex items-center gap-1.5 text-[clamp(11px,1.1vw,16px)] ${
            voiceOn
              ? 'bg-[#E3F0E3] border-[#2E9E5B]/50 text-[#0E5A34]'
              : 'bg-white border-black/10 text-neutral-400 hover:text-neutral-600'
          }`}
        >
          {voiceOn ? '🔊 Đọc: Bật' : '🔇 Đọc: Tắt'}
        </button>

        <div className="relative">
          {/* Vòng lan tỏa theo âm lượng thật (VAD RMS) */}
          {state !== 'idle' && (
            <div
              ref={volumeVisualRef}
              className="absolute inset-0 rounded-full transition-transform duration-75 pointer-events-none z-0"
              style={{ transform: 'scale(1)', backgroundColor: 'rgba(46,158,91,0.18)', willChange: 'transform' }}
            />
          )}
          <button
            onClick={toggleMic}
            className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl shadow-xl transition-all duration-300 relative z-10 ${
              state !== 'idle'
                ? 'bg-red-500 hover:bg-red-600 shadow-red-500/25 text-white'
                : 'bg-[#2E9E5B] hover:bg-[#0E5A34] shadow-[#2E9E5B]/30 text-white'
            }`}
          >
            {state !== 'idle' ? '⏹️' : '🎤'}
          </button>
        </div>
      </footer>

      {/* Lightbox phóng to ảnh */}
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
            className="max-w-[95vw] max-h-[90vh] object-contain rounded-xl shadow-2xl animate-scale-up"
          />
        </div>
      )}
    </div>
  );
}
