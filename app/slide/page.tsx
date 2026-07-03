"use client";

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { splitCleanSentences, splitSentences } from '@/lib/speech';
import { classifyAmbientIntent } from '@/lib/intent';
import { useVoiceAgent } from '@/hooks/useVoiceAgent';
import { SlideBody } from '@/components/SlideBody';

type SlideData = {
  layout_type?: 'split_image_right' | 'split_image_left' | 'full_background' | 'dark_minimal' | 'text_only';
  title: string;
  points: string[];
  highlight_number?: string;
  speech_text: string;
  image_url?: string;
  image_urls?: string[];
  maps_url?: string;
  skip?: boolean;
};

export default function SlideBotPage() {
  const [slide, setSlide] = useState<SlideData | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  const [voiceOn, setVoiceOn] = useState(false);
  const [slideKey, setSlideKey] = useState(0);

  const bufferRef = useRef('');
  const lastGenRef = useRef(0);
  const isGeneratingRef = useRef(false);
  const AMBIENT_COOLDOWN_MS = 3500;

  const slideRef = useRef<SlideData | null>(null);
  const brokenImagesRef = useRef<Record<string, boolean>>({});
  
  useEffect(() => { slideRef.current = slide; }, [slide]);
  useEffect(() => { brokenImagesRef.current = brokenImages; }, [brokenImages]);

  const {
    state,
    transcript,
    rmsVolume,
    setTranscript,
    setState,
    startListening,
    stopAllVoiceActivities,
    speakSentence,
    toggleMic,
    isListeningLoopActive,
  } = useVoiceAgent({
    voiceOn: voiceOn,
    onSpeechResult: (text) => {
      if (handleVoiceCommands(text)) return;
      handleAmbientSpeech(text);
    }
  });

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
        if (isListeningLoopActive.current) {
           setState('listening');
           startListening();
        } else {
           setState('idle');
        }
        return true;
      }
    }
    const zoomOutKeywords = ['thu nhỏ', 'đóng ảnh', 'đóng hình', 'thoát ảnh', 'quay lại', 'tắt ảnh'];
    if (zoomOutKeywords.some(kw => clean.includes(kw))) {
      setSelectedImage(null);
      if (isListeningLoopActive.current) {
         setState('listening');
         startListening();
      } else {
         setState('idle');
      }
      return true;
    }
    return false;
  };

  const handleAmbientSpeech = (text: string) => {
    bufferRef.current = text;
    maybeGenerateAmbient();
  };

  const maybeGenerateAmbient = () => {
    if (!isListeningLoopActive.current || isGeneratingRef.current) return;
    const query = bufferRef.current.trim();
    if (!query) {
       setState('listening');
       setTranscript("🎙️ Ny'ah đang lắng nghe bạn...");
       startListening();
       return;
    }
    const intent = classifyAmbientIntent(query);
    if (!intent.shouldGenerate) {
       setState('listening');
       setTranscript("🎙️ Ny'ah đang lắng nghe bạn...");
       startListening();
       return;
    }
    const now = Date.now();
    const wait = AMBIENT_COOLDOWN_MS - (now - lastGenRef.current);
    if (wait > 0 && intent.reason !== 'explicit_slide_request') {
       setState('listening');
       setTranscript("🎙️ Ny'ah đang lắng nghe bạn...");
       startListening();
       return;
    }
    
    setTranscript('💡 Chuẩn bị slide...');
    fetchSlideData(query, true);
  };

  const streamChatForVoice = async (speechText: string, history: any[] = []) => {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: speechText, history }),
      });
      if (!res.ok || !res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sentenceBuffer = '';
      
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        sentenceBuffer += chunk;
        const { sentences, remaining } = splitSentences(sentenceBuffer);
        sentenceBuffer = remaining;
        sentences.forEach(sentence => speakSentence(sentence, false));
      }
      if (sentenceBuffer.trim()) {
        speakSentence(sentenceBuffer.trim(), true);
      } else {
        speakSentence('', true);
      }
    } catch (err) {
      console.error('Lỗi stream chat:', err);
    }
  };

  const fetchSlideData = async (text: string, ambient = false) => {
    try {
      isGeneratingRef.current = true;
      if (!ambient) setState('processing');
      
      // Mở luồng giọng nói TỨC THÌ nếu voiceOn = true
      if (voiceOn) {
        streamChatForVoice(text);
      }

      const res = await fetch('/api/slide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // KHÔNG gửi ambient lên API: client đã lọc bằng classifyAmbientIntent rồi.
        // Gửi ambient:true làm server thêm luật skip quá gắt -> LLM hay trả skip/không
        // ảnh, trong khi trang voice gọi cùng API không cờ này thì luôn có ảnh.
        body: JSON.stringify({ message: text })
      });

      if (!res.ok) throw new Error('API lỗi');
      const data: SlideData = await res.json();

      if (data.skip || !data.speech_text || !data.title || data.title === 'Lỗi hiển thị' || data.title.includes('Lỗi hiển thị')) {
        if (ambient) {
          setTranscript('🎧 Đang nghe ngầm… (chưa có chủ đề rõ ràng)');
          setState('listening');
          startListening();
        } else {
          setTranscript('Không tìm thấy thông tin phù hợp trong dữ liệu dự án.');
          setState('idle');
        }
        return;
      }

      if (!data.layout_type) data.layout_type = 'split_image_right';
      setBrokenImages({});
      setSlideKey(k => k + 1);
      setSlide(data);
      if (ambient) {
        lastGenRef.current = Date.now();
      }

      if (voiceOn) {
        // Đã được đọc bởi streamChatForVoice, không đọc lại data.speech_text nữa
        // Chỉ lưu lại text để hiển thị hoặc xử lý sau nếu cần
      } else {
        setState('listening');
        setTranscript("🎙️ Ny'ah đang lắng nghe bạn...");
        startListening();
      }
    } catch (e) {
      if (ambient) {
        setState('listening');
        setTranscript("🎙️ Ny'ah đang lắng nghe bạn...");
        startListening();
        return;
      }
      setTranscript('Xin lỗi, có lỗi xảy ra khi xử lý.');
      if (isListeningLoopActive.current) {
        setState('listening');
        setTranscript("🎙️ Ny'ah đang lắng nghe bạn...");
        startListening();
      } else {
        setState('idle');
      }
    } finally {
      isGeneratingRef.current = false;
    }
  };

  // Preload images
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
      const img = new window.Image();
      img.src = src;
    });
  }, []);

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

  const SLOGAN = 'Sống đẹp hơn chung cư — Sinh lời hơn thổ cư';

  const Line = ({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) => (
    <span className="line-mask block">
      <span className={`line-in block ${className}`} style={{ animationDelay: `${delay}ms` }}>{children}</span>
    </span>
  );

  const renderSlideBody = () => {
    if (!slide) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-[2.5vh] px-[5vw]">
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
            Chạm nút micro — slide sẽ tự hiện theo câu chuyện của bạn.
          </Line>
        </div>
      );
    }

    // Dung CHUNG <SlideBody> voi trang demo -> bo cuc/anh/chu y het nhau.
    // collectImages da loc anh 404 + gioi han 3. imgOrient = huong that (da do runtime).
    const cleanData = { ...slide, image_urls: collectImages(slide) };
    return (
      <SlideBody
        data={cleanData}
        orientOf={(s) => imgOrient[s] || 'landscape'}
        onImageClick={setSelectedImage}
        onImageError={(s) => setBrokenImages(prev => ({ ...prev, [s]: true }))}
        replayKey={slideKey}
      />
    );
  };

  return (
    <div
      className="h-screen max-h-screen overflow-hidden flex flex-col relative text-[#161616] bg-[#F5F3EC]"
      style={{ fontFamily: "'Be Vietnam Pro', 'Inter', 'Google Sans', system-ui, sans-serif" }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .dots { background-image: radial-gradient(rgba(22,22,22,.28) 1.6px, transparent 1.6px); background-size: 16px 16px; }
        /* Mặt nạ nới thêm trên/dưới để KHÔNG cắt dấu tiếng Việt (dấu nặng dưới Ị/Ụ,
           dấu mũ trên Ấ/Ề) khi leading < 1 — margin âm bù lại nên khoảng cách giữ nguyên. */
        .line-mask { overflow: hidden; padding: 0.14em 0 0.2em; margin: -0.14em 0 -0.2em; }
        .line-in {
          animation: lineUp .7s cubic-bezier(.22,1,.36,1) both, glowFade 1.15s ease-out both;
          will-change: transform, opacity;
        }
        @keyframes lineUp {
          0% { transform: translateY(140%); opacity: 0; }
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

      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="dots absolute top-[8%] right-[5%] w-44 h-28 opacity-70" />
        <div className="absolute -top-[10vh] -left-[10vh] w-[26vw] h-[26vw] rounded-full bg-[#E3F0E3]" />
        <div className="absolute top-[17%] -right-16 w-[18vw] h-[18vw] rounded-full border-[3px] border-[#2E9E5B]/20" />
        {/* Vòng tròn dưới-trái + chấm bi nhỏ đè LÊN TRÊN, sát mép dưới (render sau = nằm trên) */}
        <div className="absolute bottom-[13%] -left-10 w-[12vw] h-[12vw] rounded-full border-2 border-[#2E9E5B]/15" />
        <div className="dots absolute bottom-[6%] left-[3.5%] w-20 h-28 opacity-60" />
      </div>

      <header className="relative z-10 px-[5vw] pt-[2vh] pb-[1vh] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 rounded-2xl overflow-hidden bg-white shadow-md border border-black/5 flex items-center justify-center shrink-0">
            <img src="/logo.svg" alt="Nhã Đạt" className="w-[82%] h-[82%] object-contain" />
          </span>
          <div>
            {/* leading-none cat dau nang duoi ĐỊNH — dung leading-[1.2] de chua du dau */}
            <p className="font-black tracking-tight leading-[1.2] text-[clamp(15px,1.6vw,26px)]">NY&apos;AH PHÚ ĐỊNH</p>
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
            onClick={stopAllVoiceActivities}
            title="Thoát về trang chủ"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-black/10 text-neutral-500 hover:text-red-500 hover:border-red-300 transition"
          >
            ✕
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex-1 min-h-0 flex flex-col">
        {renderSlideBody()}
      </main>

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
          onClick={() => setVoiceOn(!voiceOn)}
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
          {state !== 'idle' && (
            <div
              className="absolute inset-0 rounded-full transition-transform duration-75 pointer-events-none z-0"
              style={{ transform: 'scale(' + (1 + Math.min(rmsVolume * 5, 2.0)) + ')', backgroundColor: rmsVolume > 0.01 ? 'rgba(232, 184, 75, 0.25)' : 'rgba(46,158,91,0.18)', willChange: 'transform' }}
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
