'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cleanTextForTTS, ttsUrl, normalizeVietnameseSpeech } from '@/lib/speech';

export type ChatState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export type SttEngine = 'browser' | 'gemini';

export interface UseVoiceAgentProps {
  onSpeechResult?: (text: string) => void;
  onStateChange?: (state: ChatState) => void;
  /** Nhận log chẩn đoán STT (bật/lỗi/kết quả) — trang /slide?debug=1 hiện lên HUD. */
  onDebug?: (msg: string) => void;
  voiceOn?: boolean;
  /**
   * Bộ nhận diện giọng nói:
   *  - 'browser' (mặc định): Web Speech API — streaming, tức thì, nhưng Brave/Firefox
   *    chặn và nghe sai tên riêng.
   *  - 'gemini': thu âm từng câu (MediaRecorder + VAD ngắt câu) rồi gửi /api/transcribe
   *    (Deepgram→Gemini→Whisper). Chạy MỌI trình duyệt, nghe tên riêng chính xác hơn,
   *    đổi lại mỗi câu trễ ~1-2s. Hợp với chế độ NGHE-ONLY (không đọc) như trang /slide.
   */
  sttEngine?: SttEngine;
}

export function useVoiceAgent({
  onSpeechResult,
  onStateChange,
  onDebug,
  voiceOn = true,
  sttEngine = 'browser',
}: UseVoiceAgentProps = {}) {
  const [state, setStateInternal] = useState<ChatState>('idle');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [rmsVolume, setRmsVolume] = useState<number>(0);

  const recognitionRef = useRef<any>(null);
  const audioQueueRef = useRef<{ text: string; url: string; audio: HTMLAudioElement }[]>([]);
  const isPlayingAudioRef = useRef<boolean>(false);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const isStreamFinishedRef = useRef<boolean>(false);
  
  const isListeningLoopActive = useRef(false);
  const isRecognitionRunningRef = useRef<boolean>(false);
  const chatStateRef = useRef<ChatState>('idle');

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const vadRafRef = useRef<number | null>(null);
  const speakStartRef = useRef<number>(0);
  
  const VAD_THRESHOLD = 0.12;
  const VAD_FRAMES = 8;
  const SPEAK_GRACE_MS = 1500;

  // ── STT ENGINE = GEMINI (thu âm từng câu rồi gửi /api/transcribe) ───────────
  const sttEngineRef = useRef<SttEngine>(sttEngine);
  useEffect(() => { sttEngineRef.current = sttEngine; }, [sttEngine]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<BlobPart[]>([]);
  const hadSpeechRef = useRef(false);          // câu này đã có tiếng nói thật chưa
  const lastVoiceAtRef = useRef(0);            // mốc gần nhất RMS vượt ngưỡng nói
  const utterStartRef = useRef(0);             // lúc bắt đầu thu câu hiện tại
  const transcribingRef = useRef(false);       // đang gửi câu trước lên server -> khoan thu câu mới
  const handleUtteranceRef = useRef<() => void>(() => {});
  // Ngưỡng endpointing (ngắt câu). Thấp hơn ngưỡng barge-in vì cần nhạy với lời khách.
  const GEMINI_VOICE_RMS = 0.045;
  const GEMINI_SILENCE_HANG_MS = 900;   // im lặng bao lâu thì coi là hết câu
  const GEMINI_MIN_UTTER_MS = 500;      // câu ngắn hơn (ho/hắng giọng) -> bỏ
  const GEMINI_MAX_UTTER_MS = 15000;    // chốt cưỡng bức, tránh thu vô tận

  const onSpeechResultRef = useRef(onSpeechResult);
  const onStateChangeRef = useRef(onStateChange);
  const onDebugRef = useRef(onDebug);
  // Đếm lỗi 'network' LIÊN TIẾP: Brave/Firefox chặn dịch vụ STT của Google -> mọi lần
  // nghe đều fail 'network'. Trước đây bị nuốt im lặng -> mic "câm" không rõ vì sao.
  const networkErrCountRef = useRef(0);
  const sttBlockedWarnedRef = useRef(false);

  useEffect(() => {
    onSpeechResultRef.current = onSpeechResult;
    onStateChangeRef.current = onStateChange;
    onDebugRef.current = onDebug;
  }, [onSpeechResult, onStateChange, onDebug]);

  const dbg = useCallback((msg: string) => { try { onDebugRef.current?.(msg); } catch (e) {} }, []);

  const setState = useCallback((newState: ChatState) => {
    setStateInternal(newState);
    chatStateRef.current = newState;
    if (onStateChangeRef.current) onStateChangeRef.current(newState);
  }, []);

  const teardownVAD = useCallback(() => {
    if (vadRafRef.current != null) { cancelAnimationFrame(vadRafRef.current); vadRafRef.current = null; }
    if (mediaStreamRef.current) { try { mediaStreamRef.current.getTracks().forEach(t => t.stop()); } catch (e) {} mediaStreamRef.current = null; }
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch (e) {} audioCtxRef.current = null; }
    setRmsVolume(0);
  }, []);

  // Chỉ khởi động lại recognition, KHÔNG đụng vào audio/hàng đợi TTS/state.
  // Dùng cho onend + watchdog để mic sống liên tục kể cả khi đang 'processing'
  // (startListening() thì phá hàng đợi TTS nên không được gọi bừa lúc đó).
  const restartRecognitionOnly = useCallback(() => {
    if (!recognitionRef.current || isRecognitionRunningRef.current) return;
    try { recognitionRef.current.start(); } catch (e) { /* đang start dở — watchdog sẽ thử lại */ }
  }, []);

  // Bắt đầu thu 1 CÂU mới (chế độ Gemini). VAD tick sẽ tự chốt câu khi khách ngừng nói.
  const startGeminiRecorder = useCallback(() => {
    if (sttEngineRef.current !== 'gemini') return;
    if (!mediaStreamRef.current) return;          // stream chưa sẵn — setupVAD sẽ gọi lại
    if (transcribingRef.current) return;          // đang gửi câu trước
    const cur = mediaRecorderRef.current;
    if (cur && cur.state === 'recording') return; // đã đang thu
    try {
      const prefer = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
      const mime = typeof MediaRecorder !== 'undefined'
        ? prefer.find(m => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } })
        : undefined;
      const mr = mime ? new MediaRecorder(mediaStreamRef.current, { mimeType: mime }) : new MediaRecorder(mediaStreamRef.current);
      recChunksRef.current = [];
      hadSpeechRef.current = false;
      utterStartRef.current = Date.now();
      lastVoiceAtRef.current = Date.now();
      mr.ondataavailable = (e) => { if (e.data && e.data.size) recChunksRef.current.push(e.data); };
      mr.onstop = () => { handleUtteranceRef.current(); };
      mediaRecorderRef.current = mr;
      mr.start(250); // cắt chunk mỗi 250ms để có dữ liệu đều
    } catch (e) { dbg('🔴 Không tạo được MediaRecorder: ' + e); }
  }, [dbg]);

  const startListening = useCallback(() => {
    if (activeAudioRef.current) {
      try { activeAudioRef.current.pause(); } catch(e) {}
      activeAudioRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingAudioRef.current = false;
    isStreamFinishedRef.current = false;

    if (isListeningLoopActive.current && chatStateRef.current !== 'listening') {
      setState('listening');
    }

    // Chế độ Gemini: nghe = thu âm câu mới (không dùng Web Speech recognition).
    if (sttEngineRef.current === 'gemini') {
      startGeminiRecorder();
      return;
    }

    if (recognitionRef.current) {
      if (isRecognitionRunningRef.current) return;
      try {
        recognitionRef.current.start();
      } catch (e: any) {
        console.error('[useVoiceAgent] start error:', e);
      }
    }
  }, [setState, startGeminiRecorder]);

  const bargeIn = useCallback(() => {
    if (chatStateRef.current !== 'speaking') return;
    if (activeAudioRef.current) {
      try { activeAudioRef.current.pause(); } catch (e) {}
      activeAudioRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingAudioRef.current = false;
    isStreamFinishedRef.current = false;
    startListening();
  }, [startListening]);

  const setupVAD = useCallback(async () => {
    if (mediaStreamRef.current) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      if (sttEngineRef.current === 'gemini') { setErrorMsg('Trình duyệt không hỗ trợ thu âm (getUserMedia).'); setState('error'); }
      return;
    }
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
        setRmsVolume(rms);
        
        if (chatStateRef.current === 'speaking' && Date.now() - speakStartRef.current > SPEAK_GRACE_MS) {
          if (rms > VAD_THRESHOLD) loudFrames++; else loudFrames = Math.max(0, loudFrames - 1);
          if (loudFrames >= VAD_FRAMES) { loudFrames = 0; bargeIn(); }
        } else {
          loudFrames = 0;
        }

        // ENDPOINTING chế độ Gemini: đang thu + đang nghe -> canh im lặng để chốt câu.
        if (sttEngineRef.current === 'gemini' && chatStateRef.current === 'listening') {
          const mr = mediaRecorderRef.current;
          if (mr && mr.state === 'recording') {
            const now = Date.now();
            if (rms > GEMINI_VOICE_RMS) { hadSpeechRef.current = true; lastVoiceAtRef.current = now; }
            const silenceFor = now - lastVoiceAtRef.current;
            const utterFor = now - utterStartRef.current;
            if ((hadSpeechRef.current && silenceFor > GEMINI_SILENCE_HANG_MS) || utterFor > GEMINI_MAX_UTTER_MS) {
              try { mr.stop(); } catch (e) {} // -> onstop -> handleUtteranceRef -> /api/transcribe
            }
          }
        }
      };
      tick();

      // Stream đã sẵn: nếu đang ở chế độ Gemini và đang nghe -> bắt đầu thu ngay.
      if (sttEngineRef.current === 'gemini' && isListeningLoopActive.current) {
        startGeminiRecorder();
      }
    } catch (e) {
      console.warn('[useVoiceAgent] Không bật được VAD:', e);
      // Chế độ Gemini: VAD/getUserMedia LÀ đường thu âm duy nhất -> lỗi = mic chết,
      // phải báo rõ (thường do chặn quyền micro) thay vì im lặng.
      if (sttEngineRef.current === 'gemini') {
        setErrorMsg('Không truy cập được micro. Hãy cấp quyền micro cho trang rồi thử lại.');
        setState('error');
      }
    }
  }, [bargeIn, startGeminiRecorder, setState]);

  const stopAllVoiceActivities = useCallback(() => {
    isListeningLoopActive.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch(e) {}
    }
    // Dừng thu âm Gemini + reset trạng thái câu đang thu.
    if (mediaRecorderRef.current) {
      try { mediaRecorderRef.current.onstop = null; mediaRecorderRef.current.stop(); } catch (e) {}
      mediaRecorderRef.current = null;
    }
    recChunksRef.current = [];
    hadSpeechRef.current = false;
    transcribingRef.current = false;
    if (activeAudioRef.current) {
      try { activeAudioRef.current.pause(); } catch(e) {}
      activeAudioRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingAudioRef.current = false;
    isStreamFinishedRef.current = false;
    isRecognitionRunningRef.current = false;
    teardownVAD();
    setState('idle');
  }, [setState, teardownVAD]);

  const toggleMic = useCallback(() => {
    if (isListeningLoopActive.current) {
      stopAllVoiceActivities();
      setTranscript('Đã dừng. Nhấn nút Micro để bắt đầu.');
    } else {
      isListeningLoopActive.current = true;
      setState('listening');
      setTranscript("🎙️ Ny'ah đang lắng nghe bạn...");
      setupVAD();
      startListening();
    }
  }, [stopAllVoiceActivities, setState, setupVAD, startListening]);

  const playNextAudio = useCallback(() => {
    if (isPlayingAudioRef.current) return;

    if (audioQueueRef.current.length === 0) {
      if (isStreamFinishedRef.current) {
        if (isListeningLoopActive.current) {
          startListening();
        } else {
          setState('idle');
        }
      }
      return;
    }

    if (!voiceOn) {
      audioQueueRef.current = [];
      if (isStreamFinishedRef.current) {
        if (isListeningLoopActive.current) startListening();
        else setState('idle');
      }
      return;
    }

    const nextAudio = audioQueueRef.current.shift()!;
    isPlayingAudioRef.current = true;
    setState('speaking');
    speakStartRef.current = Date.now();
    setResponse(nextAudio.text);

    // continuous=true nen mic van mo luc phat TTS -> se nghe nham chinh giong may
    // (echo). Tat STT trong luc 'speaking'; VAD (luong getUserMedia rieng) van chay
    // lo barge-in. Xong TTS -> startListening() bat lai recognition.
    if (recognitionRef.current && isRecognitionRunningRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
    }

    const audio = nextAudio.audio;
    activeAudioRef.current = audio;

    audio.onended = () => {
      isPlayingAudioRef.current = false;
      activeAudioRef.current = null;
      playNextAudio();
    };

    audio.onerror = () => {
      isPlayingAudioRef.current = false;
      activeAudioRef.current = null;
      playNextAudio();
    };

    audio.play().catch(err => {
      console.error('Audio autoplay error', err);
      isPlayingAudioRef.current = false;
      activeAudioRef.current = null;
      playNextAudio();
    });
  }, [voiceOn, setState, startListening]);

  const speakSentence = useCallback((sentence: string, isLast = false) => {
    if (isLast) isStreamFinishedRef.current = true;
    const cleanText = cleanTextForTTS(sentence);

    if (!cleanText || !voiceOn) {
      // Câu không có gì đọc được (vd chỉ toàn link Google Maps) nhưng vẫn có nội
      // dung thật từ backend -> vẫn phải hiện lên UI, không thì màn hình kẹt
      // "Đang suy nghĩ..." mãi dù bot đã trả lời xong.
      if (sentence.trim()) setResponse(sentence.trim());
      if (isLast && !isPlayingAudioRef.current && audioQueueRef.current.length === 0) {
        if (isListeningLoopActive.current) startListening();
        else setState('idle');
      }
      return;
    }

    const audioUrl = ttsUrl(cleanText);
    const audio = new Audio(audioUrl);
    audio.preload = 'auto';
    audioQueueRef.current.push({ text: sentence, url: audioUrl, audio });
    playNextAudio();
  }, [voiceOn, playNextAudio, startListening, setState, setResponse]);

  // Xử lý 1 câu vừa thu xong (chế độ Gemini): dựng blob -> /api/transcribe -> chữ.
  const handleGeminiUtterance = useCallback(async () => {
    const chunks = recChunksRef.current;
    recChunksRef.current = [];
    const dur = Date.now() - utterStartRef.current;
    const hadSpeech = hadSpeechRef.current;
    const mr = mediaRecorderRef.current;

    // Không có tiếng nói thật / quá ngắn -> bỏ, thu tiếp.
    if (!hadSpeech || dur < GEMINI_MIN_UTTER_MS || chunks.length === 0) {
      if (isListeningLoopActive.current && chatStateRef.current !== 'speaking') startGeminiRecorder();
      return;
    }

    transcribingRef.current = true;
    setState('processing');
    try {
      const blob = new Blob(chunks, { type: mr?.mimeType || 'audio/webm' });
      const fd = new FormData();
      fd.append('file', blob, 'utter.webm');
      const res = await fetch('/api/transcribe', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({} as any));
      const text = (data?.text || '').trim();
      if (text) {
        dbg(`🎧 Gemini nghe: "${text}"`);
        const norm = normalizeVietnameseSpeech(text) || text;
        if (onSpeechResultRef.current) onSpeechResultRef.current(norm);
        // Không tự thu lại ở đây: onSpeechResult -> trang xử lý (hiện slide) rồi gọi
        // startListening() để mở lại vòng nghe. Tránh double-record.
      } else {
        dbg('⚪ Gemini nghe rỗng — nghe tiếp');
        if (isListeningLoopActive.current) { setState('listening'); startGeminiRecorder(); }
      }
    } catch (e) {
      dbg('🔴 Lỗi /api/transcribe: ' + e);
      if (isListeningLoopActive.current) { setState('listening'); startGeminiRecorder(); }
    } finally {
      transcribingRef.current = false;
    }
  }, [setState, dbg, startGeminiRecorder]);

  useEffect(() => { handleUtteranceRef.current = handleGeminiUtterance; }, [handleGeminiUtterance]);



  useEffect(() => {
    if (!voiceOn) {
      if (activeAudioRef.current) {
        try { activeAudioRef.current.onended = null; activeAudioRef.current.pause(); } catch (e) {}
        activeAudioRef.current = null;
      }
      audioQueueRef.current = [];
      isPlayingAudioRef.current = false;
      
      if (chatStateRef.current === 'speaking') {
        if (isListeningLoopActive.current) startListening();
        else setState('idle');
      }
    }
  }, [voiceOn, startListening, setState]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Chế độ Gemini KHÔNG dùng Web Speech — thu âm qua MediaRecorder (setupVAD) rồi
    // gửi /api/transcribe. Bỏ qua toàn bộ phần khởi tạo recognition ở đây.
    if (sttEngine === 'gemini') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorMsg('Trình duyệt không hỗ trợ Web Speech API.');
      setState('error');
      return;
    }

    // Brave có webkitSpeechRecognition nhưng CHẶN dịch vụ nhận diện phía sau
    // -> mic mở mà không bao giờ ra chữ. Cảnh báo ngay từ đầu thay vì để câm.
    try {
      (navigator as any).brave?.isBrave?.().then((yes: boolean) => {
        if (yes) {
          dbg('⚠️ Phát hiện Brave — trình duyệt này chặn nhận diện giọng nói');
          setErrorMsg('Brave chặn nhận diện giọng nói. Hãy mở trang này bằng Chrome hoặc Edge.');
        }
      });
    } catch (e) {}

    const rec = new SpeechRecognition();
    // NGHE LIEN TUC: continuous=false khien mic TAT sau moi cau -> phai restart ->
    // khoang "diec" 120ms+latency Chrome moi lan -> noi dung luc do la MAT TIENG
    // ("lau lau noi khong nghe"). continuous=true giu mic mo suot, gan nhu het diec.
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'vi-VN';

    rec.onstart = () => {
      isRecognitionRunningRef.current = true;
      if (isListeningLoopActive.current) {
        setState('listening');
        setTranscript(prev => prev.startsWith('🎧 Nhận diện:') ? prev : "🎙️ Ny'ah đang lắng nghe bạn...");
      }
      setErrorMsg('');
    };

    rec.onresult = (event: any) => {
      if (!isListeningLoopActive.current) return;
      // continuous=false: chỉ có 1 kết quả final duy nhất tại mỗi phiên
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalText += event.results[i][0].transcript + ' ';
      }
      finalText = finalText.trim();
      if (!finalText) return;   // moi co interim, cau chua chot -> cho tiep

      // Nghe được câu thật -> reset bộ đếm lỗi network
      networkErrCountRef.current = 0;
      const resultText = normalizeVietnameseSpeech(finalText) || finalText;
      setTranscript(`🎧 Nhận diện: "${resultText}"`);
      setState('processing');
      if (onSpeechResultRef.current) {
        onSpeechResultRef.current(resultText);
      }
    };

    rec.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        // Bình thường: im lặng lâu / bị abort chủ động — không cần báo.
      } else if (event.error === 'network') {
        networkErrCountRef.current++;
        dbg(`🔴 STT lỗi network (lần ${networkErrCountRef.current})`);
        if (networkErrCountRef.current >= 3 && !sttBlockedWarnedRef.current) {
          sttBlockedWarnedRef.current = true;
          setErrorMsg('Trình duyệt này đang chặn nhận diện giọng nói (Brave/Firefox không hỗ trợ). Hãy mở bằng Chrome hoặc Edge.');
          dbg('⛔ STT bị trình duyệt chặn — cần Chrome/Edge');
        }
      } else if (event.error === 'not-allowed') {
        dbg('⛔ Quyền micro bị chặn');
        setErrorMsg('Quyền truy cập Micro bị chặn. Hãy cấp quyền trong cài đặt trình duyệt.');
        setState('error');
        stopAllVoiceActivities();
      } else {
        dbg(`🔴 STT lỗi: ${event.error}`);
        setErrorMsg(`Lỗi micro: ${event.error}`);
        setState('error');
        if (isListeningLoopActive.current) {
          setTimeout(() => {
            if (isListeningLoopActive.current) startListening();
          }, 4000);
        }
      }
    };

    rec.onend = () => {
      isRecognitionRunningRef.current = false;
      // Chỉ tự động mở lại mic nếu vẫn đang trong trạng thái 'listening'
      if (isListeningLoopActive.current && chatStateRef.current === 'listening') {
        setTimeout(() => {
          if (isListeningLoopActive.current && chatStateRef.current === 'listening') {
            restartRecognitionOnly();
          }
        }, 120);
      }
    };

    recognitionRef.current = rec;

    // WATCHDOG: Chỉ hồi sinh mic khi trạng thái là 'listening'
    const watchdog = setInterval(() => {
      if (!isListeningLoopActive.current) return;
      if (chatStateRef.current !== 'listening') return;
      if (!isRecognitionRunningRef.current) restartRecognitionOnly();
    }, 1200);

    return () => {
      clearInterval(watchdog);
      stopAllVoiceActivities();
    };
  }, [setState, startListening, stopAllVoiceActivities, restartRecognitionOnly, dbg]);

  return {
    state,
    transcript,
    response,
    errorMsg,
    rmsVolume,
    setTranscript,
    setResponse,
    setState,
    startListening,
    stopAllVoiceActivities,
    bargeIn,
    speakSentence,
    toggleMic,
    isListeningLoopActive,
    recognitionRef,
  };
}
