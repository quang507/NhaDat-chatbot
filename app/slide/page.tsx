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
  const AMBIENT_COOLDOWN_MS = 5000;        // tối thiểu 5s giữa 2 slide

  useEffect(() => { ambientRef.current = ambientMode; }, [ambientMode]);
  useEffect(() => { voiceOnRef.current = voiceOn; }, [voiceOn]);

  const slideRef = useRef<SlideData | null>(null);
  const brokenImagesRef = useRef<Record<string, boolean>>({});
  useEffect(() => { slideRef.current = slide; }, [slide]);
  useEffect(() => { brokenImagesRef.current = brokenImages; }, [brokenImages]);

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  // Tăng mỗi lần có slide mới -> ép remount để animation vào lại mượt (kể cả khi chỉ đổi nội dung)
  const [slideKey, setSlideKey] = useState(0);
  const toggleMicRef = useRef<() => void>(() => {});

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
  const amEngineOnRef = useRef(false);
  const AM_THRESHOLD = 0.035;     // ngưỡng RMS coi là có người nói
  const AM_SILENCE_MS = 900;      // im lặng 0.9s -> chốt 1 câu, gửi phiên âm
  const AM_MIN_SPEECH_MS = 350;   // câu < 0.35s -> bỏ (nhiễu)

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

      // Setup STT (Web Speech API). TTS dùng edge-tts qua /api/tts nên KHÔNG cần speechSynthesis.
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
        rec.continuous = false;
        rec.interimResults = true;   // hiện chữ NGAY khi đang nói -> tín hiệu nghe rõ + bớt cảm giác trễ
        rec.lang = 'vi-VN';

        rec.onstart = () => {
          lastActivityRef.current = Date.now();
          setState('listening');
          setTranscript(ambientRef.current ? '🎧 Đang nghe…' : '🎤 Đang nghe, mời nói…');
        };
        // Có tín hiệu âm thanh / có người nói -> đánh dấu STT còn sống (cho watchdog)
        rec.onaudiostart = () => { lastActivityRef.current = Date.now(); };
        rec.onspeechstart = () => { lastActivityRef.current = Date.now(); };

        rec.onresult = (event: any) => {
          lastActivityRef.current = Date.now();
          // Gom kết quả: interim (tạm) hiện ngay; final mới đem đi xử lý
          let interim = '';
          let finalText = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const r = event.results[i];
            if (r.isFinal) finalText += r[0].transcript;
            else interim += r[0].transcript;
          }

          // Phản hồi tức thì khi đang nói (chưa chốt câu)
          if (interim && !finalText) {
            setTranscript(ambientRef.current
              ? '🎧 Đang nghe: …' + interim.trim().slice(-90)
              : `🎤 …${interim.trim()}`);
            // NGHE NGẦM: nghe thấy từ khóa là bật slide LIỀN (không đợi hết câu)
            if (ambientRef.current) maybeInstantTrigger(interim);
            return;
          }
          if (!finalText) return;

          // Hết câu -> cho phép câu sau lại được bắn tức thì
          instantFiredRef.current = false;

          const text = normalizeVietnameseSpeech(finalText);
          if (handleVoiceCommands(text)) {
            return;
          }
          if (ambientRef.current) {
            handleAmbientSpeech(text);
          } else {
            setTranscript(`Bạn nói: "${text}"`);
            setState('processing');
            fetchSlideData(text, false);
          }
        };

        rec.onerror = (event: any) => {
          if (event.error === 'no-speech' || event.error === 'aborted' || event.error === 'network') {
            // Im lặng phục hồi: onend sẽ tự khởi động lại nếu session còn mở.
          } else if (event.error === 'not-allowed') {
            setState('idle');
            setTranscript('Vui lòng cấp quyền micro trong cài đặt trình duyệt.');
            isListeningLoopActive.current = false;
          } else {
            setTranscript(`Lỗi micro: ${event.error}. Đang thử lại...`);
          }
        };

        // Web Speech KHÔNG còn dùng cho nghe ngầm (hay chết câm + phụ thuộc mic mặc định/Google).
        // Để onend inert; nghe ngầm giờ chạy bằng engine Whisper (startAmbientListening).
        rec.onend = () => {};

        recognitionRef.current = rec;
      }

      // NGHE NGẦM mặc định BẬT — chạy bằng engine Whisper (MediaRecorder + VAD).
      ambientRef.current = true;
      isListeningLoopActive.current = true;
      // Thử bật ngay (nếu mic đã được cấp quyền trước đó). AudioContext có thể bị "suspended"
      // tới khi có cử chỉ -> resume ở cử chỉ đầu tiên.
      startAmbientListening();
      autoStartGestureRef.current = () => {
        if (!isListeningLoopActive.current || !ambientRef.current) return;
        try { amCtxRef.current?.resume(); } catch (e) {}
        startAmbientListening();
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
      const mediaRecorder = new MediaRecorder(stream);
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
    setTranscript('⚡ Đang xử lý giọng nói bằng Groq Whisper...');
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
    lastGenRef.current = now;                      // tính luôn vào cooldown chung
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
    const wait = AMBIENT_COOLDOWN_MS - (now - lastGenRef.current);
    if (wait > 0 && intent.reason !== 'explicit_slide_request') {
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
    lastGenRef.current = now;
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
      const fd = new FormData();
      fd.append('file', blob, 'audio.webm');
      const res = await fetch('/api/transcribe', { method: 'POST', body: fd });
      if (!res.ok) return;
      const data = await res.json();
      const text = normalizeVietnameseSpeech((data.text || '').trim());
      if (!text || text.replace(/[^a-zà-ỹ0-9]/gi, '').length < 2) return;
      if (handleVoiceCommands(text)) return;
      setTranscript('🎧 Nghe: …' + text.slice(-90));
      // Whisper trả nguyên câu hoàn chỉnh -> đưa vào handleAmbientSpeech;
      // nó tự xét kích hoạt tức thì (Logic 1) + debounce (Logic 2). KHÔNG gọi maybeInstantTrigger
      // ở đây nữa để tránh bắn slide 2 lần cho cùng 1 câu.
      handleAmbientSpeech(text);
    } catch (e) { /* bỏ qua, vòng sau thu tiếp */ }
  };

  // Bắt đầu engine nghe ngầm Whisper (idempotent). Thu liên tục, tự cắt câu theo VAD.
  const startAmbientListening = async () => {
    if (amEngineOnRef.current) { setState('listening'); setTranscript('🎧 Đang nghe ngầm…'); return; }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setTranscript('Trình duyệt không hỗ trợ thu âm.'); return;
    }
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
      amEngineOnRef.current = true;
      amRecordingRef.current = false;
      amSilenceStartRef.current = 0;
      setState('listening');
      setTranscript('🎧 Đang nghe ngầm…');

      const startSeg = () => {
        if (amRecordingRef.current) return;
        amChunksRef.current = [];
        try {
          const mr = new MediaRecorder(stream);
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

      let bargeFrames = 0;
      const tick = () => {
        amRafRef.current = requestAnimationFrame(tick);
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / data.length);
        const speaking = rms > AM_THRESHOLD;

        // Bot đang đọc to: chỉ phát hiện để CẮT LỜI (barge-in), KHÔNG thu (tránh ghi lại tiếng máy).
        // Dùng ngưỡng cao hơn + nhiều frame liên tiếp để tiếng loa (echo) không tự cắt lời bot.
        if (suppressListenRef.current || stateRef.current === 'speaking') {
          if (Date.now() - speakStartRef.current > SPEAK_GRACE_MS) {
            if (rms > VAD_THRESHOLD) bargeFrames++; else bargeFrames = Math.max(0, bargeFrames - 1);
            if (bargeFrames >= VAD_FRAMES) { bargeFrames = 0; bargeIn(); }
          }
          if (amRecordingRef.current) stopSeg();
          return;
        }
        bargeFrames = 0;

        if (speaking) {
          amSilenceStartRef.current = 0;
          if (!amRecordingRef.current) startSeg();
        } else if (amRecordingRef.current) {
          if (!amSilenceStartRef.current) amSilenceStartRef.current = Date.now();
          else if (Date.now() - amSilenceStartRef.current > AM_SILENCE_MS) stopSeg();
        }
      };
      tick();
    } catch (e) {
      amEngineOnRef.current = false;
      setTranscript('Không truy cập được mic. Cấp quyền mic rồi thử lại.');
    }
  };

  const stopAmbientListening = () => {
    amEngineOnRef.current = false;
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
    if (isPlayingRef.current) return;
    const audio = audioQueueRef.current.shift();
    if (!audio) { onSpeakDone(); return; }
    isPlayingRef.current = true;
    activeAudioRef.current = audio;
    speakStartRef.current = Date.now(); // mốc để VAD bỏ qua dư âm đầu câu
    audio.onended = () => { isPlayingRef.current = false; activeAudioRef.current = null; playNextSlideAudio(); };
    audio.onerror = () => { isPlayingRef.current = false; activeAudioRef.current = null; playNextSlideAudio(); };
    audio.play().catch(() => { isPlayingRef.current = false; playNextSlideAudio(); });
  };

  // Đọc theo TỪNG CÂU: câu đầu phát ngay khi slide hiện, các câu sau preload song song -> hết trễ
  const speakText = (text: string) => {
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

      if (voiceOnRef.current) {
        // Có đọc to: engine Whisper tự tạm ngừng thu (đọc suppressListenRef) để khỏi ghi lại tiếng máy,
        // vẫn giữ phát hiện barge-in. Mở lại thu ở onSpeakDone.
        if (ambientRef.current) suppressListenRef.current = true;
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
              >
                <img 
                  src={img} 
                  alt={`Minh họa ${idx + 1}`} 
                  className={`w-full h-full cursor-pointer transition-transform duration-500 hover:scale-[1.01] ${
                    isMap ? 'object-contain bg-[#070707]' : 'object-cover'
                  }`}
                  onClick={() => setSelectedImage(img)}
                  onError={() => setBrokenImages(prev => ({ ...prev, [img]: true }))}
                />
                
                {/* Lồng mã QR Code Google Maps ngay góc nếu ảnh này là bản đồ */}
                {isMap && isActive && (() => {
                  const qrUrl = slide.maps_url || 'https://maps.app.goo.gl/qwf4XibyMCL9sEX6A';
                  return (
                    <div className="absolute bottom-4 left-4 bg-black/85 backdrop-blur px-3 py-3 rounded-2xl border border-white/10 flex flex-col items-center gap-1 shadow-2xl animate-scale-up z-20">
                      <a href={qrUrl} target="_blank" rel="noopener noreferrer">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrUrl)}`}
                          alt="QR Vị Trí"
                          className="w-[100px] h-[100px] rounded-lg bg-white p-1 hover:scale-105 transition-transform"
                        />
                      </a>
                      <span className="text-[10px] text-gray-200 font-bold mt-1 tracking-wide">📱 Quét xem Google Maps</span>
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

    // Định nghĩa class container chuẩn 16:9 to lớn chiếm gần trọn màn hình
    const containerClass = "slide-stage w-full max-w-[95vw] md:max-w-[90vw] xl:max-w-[85vw] aspect-video max-h-[72vh] md:max-h-[75vh] xl:max-h-[78vh] rounded-3xl shadow-2xl border border-white/5 flex overflow-hidden transform transition-all duration-700 hover:shadow-[#e8b84b]/10";

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
          {/* Text Content — chiếm 40% */}
          <div className="basis-[40%] shrink-0 p-10 md:p-12 flex flex-col justify-center animate-fade-in-up">
            <h2 className="text-4xl md:text-5xl lg:text-[3.25rem] font-extrabold mb-6 leading-[1.1] text-white tracking-tight">
              {slide.title}
            </h2>
            <div className="flex flex-col gap-5 flex-1 overflow-y-auto pr-3 custom-scrollbar">
              {slide.points.map((point, idx) => (
                <div key={idx} className="flex gap-3.5 items-start group animate-fade-in-up" style={{ animationDelay: `${idx * 100}ms` }}>
                  <div className="w-2.5 h-2.5 mt-[0.7rem] rounded-full bg-[#e8b84b] shrink-0 transition-transform group-hover:scale-150"></div>
                  <p className="text-xl md:text-2xl text-gray-200 leading-relaxed font-light">{point}</p>
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
            {renderImageGrid()}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen text-white overflow-hidden flex flex-col relative slide-page-bg" style={{ fontFamily: "'Google Sans', 'Product Sans', 'Be Vietnam Pro', sans-serif" }}>

      {/* Background Decor (bokeh glow nhẹ) */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-15%] left-[-8%] w-[45%] h-[45%] bg-[radial-gradient(circle,rgba(232,184,75,0.06)_0%,transparent_70%)] rounded-full blur-3xl"></div>
        <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] bg-[radial-gradient(circle,rgba(120,140,200,0.05)_0%,transparent_70%)] rounded-full blur-3xl"></div>
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
          <div key={slideKey} className="w-full flex items-center justify-center">
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
