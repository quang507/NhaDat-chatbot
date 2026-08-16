"use client";

// ============================================================================
// /slide - MÀN TRÌNH CHIẾU TV SHOWROOM (sau tái cấu trúc P1)
//
// Trang này giờ chỉ là TẦNG CHIẾU: toàn bộ trạng thái nghiệp vụ (nghe/tạo
// slide/đóng băng/phiên khách/chống race pha 2) nằm trong presentation machine
// (lib/presentation-machine.ts); việc lấy slide nằm trong transport
// (lib/slide-transport.ts - HTTP 2 pha hoặc WebSocket server showroom).
//
//   ?debug=1   HUD chẩn đoán
//   ?demo=1..5 nạp slide mẫu không cần mic
//   ?ws=1      dùng WS same-origin (khi server showroom serve app - B3)
//   ?ws=ws://ip:3080  dùng WS server LAN chỉ định (B2)
// ============================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useVoiceAgent } from '@/hooks/useVoiceAgent';
import { usePresentationMachine } from '@/hooks/usePresentationMachine';
import { MachineEffect, SESSION_IDLE_MS } from '@/lib/presentation-machine';
import { pickTransport, SlideTransport, TransportEvent } from '@/lib/slide-transport';
import { RESUME_SEQ, SaleCmd } from '@/lib/ws-protocol';
import type { SlideData } from '@/lib/slide-types';
import { SlideStage } from '@/components/SlideStage';
import { AttractScreen } from '@/components/AttractScreen';
import { DebugHud } from '@/components/DebugHud';
import { createSessionRecorder } from '@/lib/session-digest';

// Slide mẫu cho ?demo=N - xem/chỉnh giao diện + chụp test không cần mic.
const DEMO_SLIDES: Record<string, SlideData> = {
  '1': {
    layout_type: 'split_image_right',
    title: 'Vị trí dự án',
    points: ['Mặt tiền Trương Đình Hội, Quận 8', 'Kết nối trực tiếp Đại lộ Võ Văn Kiệt', 'Chỉ mất 18 phút di chuyển đến Quận 1'],
    speech_text: "Dự án Ny'ah Phú Định tọa lạc ngay mặt tiền đường Trương Đình Hội, kết nối trực tiếp đến quận 1 chỉ trong 18 phút.",
    image_urls: ['/images/01_NyAh-PhuDinh/vi_tri/duong_di/18_phut_den_quan_1_chi_tiet.jpg'],
    maps_url: 'https://maps.app.goo.gl/qwf4XibyMCL9sEX6A',
    answer_text: 'Dạ từ dự án ra chợ Bình Điền chỉ khoảng 5 phút chạy xe, rất tiện đi chợ đầu mối sớm anh ạ.',
  },
  '2': {
    layout_type: 'full_background',
    title: 'Mẫu nhà Cosmo Gen 2',
    points: ['Diện tích sử dụng tối ưu hóa', 'Thang máy kính từ gara tầng trệt', 'Thiết kế trần cao thoáng đãng'],
    speech_text: 'Mẫu nhà Cosmo Gen 2 được thiết kế thông minh, tối ưu diện tích sử dụng.',
    image_urls: [
      '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_tong-quan.jpg',
      '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/phong_khach/cosmo-gen-2_phong-khach_tang-1_2-phong-khach-2.jpg',
      '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/bep/cosmo-gen-2_bep_tang-3_4-bep-1.jpg',
    ],
  },
  '3': {
    layout_type: 'text_only',
    title: 'Chỉ 18 phút đến Quận 1',
    points: ['Kết nối thẳng đại lộ Võ Văn Kiệt', 'Tránh kẹt xe giờ cao điểm'],
    speech_text: 'Từ dự án chỉ mười tám phút là vào tới trung tâm.',
    highlight_number: '18 phút',
    image_urls: [],
    answer_text: 'Dạ đúng rồi anh, từ dự án theo Võ Văn Kiệt vào Quận 1 chỉ khoảng 18 phút thôi ạ.',
  },
  '4': {
    layout_type: 'split_image_right',
    title: 'Mặt bằng Cosmo Gen 2',
    points: ['Cấu trúc 5 tầng + sân thượng', 'Thang máy kính thông suốt từ gara', 'Linh hoạt bố trí theo nhu cầu gia đình'],
    speech_text: 'Mặt bằng Cosmo Gen 2 bố trí hợp lý từng tầng, tối ưu công năng sinh hoạt.',
    image_urls: ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_cau-truc-1-2-3.jpg'],
  },
  '5': {
    layout_type: 'split_image_right',
    title: 'Phòng khách Cosmo Gen 2',
    points: ['Trần cao 3.5m, không gian mở thoáng', 'Cửa kính lùa đón ánh sáng tự nhiên', 'Nội thất Cashmere cao cấp tùy chọn'],
    speech_text: 'Phòng khách được thiết kế với trần cao và hệ cửa kính lùa, tạo cảm giác thông thoáng và sang trọng.',
    image_urls: ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/phong_khach/cosmo-gen-2_phong-khach_tang-1_2-phong-khach-2.jpg'],
  },
};

// Ảnh warm-up màn chờ + chủ đề hay gặp (P2 sẽ thay bằng prefetch theo hội thoại).
const WARMUP_IMAGES = [
  '/images/01_NyAh-PhuDinh/vi_tri/duong_di/18_phut_den_quan_1_chi_tiet.jpg',
  '/images/01_NyAh-PhuDinh/vi_tri/duong_di/vi_tri.jpg',
  '/images/01_NyAh-PhuDinh/tien_ich/cong_vien/nyah-phu-dinh_cong-vien.png',
  '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_cau-truc-1-2-3.jpg',
  '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_cau-truc-1-2-3.jpg',
  '/images/01_NyAh-PhuDinh/mat_bang/opus_cau-truc-1-2-3.jpg',
  '/images/01_NyAh-PhuDinh/noi_that/opus/opus_tong-quan.jpg',
  '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_tong-quan.jpg',
  '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_tong-quan.jpg',
];

export default function SlideBotPage() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [imgOrient, setImgOrient] = useState<Record<string, 'landscape' | 'portrait'>>({});

  // ── DEBUG HUD (?debug=1) ─────────────────────────────────────────────────
  const [debugOn, setDebugOn] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const dbg = useCallback((msg: string) => {
    console.log('[SlideDebug]', msg);
    const t = new Date().toLocaleTimeString('vi-VN', { hour12: false });
    setDebugLog(prev => [`${t}  ${msg}`, ...prev].slice(0, 14));
  }, []);

  // ── VOICE (audio layer - P2 sẽ chuyển vào worker) ────────────────────────
  const {
    state, transcript, errorMsg,
    setTranscript, setState, startListening, stopAllVoiceActivities, toggleMic,
    isListeningLoopActive,
  } = useVoiceAgent({
    onSpeechResult: (text) => {
      if (handleVoiceCommands(text)) return;
      sendRef.current({ type: 'SPEECH', text, now: Date.now() });
    },
    onDebug: dbg,
  });

  // ── TRANSPORT (HTTP 2 pha hoặc WS server showroom) ───────────────────────
  const transportRef = useRef<SlideTransport | null>(null);
  const [transportKind, setTransportKind] = useState('http');

  // ── SESSION RECORDER (tổng hợp phiên -> Telegram) ────────────────────────
  const recorderRef = useRef(createSessionRecorder('slide'));
  useEffect(() => recorderRef.current.bindUnload(), []);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── EFFECT EXECUTOR: machine ra lệnh, page thực thi ──────────────────────
  const runEffect = useCallback((eff: MachineEffect) => {
    switch (eff.type) {
      case 'START_QUERY':
        setState('processing');
        setTranscript(eff.text);
        dbg(`📡 Truy vấn #${eff.seq} qua ${transportRef.current?.kind || '?'}…`);
        transportRef.current?.query(eff.seq, eff.text, eff.recent);
        break;
      case 'START_LISTENING':
        if (isListeningLoopActive.current) {
          setState('listening');
          setTranscript("🎙️ Ny'ah đang lắng nghe bạn...");
          startListening();
        }
        break;
      case 'STOP_VOICE':
        stopAllVoiceActivities();
        break;
      case 'FLUSH_SESSION':
        recorderRef.current.flush();
        break;
      case 'RECORD_SHOWN':
        recorderRef.current.push(eff.query, `[slide] ${eff.title}`);
        break;
      case 'ARM_IDLE_TIMER':
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => sendRef.current({ type: 'SESSION_TIMEOUT' }), SESSION_IDLE_MS);
        break;
      case 'DEBUG':
        dbg(eff.message);
        break;
    }
  }, [dbg, setState, setTranscript, startListening, stopAllVoiceActivities, isListeningLoopActive]);

  const { ctx, send } = usePresentationMachine(runEffect);
  const sendRef = useRef(send);
  useEffect(() => { sendRef.current = send; }, [send]);
  useEffect(() => () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); }, []);

  // ── TRANSPORT EVENT -> MACHINE EVENT ─────────────────────────────────────
  const onTransportEvent = useCallback((ev: TransportEvent) => {
    switch (ev.t) {
      case 'SLIDE_READY': sendRef.current({ type: 'SLIDE_READY', seq: ev.seq, data: ev.data, interim: ev.interim }); break;
      case 'SLIDE_SKIP': sendRef.current({ type: 'SLIDE_SKIP', seq: ev.seq, reason: ev.reason }); break;
      case 'QUERY_FAILED': sendRef.current({ type: 'QUERY_FAILED', seq: ev.seq, error: ev.error }); break;
      case 'REFINE_READY': sendRef.current({ type: 'REFINE_READY', seq: ev.seq, patch: ev.patch }); break;
      case 'PREFETCH':
        // Server báo trước ảnh sắp cần -> nạp cache ngay khi khách còn đang nói.
        ev.urls.forEach(src => { const im = new window.Image(); im.src = src; });
        dbg(`⬇️ Prefetch ${ev.urls.length} ảnh theo hội thoại`);
        break;
      case 'SALE_CMD': handleSaleCmd(ev.cmd, ev.arg); break;
      case 'OVERRIDE_QUERY':
        dbg(`✏️ Sale bẻ lái truy vấn: "${ev.text}"`);
        sendRef.current({ type: 'SALE_OVERRIDE_QUERY', text: ev.text, now: Date.now() });
        break;
      case 'WS_STATUS': dbg(`🔌 WS: ${ev.status}`); break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbg]);

  // Lệnh từ Companion của Sale (qua WS). PREV/NEXT/TOGGLE điều khiển ảnh bằng
  // phím ảo 4/5/6 - SlideBody đã nghe window keydown cho remote thuyết trình,
  // Companion đi cùng một cửa để không có 2 đường điều khiển ảnh song song.
  const handleSaleCmd = (cmd: SaleCmd, arg?: number | string) => {
    dbg(`🎛 Sale: ${cmd}${arg !== undefined ? ` (${arg})` : ''}`);
    switch (cmd) {
      case 'FREEZE': sendRef.current({ type: 'SALE_FREEZE' }); break;
      case 'RESUME': sendRef.current({ type: 'SALE_RESUME' }); break;
      case 'CLEAR': sendRef.current({ type: 'SALE_CLEAR' }); break;
      case 'PREV_IMAGE': window.dispatchEvent(new KeyboardEvent('keydown', { key: '4' })); break;
      case 'NEXT_IMAGE': window.dispatchEvent(new KeyboardEvent('keydown', { key: '6' })); break;
      case 'TOGGLE_ROTATE': window.dispatchEvent(new KeyboardEvent('keydown', { key: '5' })); break;
      case 'PICK_IMAGE': break; // dành cho thumbnail strip ở SaleConsole (P3)
    }
  };

  // Khởi tạo transport + demo mode (client-only).
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    setDebugOn(qs.has('debug'));
    const tp = pickTransport(window.location.search, onTransportEvent, dbg);
    transportRef.current = tp;
    setTransportKind(tp.kind);
    const demo = qs.get('demo');
    if (demo) sendRef.current({ type: 'SLIDE_READY', seq: RESUME_SEQ, data: DEMO_SLIDES[demo] || DEMO_SLIDES['1'] });
    return () => tp.dispose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // TV báo trạng thái cho Companion (chỉ có tác dụng ở WS).
  useEffect(() => {
    transportRef.current?.sendState(ctx.state, ctx.slideId, ctx.slide?.title);
  }, [ctx.state, ctx.slideId, ctx.slide?.title]);

  // Mic chết hẳn (quyền bị chặn / trình duyệt không hỗ trợ) -> machine biết để
  // vào chế độ điều khiển tay.
  useEffect(() => {
    if (state === 'error' && errorMsg) sendRef.current({ type: 'MIC_FATAL', message: errorMsg });
  }, [state, errorMsg]);

  // ── LỆNH GIỌNG NÓI ZOOM ẢNH (UI thuần - không qua machine) ───────────────
  const slideRef = useRef<SlideData | null>(null);
  const brokenImagesRef = useRef<Record<string, boolean>>({});
  useEffect(() => { slideRef.current = ctx.slide; }, [ctx.slide]);
  useEffect(() => { brokenImagesRef.current = brokenImages; }, [brokenImages]);

  const handleVoiceCommands = (text: string): boolean => {
    const clean = text.toLowerCase().trim();
    const zoomIn = ['phóng to', 'phóng lớn', 'xem ảnh to', 'zoom to', 'zoom lên', 'mở to'];
    const zoomOut = ['thu nhỏ', 'đóng ảnh', 'đóng hình', 'thoát ảnh', 'quay lại', 'tắt ảnh'];
    const resume = () => {
      if (isListeningLoopActive.current) { setState('listening'); startListening(); }
      else setState('idle');
    };
    if (zoomIn.some(kw => clean.includes(kw))) {
      const s = slideRef.current;
      const images = (s?.image_urls?.length ? s.image_urls : s?.image_url ? [s.image_url] : [])
        .filter(img => img && !brokenImagesRef.current[img]);
      if (images.length > 0) { setSelectedImage(images[0]); resume(); return true; }
    }
    if (zoomOut.some(kw => clean.includes(kw))) { setSelectedImage(null); resume(); return true; }
    return false;
  };

  // ── ẢNH: đo hướng thật + lọc ảnh hỏng (UI concern, giữ ở page) ───────────
  const collectImages = (s: SlideData | null): string[] => {
    if (!s) return [];
    const imgs: string[] = [];
    if (s.image_urls && Array.isArray(s.image_urls)) imgs.push(...s.image_urls.filter(Boolean));
    else if (s.image_url) imgs.push(s.image_url);
    return imgs.filter(img => !brokenImages[img]).slice(0, 6);
  };

  useEffect(() => {
    const imgs = collectImages(ctx.slide);
    imgs.forEach(src => {
      if (imgOrient[src]) return;
      const im = new window.Image();
      im.onload = () => setImgOrient(prev => (prev[src] ? prev : { ...prev, [src]: im.naturalWidth >= im.naturalHeight ? 'landscape' : 'portrait' }));
      im.onerror = () => setBrokenImages(prev => ({ ...prev, [src]: true }));
      im.src = src;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.slide, brokenImages]);

  // Warm-up cache ảnh chủ đề hay gặp.
  useEffect(() => {
    WARMUP_IMAGES.forEach(src => { const img = new window.Image(); img.src = src; });
  }, []);

  // CHỐT AN TOÀN RENDER: trình duyệt không chạy animation -> ép hiện nội dung.
  const mainRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!ctx.slide) return;
    const t = setTimeout(() => {
      const el = mainRef.current?.querySelector('.line-in') as HTMLElement | null;
      if (!el) return;
      const cs = getComputedStyle(el);
      if (parseFloat(cs.opacity) < 0.5) {
        mainRef.current?.classList.add('anim-failsafe');
        dbg('🩹 Animation bị chặn - ép hiện nội dung ngay');
      }
    }, 1500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.slideId]);

  const onMicButton = () => {
    const turningOn = !isListeningLoopActive.current;
    toggleMic();
    if (turningOn) sendRef.current({ type: 'MIC_ON' });
    else { sendRef.current({ type: 'MIC_OFF' }); setTranscript('Đã dừng. Nhấn nút Micro để bắt đầu.'); }
  };

  const cleanSlide = ctx.slide ? { ...ctx.slide, image_urls: collectImages(ctx.slide) } : null;

  return (
    <div
      className="h-screen max-h-screen overflow-hidden flex flex-col relative text-[#161616] bg-[#F5F3EC]"
      style={{ fontFamily: "'Be Vietnam Pro', 'Inter', 'Google Sans', system-ui, sans-serif" }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .dots { background-image: radial-gradient(rgba(22,22,22,.28) 1.6px, transparent 1.6px); background-size: 16px 16px; }
        /* Mặt nạ nới thêm trên/dưới để KHÔNG cắt dấu tiếng Việt khi leading < 1. */
        .line-mask { overflow: hidden; padding: 0.25em 0 0.2em; margin: -0.25em 0 -0.2em; }
        .line-in {
          /* KHÔNG will-change thường trực - Chrome tự composite animation transform/opacity. */
          animation: lineUp .7s cubic-bezier(.22,1,.36,1) both, glowFade 1.15s ease-out both;
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
        .img-card { animation: imgIn .85s cubic-bezier(.22,1,.36,1) both; }
        @keyframes imgIn {
          0% { opacity: 0; transform: translateY(26px) scale(.965); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .marquee-track { animation: marquee 26s linear infinite; }
        @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        /* Sóng nghe: scaleY thay height - height là reflow mỗi frame, chạy vô hạn. */
        @keyframes wave { 0%,100% { transform: scaleY(.3); } 50% { transform: scaleY(1); } }
        .animate-sound-wave { animation: wave .9s ease-in-out infinite; transform-origin: center bottom; }
        /* Vòng sáng mic - đọc --mic-rms do useVoiceAgent ghi thẳng DOM (không qua React). */
        .mic-pulse {
          transform: scale(calc(1 + min(var(--mic-rms, 0) * 5, 2)));
          transition: transform 75ms linear;
          will-change: transform;
        }
        .mic-pulse-loud { opacity: min(calc(var(--mic-rms, 0) * 25), 1); }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in { animation: fadeIn .4s ease-out both; }
        @keyframes scaleUp { from { transform: scale(.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .animate-scale-up { animation: scaleUp .3s cubic-bezier(.22,1,.36,1) both; }
        .transcript-swap { animation: swapIn .38s cubic-bezier(.22,1,.36,1) both; }
        @keyframes swapIn { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: translateY(0); } }
        .anim-failsafe .line-in, .anim-failsafe .img-card {
          animation: none !important;
          opacity: 1 !important;
          transform: none !important;
        }
        @media (prefers-reduced-motion: reduce) {
          .line-in, .img-card, .marquee-track, .animate-sound-wave {
            animation-duration: .01ms !important;
            animation-iteration-count: 1 !important;
          }
        }
      ` }} />

      {debugOn && (
        <DebugHud
          state={state}
          machineState={ctx.state}
          hasSlide={!!ctx.slide}
          transportKind={transportKind}
          errorMsg={errorMsg}
          log={debugLog}
        />
      )}

      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute -top-[10vh] -left-[10vh] w-[26vw] h-[26vw] rounded-full bg-[#E3F0E3]" />
        <div className="absolute top-[17%] -right-16 w-[18vw] h-[18vw] rounded-full border-[3px] border-[#2E9E5B]/20" />
        <div className="absolute bottom-[13%] -left-10 w-[12vw] h-[12vw] rounded-full border-2 border-[#2E9E5B]/15" />
      </div>

      {/* transition-opacity: chỉ fade, thu gọn chiều cao tức thời (tránh animate layout). */}
      <header className={`relative z-10 px-[5vw] pt-[2vh] pb-[1vh] flex items-center justify-between shrink-0 transition-opacity duration-300 ${ctx.slide ? 'h-0 overflow-hidden opacity-0 pointer-events-none !p-0' : ''}`}>
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 rounded-2xl overflow-hidden bg-white shadow-md border border-black/5 flex items-center justify-center shrink-0">
            <img src="/logo.svg" alt="Nhã Đạt" className="w-[82%] h-[82%] object-contain" />
          </span>
          <div>
            <p className="font-black tracking-tight leading-[1.2] text-[clamp(15px,1.6vw,26px)]">NY&apos;AH PHÚ ĐỊNH</p>
            <p className="text-neutral-500 font-semibold tracking-[0.22em] uppercase mt-1 text-[clamp(9px,0.9vw,13px)]">A development by Nhã Đạt</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`px-4 py-2 rounded-full font-bold uppercase tracking-wide flex items-center gap-2 border text-[clamp(10px,1vw,15px)] ${
            state === 'listening' ? 'bg-[#E3F0E3] text-[#0E5A34] border-[#2E9E5B]/30'
            : state === 'processing' ? 'bg-amber-50 text-amber-700 border-amber-200'
            : 'bg-white text-neutral-400 border-black/10'
          }`}>
            {state === 'listening' && (
              <span className="flex items-end gap-0.5 h-3" aria-hidden>
                <span className="w-0.5 h-full bg-[#0E5A34] rounded-full animate-sound-wave" style={{ animationDelay: '0ms' }} />
                <span className="w-0.5 h-full bg-[#0E5A34] rounded-full animate-sound-wave" style={{ animationDelay: '150ms' }} />
                <span className="w-0.5 h-full bg-[#0E5A34] rounded-full animate-sound-wave" style={{ animationDelay: '300ms' }} />
              </span>
            )}
            {state === 'idle' && 'Đang chờ'}
            {state === 'listening' && 'Đang nghe'}
            {state === 'processing' && 'Đang suy nghĩ…'}
            {state === 'error' && 'Chế độ tay'}
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

      <main ref={mainRef} className="relative z-10 flex-1 min-h-0 flex flex-col">
        {cleanSlide ? (
          <SlideStage
            slideId={ctx.slideId}
            slide={cleanSlide}
            orientOf={(s) => imgOrient[s] || 'landscape'}
            onImageClick={setSelectedImage}
            onImageError={(s) => setBrokenImages(prev => ({ ...prev, [s]: true }))}
          />
        ) : (
          <AttractScreen />
        )}
      </main>

      {/* Chip trạng thái + mic nổi góc phải dưới */}
      <div className="absolute bottom-[2vh] right-[2vw] z-30 flex items-center gap-2.5">
        {errorMsg ? (
          <span className="max-w-[60vw] truncate px-4 py-2 rounded-full bg-black/70 backdrop-blur text-red-300 font-semibold text-[clamp(11px,1.2vw,16px)]">⚠️ {errorMsg}</span>
        ) : ctx.state === 'frozen' ? (
          <span className="px-4 py-2 rounded-full bg-black/60 backdrop-blur text-amber-200 font-bold text-[clamp(11px,1.2vw,16px)]">⏸ Đã đóng băng</span>
        ) : ctx.topicLabel ? (
          <span className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/60 backdrop-blur text-white/85 text-[clamp(11px,1.2vw,16px)]">
            <span className="flex items-end gap-0.5 h-3.5" aria-hidden>
              <span className="w-0.5 h-full bg-[#A8D94A] rounded-full animate-sound-wave" style={{ animationDelay: '0ms' }} />
              <span className="w-0.5 h-full bg-[#A8D94A] rounded-full animate-sound-wave" style={{ animationDelay: '150ms' }} />
              <span className="w-0.5 h-full bg-[#A8D94A] rounded-full animate-sound-wave" style={{ animationDelay: '300ms' }} />
            </span>
            <span className="font-bold text-[#A8D94A] whitespace-nowrap">{ctx.topicLabel}</span>
          </span>
        ) : state === 'processing' ? (
          <span className="w-8 h-8 grid place-items-center rounded-full bg-black/60 backdrop-blur" aria-hidden>
            <span className="w-3.5 h-3.5 border-2 border-amber-300/40 border-t-amber-300 rounded-full animate-spin" />
          </span>
        ) : state === 'listening' ? (
          <span className="w-8 h-8 grid place-items-center rounded-full bg-black/60 backdrop-blur" aria-hidden>
            <span className="flex items-end gap-0.5 h-3.5">
              <span className="w-0.5 h-full bg-[#A8D94A] rounded-full animate-sound-wave" style={{ animationDelay: '0ms' }} />
              <span className="w-0.5 h-full bg-[#A8D94A] rounded-full animate-sound-wave" style={{ animationDelay: '150ms' }} />
              <span className="w-0.5 h-full bg-[#A8D94A] rounded-full animate-sound-wave" style={{ animationDelay: '300ms' }} />
            </span>
          </span>
        ) : null}

        <div className="relative">
          {state !== 'idle' && (
            <div aria-hidden className="mic-pulse absolute inset-0 rounded-full pointer-events-none z-0">
              <div className="absolute inset-0 rounded-full" style={{ backgroundColor: 'rgba(46,158,91,0.18)' }} />
              <div className="mic-pulse-loud absolute inset-0 rounded-full" style={{ backgroundColor: 'rgba(232,184,75,0.25)' }} />
            </div>
          )}
          <button
            onClick={onMicButton}
            aria-label={state !== 'idle' ? 'Tắt micro' : 'Bật micro'}
            className={`w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-xl transition-colors duration-300 relative z-10 ${
              state !== 'idle'
                ? 'bg-black/60 backdrop-blur hover:bg-black/75 text-white/90'
                : 'bg-[#2E9E5B] hover:bg-[#0E5A34] shadow-[#2E9E5B]/30 text-white'
            }`}
          >
            {state !== 'idle' ? '⏹️' : '🎤'}
          </button>
        </div>
      </div>

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
