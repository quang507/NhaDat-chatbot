"use client";

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { splitCleanSentences, ttsUrl } from '@/lib/speech';
import { classifyAmbientIntent } from '@/lib/intent';

function normalizeVietnameseSpeech(text: string): string {
  if (!text) return '';
  let clean = text.toLowerCase();
  
  // Khắc phục lỗi trình duyệt và AI nghe nhầm tên dự án/thương hiệu Nhã Đạt
  clean = clean.replace(/\bphố đêm\b/g, 'phú định');
  clean = clean.replace(/\bphố định\b/g, 'phú định');
  clean = clean.replace(/\bphú định\b/g, 'phú định');
  clean = clean.replace(/\bcốt mô\b/g, 'cosmo');
  clean = clean.replace(/\bcốt-mô\b/g, 'cosmo');
  clean = clean.replace(/\bô pút\b/g, 'opus');
  clean = clean.replace(/\bô-pút\b/g, 'opus');
  clean = clean.replace(/\bphiu giần\b/g, 'fusion');
  clean = clean.replace(/\bphiu dân\b/g, 'fusion');
  
  return clean;
}

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
  const [ambientMode, setAmbientMode] = useState(true); // mặc định BẬT nghe ngầm ngay khi vào trang
  const [voiceOn, setVoiceOn] = useState(true);

  const recognitionRef = useRef<any>(null);
  const isListeningLoopActive = useRef(false);
  const stateRef = useRef<SlideState>('idle');
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<HTMLAudioElement[]>([]);
  const isPlayingRef = useRef(false);
  const nextSentenceTimeoutRef = useRef<any>(null);

  // Refs cho ambient (đọc trong callback STT đã set 1 lần lúc mount)
  const ambientRef = useRef(false);
  const voiceOnRef = useRef(true);
  const bufferRef = useRef('');            // gom lời nói gần đây
  const debounceRef = useRef<any>(null);   // hẹn giờ sau khi ngừng nói
  const lastGenRef = useRef(0);            // mốc lần tạo slide gần nhất (cooldown)
  const lastQueryRef = useRef('');         // query lần trước (tránh lặp)
  const suppressListenRef = useRef(false); // đang đọc to -> tạm ngắt nghe
  const isGeneratingRef = useRef(false);   // đang gọi API slide -> bỏ qua ambient trigger mới
  const activeTopicRef = useRef<{topic: string, expiry: number} | null>(null);
  const shortContextRef = useRef<string[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const instantFiredRef = useRef(false);   // đã bắn slide tức thì cho câu đang nói chưa
  const lastInstantRef = useRef(0);        // mốc lần bắn slide tức thì gần nhất
  const lastActivityRef = useRef(0);       // mốc hoạt động gần nhất của STT (onstart/onresult/audio) -> watchdog
  const watchdogRef = useRef<any>(null);   // timer kiểm tra STT "chết câm" để khởi động lại
  const autoStartGestureRef = useRef<(() => void) | null>(null); // handler auto-start ở cử chỉ đầu tiên
  const INSTANT_COOLDOWN_MS = 3000;        // tối thiểu 3s giữa 2 lần bắn tức thì
  const AMBIENT_DEBOUNCE_MS = 600;        // ngừng nói 0.6s mới xét tạo slide -> Rất nhanh!
  const AMBIENT_COOLDOWN_MS = 2000;        // tối thiểu 2s giữa 2 slide (đã giảm từ 5s)

  useEffect(() => { ambientRef.current = ambientMode; }, [ambientMode]);
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

  // Tốc độ đọc slide (đọc nhanh hơn bình thường cho đỡ lê thê)
  const SLIDE_TTS_RATE = '+22%';

  // Barge-in (nói chèn lúc đang đọc) — VAD trên stream có khử vọng, giống trang /voice
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const vadRafRef = useRef<number | null>(null);
  const speakStartRef = useRef<number>(0);
  const VAD_THRESHOLD = 0.06;
  const VAD_FRAMES = 6;
  const SPEAK_GRACE_MS = 400;

  // ===== ENGINE NGHE NGẦM dùng Whisper (Groq) thay cho Web Speech API =====
  // Lý do: Web Speech API (Chrome) hay "chết câm" sau abort/restart, lại phụ thuộc mic
  // mặc định + server Google (Brave chặn). Engine này dùng MediaRecorder trên đúng mic
  // Chrome đã cấp, tự cắt câu theo độ lớn âm thanh (VAD) rồi gửi /api/transcribe.
  const amStreamRef = useRef<MediaStream | null>(null);
  const amCtxRef = useRef<AudioContext | null>(null);
  const amRafRef = useRef<number | null>(null);
  const amRecorderRef = useRef<MediaRecorder | null>(null);
  const amChunksRef = useRef<Blob[]>([]);
  const amRecordingRef = useRef(false);
  const amSilenceStartRef = useRef(0);
  const amSpeechStartRef = useRef(0);
  const amEngineOnRef = useRef(false);   // ý định: nghe ngầm ĐANG bật
  const amRunningRef = useRef(false);    // Web Speech instance đang chạy thật sự
  const firstGestureRef = useRef(false); // đã ép restart bằng cử chỉ đầu tiên chưa
  const useWhisperAmbientRef = useRef(true); // Mặc định sử dụng công cụ Whisper/Gemini siêu chính xác thay cho Web Speech nội bộ dễ lỗi
  const wsActivityRef = useRef(0);       // mốc Web Speech có hoạt động gần nhất (audio/speech/result)
  const wsWatchdogRef = useRef<any>(null); // timer kiểm Web Speech "chết câm" để rớt sang Whisper
  const AM_THRESHOLD = 0.060;     // ngưỡng RMS coi là có người nói (cao để im lặng/nhiễu không kích hoạt)
  const AM_START_FRAMES = 3;      // phải đủ 3 frame liên tiếp đủ to mới bắt đầu thu (chống blip nhiễu)
  const AM_SILENCE_MS = 650;      // im lặng 0.65s (nhạy bén hơn) -> chốt 1 câu, gửi phiên âm
  const AM_MIN_SPEECH_MS = 500;   // câu < 0.5s -> bỏ (nhiễu)
  const AM_MAX_SPEECH_TIMEOUT_MS = 8000; // ghi âm tối đa 8s tự động cắt để gửi phiên âm

  // Whisper tiếng Việt hay "ảo giác" câu outro YouTube khi thu phải im lặng/nhiễu -> chặn.
  const WHISPER_HALLUCINATIONS = [
    'ghiền mì gõ', 'hãy subscribe', 'đăng ký kênh', 'cảm ơn các bạn đã theo dõi',
    'cảm ơn đã theo dõi', 'hẹn gặp lại các bạn', 'trong video tiếp theo', 'like và đăng ký',
    'đừng quên like', 'bỏ lỡ những video', 'cảm ơn các bạn đã xem', 'phụ đề', 'subscribe',
  ];
  const isHallucination = (t: string) => {
    const low = t.toLowerCase();
    return WHISPER_HALLUCINATIONS.some(h => low.includes(h));
  };

  // Sync state to ref for callbacks
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

      // NGHE NGẦM mặc định BẬT — Web Speech (instance tạo on-demand trong startAmbientListening).
      ambientRef.current = true;
      isListeningLoopActive.current = true;
      // Thử bật ngay (nếu mic đã cấp quyền từ trước). Trình duyệt thường cần 1 cử chỉ để cấp mic
      // -> cử chỉ ĐẦU TIÊN ép tạo lại instance mới (instance auto-start trước cử chỉ hay chết câm).
      startAmbientListening();
      autoStartGestureRef.current = () => {
        if (!isListeningLoopActive.current || !ambientRef.current) return;
        if (useWhisperAmbientRef.current) {
          startWhisperAmbient(); // Đã rớt sang Whisper, đảm bảo Whisper đang chạy
          return;
        }
        if (!firstGestureRef.current) {
          firstGestureRef.current = true;
          try { recognitionRef.current?.abort(); } catch (e) {}
          amRunningRef.current = false;
          setTimeout(() => { if (amEngineOnRef.current) restartAmbientRecognition(); }, 200);
        } else if (!amRunningRef.current) {
          startAmbientListening();
        }
      };
      window.addEventListener('pointerdown', autoStartGestureRef.current);
      window.addEventListener('keydown', autoStartGestureRef.current);
    }

    return () => {
      if (typeof window !== 'undefined' && handleKeyDown) {
        window.removeEventListener('keydown', handleKeyDown);
      }
      isListeningLoopActive.current = false;
      if (autoStartGestureRef.current) {
        window.removeEventListener('pointerdown', autoStartGestureRef.current);
        window.removeEventListener('keydown', autoStartGestureRef.current);
      }
      if (watchdogRef.current) clearInterval(watchdogRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (activeAudioRef.current) activeAudioRef.current.pause();
      audioQueueRef.current = [];
      isPlayingRef.current = false;
      if (recognitionRef.current) recognitionRef.current.abort();
      stopAmbientListening();
      teardownVAD();
    };
  }, []);

  const handleVoiceCommands = (text: string): boolean => {
    const clean = text.toLowerCase().trim();
    
    // 1. Nhóm lệnh phóng to
    const zoomInKeywords = [
      'phóng to', 'phóng lớn', 'xem ảnh to', 'xem hình to', 
      'zoom to', 'zoom lên', 'phóng to ảnh', 'phóng to hình', 'mở to'
    ];
    if (zoomInKeywords.some(kw => clean.includes(kw))) {
      const images: string[] = [];
      if (slideRef.current?.image_urls && Array.isArray(slideRef.current.image_urls)) {
        images.push(...slideRef.current.image_urls.filter(img => img && !brokenImagesRef.current[img]));
      } else if (slideRef.current?.image_url && !brokenImagesRef.current[slideRef.current.image_url]) {
        images.push(slideRef.current.image_url);
      }
      
      if (images.length > 0) {
        setSelectedImage(images[0]);
        setTranscript('🔍 Khẩu lệnh: Phóng to hình ảnh.');
        setState('idle');
        return true;
      }
    }
    
    // 2. Nhóm lệnh thu nhỏ / đóng
    const zoomOutKeywords = [
      'thu nhỏ', 'thu nhỏ lại', 'nhỏ lại', 'nhỏ về', 
      'đóng ảnh', 'đóng hình', 'thoát ảnh', 'quay lại', 
      'đóng lại', 'tắt ảnh', 'tắt hình', 'zoom nhỏ', 'nhỏ đi'
    ];
    if (zoomOutKeywords.some(kw => clean.includes(kw))) {
      setSelectedImage(null);
      setTranscript('🔍 Khẩu lệnh: Thu nhỏ hình ảnh.');
      setState('idle');
      return true;
    }
    
    return false;
  };

  const startWhisperRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream, { audioBitsPerSecond: 24000 });
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
        await transcribeAndProcess(audioBlob);
      };
      
      mediaRecorder.start();
      setState('listening');
      setTranscript('🎤 Đang ghi âm giọng nói... Bấm nút Đỏ để gửi.');
    } catch (err) {
      console.error(err);
      setTranscript('Không thể truy cập Micro. Vui lòng kiểm tra quyền.');
      setState('idle');
    }
  };

  const transcribeAndProcess = async (blob: Blob) => {
    setState('processing');
    setTranscript('⚡ Đang xử lý giọng nói...');
    try {
      const formData = new FormData();
      formData.append('file', blob, 'audio.webm');

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData
      });
      
      if (!res.ok) throw new Error('Lỗi API');
      const data = await res.json();
      const text = normalizeVietnameseSpeech(data.text || '');
      
      if (handleVoiceCommands(text)) {
        return;
      }

      if (text && text.trim()) {
        setTranscript(`Bạn nói: "${text}"`);
        fetchSlideData(text, false);
      } else {
        setTranscript('Không nghe rõ lời bạn nói, vui lòng thử lại.');
        setState('idle');
      }
    } catch (err) {
      setTranscript('Không nhận diện được giọng nói. Thử lại sau.');
      setState('idle');
    }
  };

  const toggleMic = () => {
    if (state === 'listening' || state === 'processing' || state === 'speaking') {
      isListeningLoopActive.current = false;
      suppressListenRef.current = false;
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
      if (activeAudioRef.current) activeAudioRef.current.pause();
      audioQueueRef.current = [];
      isPlayingRef.current = false;
      
      stopAmbientListening();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      } else {
        teardownVAD();
        setState('idle');
        setTranscript('Đã dừng. Nhấn nút Micro để bắt đầu lại.');
      }
    } else {
      isListeningLoopActive.current = true;
      suppressListenRef.current = false;
      bufferRef.current = '';
      lastQueryRef.current = '';
      lastGenRef.current = 0;
      if (activeAudioRef.current) activeAudioRef.current.pause();

      if (ambientMode) {
        startAmbientListening();
      } else {
        startWhisperRecording();
      }
    }
  };

  useEffect(() => { toggleMicRef.current = toggleMic; }, [toggleMic]);

  // Cắt lời khi đang đọc -> dừng audio + chuyển sang nghe (giống ChatGPT Voice)
  const bargeIn = () => {
    if (stateRef.current !== 'speaking') return;
    if (nextSentenceTimeoutRef.current) {
      clearTimeout(nextSentenceTimeoutRef.current);
      nextSentenceTimeoutRef.current = null;
    }
    if (activeAudioRef.current) {
      try {
        activeAudioRef.current.onended = null;
        activeAudioRef.current.onerror = null;
        activeAudioRef.current.pause();
      } catch (e) {}
      activeAudioRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    teardownVAD();
    suppressListenRef.current = false;

    if (ambientRef.current) {
      startAmbientListening(); // engine vẫn chạy, chỉ mở lại thu (suppress đã tắt)
    } else {
      startWhisperRecording();
    }
  };

  // Bắn slide TỨC THÌ khi nghe thấy từ khóa (đang nói dở, chưa hết câu).
  // Sau khi hết câu, logic debounce (maybeGenerateAmbient) vẫn chạy để ra slide hoàn chỉnh tiếp theo.
  const maybeInstantTrigger = (interim: string) => {
    if (instantFiredRef.current) return;          // câu này đã bắn 1 lần rồi
    if (isGeneratingRef.current) return;          // đang tạo slide -> chờ
    const now = Date.now();
    if (now - lastInstantRef.current < INSTANT_COOLDOWN_MS) return;
    
    const intent = classifyAmbientIntent(interim);
    if (!intent.shouldGenerate || intent.reason === 'too_short' || intent.reason === 'filler') return;
    
    // Kiểm tra xem topic này có bị trùng lặp không (chống spam)
    const isSpam = intent.topic && activeTopicRef.current && activeTopicRef.current.topic === intent.topic && now < activeTopicRef.current.expiry && intent.reason !== 'explicit_slide_request';
    if (isSpam) return;

    instantFiredRef.current = true;
    lastInstantRef.current = now;
    lastQueryRef.current = interim;
    fetchSlideData(normalizeVietnameseSpeech(interim), true);
  };

  // ===== NGHE NGẦM (AMBIENT) =====
  // Gom lời nói, có 2 logic kích hoạt:
  // 1. Kích hoạt NGAY LẬP TỨC nếu có từ khóa rõ ràng (explicit request hoặc keyword dự án mạnh)
  // 2. Chờ nghe hết câu (ngừng 0.6s) rồi mới xét tạo slide
  const handleAmbientSpeech = (text: string) => {
    const words = (bufferRef.current + ' ' + text).trim().split(/\s+/);
    const fullText = words.slice(-45).join(' '); // giữ ~45 từ gần nhất
    bufferRef.current = fullText;
    setTranscript('🎧 Đang nghe: …' + fullText.slice(-90));

    // Logic 1: Kích hoạt ngay lập tức nếu từ khóa mạnh
    if (!isGeneratingRef.current && ambientRef.current && isListeningLoopActive.current) {
      const intent = classifyAmbientIntent(fullText);
      // Nếu là explicit request (vd: "mở slide", "cho xem") hoặc đã bắt được topic
      if (intent.shouldGenerate && (intent.reason === 'explicit_slide_request' || intent.reason === 'has_project_topic')) {
        // Kiểm tra xem topic này có bị trùng lặp không (chống spam liên tục cùng 1 topic khi đang nói dở)
        const now = Date.now();
        const isSpam = intent.topic && activeTopicRef.current && activeTopicRef.current.topic === intent.topic && now < activeTopicRef.current.expiry && intent.reason !== 'explicit_slide_request';
        
        if (!isSpam) {
          console.log('[Ambient] Bắt được từ khóa mạnh -> Kích hoạt NGAY LẬP TỨC (không chờ hết câu):', intent.topic);
          if (debounceRef.current) clearTimeout(debounceRef.current);
          maybeGenerateAmbient(); // Trigger ngay!
          return;
        }
      }
    }

    // Logic 2: Chờ hết câu (ngừng nói 0.6s)
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(maybeGenerateAmbient, AMBIENT_DEBOUNCE_MS);
  };

  const maybeGenerateAmbient = () => {
    instantFiredRef.current = false; // Reset cờ bắn tức thì cho câu tiếp theo
    if (!ambientRef.current || !isListeningLoopActive.current) return;
    if (isGeneratingRef.current) return;

    const query = bufferRef.current.trim();
    if (!query) return;

    const intent = classifyAmbientIntent(query);
    
    // Nếu chỉ là filler hoặc quá ngắn -> Bỏ qua, clear buffer để không dồn ứ filler
    if (!intent.shouldGenerate) {
       if (intent.reason === 'filler' || intent.reason === 'too_short') {
          bufferRef.current = ''; 
       }
       return;
    }

    const now = Date.now();
    const isNewTopic = intent.topic && activeTopicRef.current && activeTopicRef.current.topic !== intent.topic;
    const wait = AMBIENT_COOLDOWN_MS - (now - lastGenRef.current);
    if (wait > 0 && intent.reason !== 'explicit_slide_request' && !isNewTopic) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(maybeGenerateAmbient, wait);
      return;
    }

    // Kiểm tra Topic trùng lặp (nếu user vẫn đang nói về chủ đề cũ, không cần đổi slide liên tục)
    if (intent.topic && activeTopicRef.current) {
      if (activeTopicRef.current.topic === intent.topic && now < activeTopicRef.current.expiry && intent.reason !== 'explicit_slide_request') {
        console.log('[Ambient] Bỏ qua: cùng chủ đề đang nói:', intent.topic);
        bufferRef.current = ''; // Đã xử lý xong intent này, clear buffer
        activeTopicRef.current.expiry = now + 45000; // Gia hạn TTL
        return;
      }
    }

    // Chấp nhận tạo slide mới!
    setTranscript('💡 Chuẩn bị slide...');
    if (intent.topic) {
       activeTopicRef.current = { topic: intent.topic, expiry: now + 45000 };
    }
    
    // Cập nhật rolling context
    shortContextRef.current.push(query);
    if (shortContextRef.current.length > 3) shortContextRef.current.shift();
    const fullQuery = shortContextRef.current.join('. ');

    lastQueryRef.current = fullQuery;
    bufferRef.current = ''; // Clear buffer ngay
    
    fetchSlideData(fullQuery, true);
  };

  // VAD: phát hiện người dùng nói lúc AI đang đọc (stream khử vọng + đo RMS)
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
        // Cập nhật vòng sáng VAD thời gian thực
        if (volumeVisualRef.current) {
          const scale = 1 + Math.min(rms * 5, 2.0);
          volumeVisualRef.current.style.transform = `scale(${scale})`;
          volumeVisualRef.current.style.backgroundColor = rms > 0.01 ? 'rgba(232, 184, 75, 0.25)' : 'rgba(239, 68, 68, 0.15)';
        }

        if (stateRef.current === 'speaking' && Date.now() - speakStartRef.current > SPEAK_GRACE_MS) {
          if (rms > VAD_THRESHOLD) loudFrames++; else loudFrames = Math.max(0, loudFrames - 1);
          if (loudFrames >= VAD_FRAMES) { loudFrames = 0; bargeIn(); }
        } else {
          loudFrames = 0;
        }
      };
      tick();
    } catch (e) {
      // Không bật được VAD thì vẫn dùng bình thường (chỉ là không cắt lời bằng giọng được)
    }
  };

  const teardownVAD = () => {
    if (vadRafRef.current != null) { cancelAnimationFrame(vadRafRef.current); vadRafRef.current = null; }
    if (mediaStreamRef.current) { try { mediaStreamRef.current.getTracks().forEach(t => t.stop()); } catch (e) {} mediaStreamRef.current = null; }
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch (e) {} audioCtxRef.current = null; }
  };

  // Phiên âm 1 đoạn (utterance) bằng Whisper rồi đẩy vào luồng nghe ngầm.
  const transcribeAmbientSegment = async (blob: Blob) => {
    if (blob.size < 1400) return; // quá nhỏ -> bỏ
    try {
      setTranscript('⚡ Đang xử lý âm thanh...');
      const fd = new FormData();
      fd.append('file', blob, 'audio.webm');
      const res = await fetch('/api/transcribe', { method: 'POST', body: fd });
      if (!res.ok) {
        console.error('[Ambient] Transcribe API error:', res.status, await res.text());
        setTranscript('🎙️ Đang lắng nghe bạn...');
        return;
      }
      const data = await res.json();
      const text = normalizeVietnameseSpeech((data.text || '').trim());
      if (!text || text.replace(/[^a-zà-ỹ0-9]/gi, '').length < 2) {
        setTranscript('🎙️ Đang lắng nghe bạn...');
        return;
      }
      if (isHallucination(text)) { 
        console.log('[Ambient] Bỏ câu Whisper bịa:', text); 
        setTranscript('🎙️ Đang lắng nghe bạn...');
        return; 
      }
      if (handleVoiceCommands(text)) return;
      setTranscript(`🎧 Nhận diện: "${text.slice(-80)}"`);
      // Whisper trả nguyên câu hoàn chỉnh -> đưa vào handleAmbientSpeech;
      // nó tự xét kích hoạt tức thì (Logic 1) + debounce (Logic 2). KHÔNG gọi maybeInstantTrigger
      // ở đây nữa để tránh bắn slide 2 lần cho cùng 1 câu.
      handleAmbientSpeech(text);
    } catch (e) {
      console.error('[Ambient] Transcribe exception:', e);
    }
  };

  // ===== NGHE NGẦM = Web Speech API (chữ chạy LIVE từng từ + bắt từ khóa tức thì) =====
  // Bài học từ lần trước: KHÔNG tái dùng 1 instance qua abort/restart (sẽ "chết câm").
  // Mỗi lần (re)start -> tạo instance MỚI hoàn toàn.
  const buildRecognition = (): any => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return null;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;   // hiện chữ NGAY khi đang nói (animation chạy chữ)
    rec.lang = 'vi-VN';

    rec.onstart = () => {
      amRunningRef.current = true;
      wsActivityRef.current = Date.now();
      setState('listening');
      setTranscript('🎧 Đang nghe ngầm…');
    };
    rec.onaudiostart = () => {};
    rec.onspeechstart = () => {};

    rec.onresult = (event: any) => {
      wsActivityRef.current = Date.now();
      let interim = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      // Đang nói (chưa chốt câu) -> hiện chữ live + bắt từ khóa bật slide LIỀN
      if (interim && !finalText) {
        setTranscript('🎧 Đang nghe: …' + interim.trim().slice(-90));
        maybeInstantTrigger(interim);
        return;
      }
      if (!finalText) return;
      instantFiredRef.current = false; // hết câu -> câu sau lại được bắn tức thì
      const text = normalizeVietnameseSpeech(finalText);
      if (handleVoiceCommands(text)) return;
      handleAmbientSpeech(text);
    };

    rec.onerror = (event: any) => {
      // Web Speech bị chặn/lỗi dịch vụ (mạng công ty chặn server Google là phổ biến) -> rớt sang Whisper.
      if (event.error === 'network' || event.error === 'service-not-allowed' || event.error === 'audio-capture') {
        fallbackToWhisper(`Web Speech lỗi (${event.error})`);
      } else if (event.error === 'not-allowed') {
        amEngineOnRef.current = false;
        amRunningRef.current = false;
        setState('idle');
        setTranscript('Vui lòng cấp quyền micro cho trang rồi bấm nút mic.');
      }
      // no-speech/aborted: để onend tự tạo instance mới chạy tiếp
    };

    rec.onend = () => {
      amRunningRef.current = false;
      if (!amEngineOnRef.current) return;          // đã chủ động dừng
      if (useWhisperAmbientRef.current) return;     // đã chuyển sang Whisper
      if (!isListeningLoopActive.current) return;
      if (!ambientRef.current) return;
      if (suppressListenRef.current) return;       // đang đọc to -> onSpeakDone sẽ mở lại
      restartAmbientRecognition();                 // tạo instance MỚI chạy tiếp
    };
    return rec;
  };

  const restartAmbientRecognition = () => {
    if (useWhisperAmbientRef.current) return; // Đã rớt sang Whisper, không chạy Web Speech nữa
    const rec = buildRecognition();
    if (!rec) { fallbackToWhisper('Trình duyệt không hỗ trợ Web Speech'); return; }
    recognitionRef.current = rec;
    try { rec.start(); } catch (e) { /* InvalidState: instance khác đang chạy -> bỏ */ }
    // WATCHDOG: nếu sau 6s vẫn KHÔNG có hoạt động nào (chết câm / bị chặn) -> rớt sang Whisper.
    // Tránh clear/reschedule liên tục khi crash-loop; chỉ set nếu chưa có watchdog nào đang chạy
    if (!wsWatchdogRef.current) {
      wsWatchdogRef.current = setTimeout(() => {
        wsWatchdogRef.current = null;
        if (!amEngineOnRef.current || useWhisperAmbientRef.current) return;
        if (suppressListenRef.current || stateRef.current === 'speaking') return;
        if (Date.now() - wsActivityRef.current > 5500) {
          fallbackToWhisper('Web Speech không phản hồi 6s');
        }
      }, 6000);
    }
  };

  // Bật nghe ngầm. Idempotent. Ưu tiên Web Speech; nếu đã rớt thì dùng Whisper.
  const startAmbientListening = () => {
    amEngineOnRef.current = true;
    setState('listening');
    setTranscript('🎧 Đang nghe ngầm…');
    if (useWhisperAmbientRef.current) { startWhisperAmbient(); return; }
    if (amRunningRef.current) return;
    wsActivityRef.current = Date.now();
    restartAmbientRecognition();
  };

  // Chuyển hẳn sang Whisper cho phiên này (giữ trạng thái — không thử lại Web Speech nữa).
  const fallbackToWhisper = (reason: string) => {
    if (useWhisperAmbientRef.current) return;
    console.warn('[Ambient] Rớt sang Whisper:', reason);
    useWhisperAmbientRef.current = true;
    if (wsWatchdogRef.current) { clearTimeout(wsWatchdogRef.current); wsWatchdogRef.current = null; }
    try { recognitionRef.current?.abort(); } catch (e) {}
    amRunningRef.current = false;
    if (amEngineOnRef.current && !suppressListenRef.current) startWhisperAmbient();
  };

  const stopAmbientListening = () => {
    amEngineOnRef.current = false;
    amRunningRef.current = false;
    if (wsWatchdogRef.current) { clearTimeout(wsWatchdogRef.current); wsWatchdogRef.current = null; }
    try { recognitionRef.current?.abort(); } catch (e) {}
    stopWhisperAmbient();
  };

  // ===== ENGINE WHISPER (fallback): MediaRecorder + VAD, gửi /api/transcribe =====
  const startWhisperAmbient = async () => {
    if (amEngineOnRef.current && amStreamRef.current) { setState('listening'); return; } // đang chạy
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      amStreamRef.current = stream;
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new Ctx();
      amCtxRef.current = ctx;
      try { if (ctx.state === 'suspended') ctx.resume(); } catch (e) {}
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      setState('listening');
      setTranscript('🎙️ Đang lắng nghe bạn...');

      const startSeg = () => {
        if (amRecordingRef.current) return;
        amChunksRef.current = [];
        try {
          const mr = new MediaRecorder(stream, { audioBitsPerSecond: 24000 });
          amRecorderRef.current = mr;
          mr.ondataavailable = (e) => { if (e.data.size > 0) amChunksRef.current.push(e.data); };
          mr.onstop = () => {
            amRecordingRef.current = false;
            const dur = Date.now() - amSpeechStartRef.current;
            const blob = new Blob(amChunksRef.current, { type: mr.mimeType || 'audio/webm' });
            if (dur >= AM_MIN_SPEECH_MS) transcribeAmbientSegment(blob);
          };
          mr.start();
          amRecordingRef.current = true;
          amSpeechStartRef.current = Date.now();
        } catch (e) {}
      };
      const stopSeg = () => {
        if (amRecorderRef.current && amRecorderRef.current.state !== 'inactive') {
          try { amRecorderRef.current.stop(); } catch (e) {}
        }
      };
      let startFrames = 0;
      const tick = () => {
        amRafRef.current = requestAnimationFrame(tick);
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / data.length);

        // Cập nhật vòng sáng VAD thời gian thực
        if (volumeVisualRef.current) {
          const scale = 1 + Math.min(rms * 5, 2.0);
          volumeVisualRef.current.style.transform = `scale(${scale})`;
          volumeVisualRef.current.style.backgroundColor = rms > 0.01 ? 'rgba(232, 184, 75, 0.25)' : 'rgba(239, 68, 68, 0.15)';
        }

        const speaking = rms > AM_THRESHOLD;
        if (suppressListenRef.current || stateRef.current === 'speaking') {
          if (amRecordingRef.current) stopSeg();
          startFrames = 0;
          return;
        }
        if (amRecordingRef.current && (Date.now() - amSpeechStartRef.current > AM_MAX_SPEECH_TIMEOUT_MS)) {
          stopSeg();
          startFrames = 0;
          return;
        }
        if (speaking) {
          amSilenceStartRef.current = 0;
          if (!amRecordingRef.current) { startFrames++; if (startFrames >= AM_START_FRAMES) { startFrames = 0; startSeg(); } }
        } else {
          startFrames = 0;
          if (amRecordingRef.current) {
            if (!amSilenceStartRef.current) amSilenceStartRef.current = Date.now();
            else if (Date.now() - amSilenceStartRef.current > AM_SILENCE_MS) stopSeg();
          }
        }
      };
      tick();
    } catch (e) {
      setTranscript('Không truy cập được mic. Cấp quyền mic rồi thử lại.');
    }
  };

  const stopWhisperAmbient = () => {
    if (amRafRef.current != null) { cancelAnimationFrame(amRafRef.current); amRafRef.current = null; }
    if (amRecorderRef.current && amRecorderRef.current.state !== 'inactive') {
      try { amRecorderRef.current.onstop = null; amRecorderRef.current.stop(); } catch (e) {}
    }
    amRecorderRef.current = null;
    amRecordingRef.current = false;
    if (amStreamRef.current) { try { amStreamRef.current.getTracks().forEach(t => t.stop()); } catch (e) {} amStreamRef.current = null; }
    if (amCtxRef.current) { try { amCtxRef.current.close(); } catch (e) {} amCtxRef.current = null; }
  };

  // Làm sạch + tách câu: dùng chung splitCleanSentences từ lib/speech.ts
  //   -> slide giờ đọc chuẩn y hệt trang /voice (SĐT, brand, %, tiền, Q.8, #03...)

  // Khi đọc xong toàn bộ -> quay lại nghe (hands-free) hoặc idle
  const onSpeakDone = () => {
    teardownVAD();
    suppressListenRef.current = false;
    if (isListeningLoopActive.current) {
      if (ambientRef.current) {
        startAmbientListening(); // engine vẫn chạy, mở lại thu sau khi đọc xong
      } else {
        isListeningLoopActive.current = false;
        setState('idle');
        setTranscript('Đã đọc xong. Nhấn nút Micro để nói câu tiếp theo.');
      }
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
        // Có đọc to: tạm ngắt mic khi đang đọc (tránh loa vọng vào mic), mở lại ở onSpeakDone.
        if (ambientRef.current) {
          suppressListenRef.current = true;
          try { recognitionRef.current?.abort(); } catch (e) {}
          amRunningRef.current = false;
        }
        setState('speaking');
        speakText(data.speech_text);
      } else {
        // Im lặng: chỉ hiện slide
        if (ambientRef.current) {
          setState('listening');
          setTranscript('🎧 Đang nghe ngầm…');
        } else {
          onSpeakDone();
        }
      }
    } catch (e) {
      if (ambient) { setTranscript('🎧 Đang nghe ngầm…'); return; }
      setTranscript('Xin lỗi, có lỗi xảy ra khi xử lý.');
      if (isListeningLoopActive.current && ambientRef.current) {
        setTimeout(() => { startAmbientListening(); }, 1500);
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
                className={`absolute inset-0 w-full h-full flex items-center justify-center transition-all duration-1000 ease-in-out ${
                  isActive ? 'opacity-95 scale-100 z-10' : 'opacity-0 scale-95 z-0 pointer-events-none'
                }`}
                style={{ willChange: 'opacity, transform', transform: 'translate3d(0,0,0)' }}
              >
                <img 
                  src={img} 
                  alt={`Minh họa ${idx + 1}`} 
                  className={`w-full h-full cursor-pointer transition-transform duration-500 hover:scale-[1.01] ${
                    isMap ? 'object-contain bg-[#070707]' : 'object-cover'
                  }`}
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
            </div>
          </div>
          {/* Image Section — chiếm 60%, ảnh tràn viền (không chừa khoảng) */}
          <div className="basis-[60%] shrink-0 relative flex items-stretch justify-center border-l border-white/5">
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
                onError={() => setBrokenImages(prev => ({ ...prev, [bgImg]: true }))}
              />
              <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur px-3 py-1.5 rounded-lg text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                🔍 Click để xem ảnh gốc
              </div>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent pointer-events-none"></div>
          
          <div key={slide.title} className="absolute bottom-0 left-0 w-full p-12 md:p-16 flex flex-col z-10 animate-fade-in-up">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 text-white tracking-tight drop-shadow-lg animate-slide-up">
              {slide.title}
            </h2>
            <div className="flex flex-col gap-4 max-w-3xl animate-slide-up delay-100">
              {slide.points.map((point, idx) => (
                <p key={idx} className="text-lg md:text-xl lg:text-[21px] text-gray-200 font-light drop-shadow-md border-l-4 border-[#e8b84b] pl-4">{point}</p>
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
    <div className="min-h-screen text-white overflow-hidden flex flex-col relative slide-page-bg" style={{ fontFamily: "'Google Sans', 'Product Sans', 'Be Vietnam Pro', sans-serif" }}>

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
      <header className="px-6 md:px-8 py-4 md:py-5 z-10 flex justify-between items-center border-b border-[#1e2a45] bg-[#0a0f1e]/80 backdrop-blur-md">
        {/* Brand (logo placeholder 🏠 — sẽ thay bằng logo thật) */}
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl bg-white flex items-center justify-center shadow-lg shrink-0"><img src="/logo.svg" alt="Ny'ah Phú Định" className="w-[82%] h-[82%] object-contain" /></span>
          <div>
            <h1 className="font-bold text-lg leading-tight">Ny'ah Phú Định</h1>
            <p className="text-xs text-gray-400">Trình chiếu thông minh · Nhã Đạt AI</p>
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
            onClick={() => { isListeningLoopActive.current = false; if (activeAudioRef.current) activeAudioRef.current.pause(); if (recognitionRef.current) recognitionRef.current.abort(); stopAmbientListening(); teardownVAD(); }}
            title="Thoát về trang chủ"
            className="w-9 h-9 flex items-center justify-center rounded-full bg-[#161d30] border border-[#1e2a45] text-gray-400 hover:text-white hover:border-red-500/50 transition"
          >
            ✕
          </Link>
        </div>
      </header>

      {/* Main Content Area - The Slide */}
      <main className="flex-1 z-10 flex items-center justify-center p-8">
        {slide ? (
          <div className="w-full flex items-center justify-center">
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
      <footer className="p-6 z-10 flex flex-col items-center gap-4 bg-gradient-to-t from-[#0a0f1e] to-transparent">
        <div className={`text-sm text-center font-medium bg-[#161d30]/80 backdrop-blur px-6 py-3 rounded-2xl border text-gray-300 min-w-[300px] max-w-2xl flex items-center justify-center gap-2.5 transition-colors ${
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

        {/* Toggle: Nghe ngầm + Đọc to */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const next = !ambientMode;
              setAmbientMode(next);
              ambientRef.current = next; // cập nhật ngay cho callback STT đọc đúng
              // Nếu đang trong phiên nghe -> CHUYỂN CHẾ ĐỘ NGAY, không bắt bấm lại nút đỏ
              if (isListeningLoopActive.current) {
                // dừng nguồn âm thanh của chế độ cũ
                if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                  try { mediaRecorderRef.current.onstop = null; mediaRecorderRef.current.stop(); } catch (e) {}
                }
                stopAmbientListening();
                setTimeout(() => {
                  if (!isListeningLoopActive.current) return;
                  if (next) startAmbientListening();
                  else startWhisperRecording();
                }, 300);
              }
            }}
            title="Tự lắng nghe hội thoại và pop slide khi chạm chủ đề có dữ liệu"
            className={`px-4 py-2 rounded-full text-xs font-semibold border transition-all flex items-center gap-1.5 ${
              ambientMode
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                : 'bg-[#161d30] border-[#1e2a45] text-gray-400 hover:text-gray-200'
            }`}
          >
            🎧 Nghe ngầm: {ambientMode ? 'BẬT' : 'Tắt'}
          </button>
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

        {ambientMode && (
          <p className="text-[11px] text-emerald-400/70 text-center max-w-md">
            Chế độ nghe ngầm: bot tự lắng nghe và chỉ hiện slide khi câu chuyện chạm chủ đề có dữ liệu. Tám chuyện linh tinh sẽ được bỏ qua.
          </p>
        )}
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
