'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cleanTextForTTS, ttsUrl, normalizeVietnameseSpeech } from '@/lib/speech';

export type ChatState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface UseVoiceAgentProps {
  onSpeechResult?: (text: string) => void;
  onStateChange?: (state: ChatState) => void;
  voiceOn?: boolean;
}

export function useVoiceAgent({
  onSpeechResult,
  onStateChange,
  voiceOn = true,
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
  
  const VAD_THRESHOLD = 0.06;
  const VAD_FRAMES = 6;
  const SPEAK_GRACE_MS = 900;

  const setState = useCallback((newState: ChatState) => {
    setStateInternal(newState);
    chatStateRef.current = newState;
    if (onStateChange) onStateChange(newState);
  }, [onStateChange]);

  const teardownVAD = useCallback(() => {
    if (vadRafRef.current != null) { cancelAnimationFrame(vadRafRef.current); vadRafRef.current = null; }
    if (mediaStreamRef.current) { try { mediaStreamRef.current.getTracks().forEach(t => t.stop()); } catch (e) {} mediaStreamRef.current = null; }
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch (e) {} audioCtxRef.current = null; }
    setRmsVolume(0);
  }, []);

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

    if (recognitionRef.current) {
      if (isRecognitionRunningRef.current) return;
      try {
        recognitionRef.current.start();
      } catch (e: any) {
        console.error('[useVoiceAgent] start error:', e);
      }
    }
  }, [setState]);

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
        setRmsVolume(rms);
        
        if (chatStateRef.current === 'speaking' && Date.now() - speakStartRef.current > SPEAK_GRACE_MS) {
          if (rms > VAD_THRESHOLD) loudFrames++; else loudFrames = Math.max(0, loudFrames - 1);
          if (loudFrames >= VAD_FRAMES) { loudFrames = 0; bargeIn(); }
        } else {
          loudFrames = 0;
        }
      };
      tick();
    } catch (e) {
      console.warn('[useVoiceAgent] Không bật được VAD:', e);
    }
  }, [bargeIn]);

  const stopAllVoiceActivities = useCallback(() => {
    isListeningLoopActive.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch(e) {}
    }
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
  }, [voiceOn, playNextAudio, startListening, setState]);

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
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorMsg('Trình duyệt không hỗ trợ Web Speech API.');
      setState('error');
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
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
      const rawText = event.results[0][0].transcript;
      const resultText = normalizeVietnameseSpeech(rawText) || rawText;

      if (!isListeningLoopActive.current) return;

      setTranscript(`🎧 Nhận diện: "${resultText}"`);
      setState('processing');
      if (onSpeechResult) {
        onSpeechResult(resultText);
      }
    };

    rec.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted' || event.error === 'network') {
      } else if (event.error === 'not-allowed') {
        setErrorMsg('Quyền truy cập Micro bị chặn. Hãy cấp quyền trong cài đặt trình duyệt.');
        setState('error');
        stopAllVoiceActivities();
      } else {
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
      if (isListeningLoopActive.current && chatStateRef.current === 'listening') {
        startListening();
      }
    };

    recognitionRef.current = rec;

    return () => {
      stopAllVoiceActivities();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceOn]);

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
