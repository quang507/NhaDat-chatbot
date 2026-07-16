"use client";

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { splitCleanSentences, splitSentences, normalizeVietnameseSpeech } from '@/lib/speech';
import { classifyAmbientIntent, shouldRefreshSlide, IntentTopic } from '@/lib/intent';
import { matchStaticSlide } from '@/lib/static_slides';
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

// Nhan chu de than thien — hien "Nguoi ta dang noi ve [nhan]" khi bat duoc topic.
const TOPIC_LABELS: Record<string, string> = {
  price: 'Giá & Thanh toán',
  location: 'Vị trí & Đường đi',
  unit: 'Không gian & Công năng',
  legal: 'Pháp lý & Tiến độ',
  amenity: 'Tiện ích',
  design: 'Thiết kế & Nội thất',
  general: "Dự án Ny'ah Phú Định",
};

export default function SlideBotPage() {
  const [slide, setSlide] = useState<SlideData | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  const [voiceOn, setVoiceOn] = useState(false);
  const [slideKey, setSlideKey] = useState(0);
  // Chu de bat duoc tu giong noi khach — '' = chua bat, dang lang nghe.
  const [topicLabel, setTopicLabel] = useState('');
  const [heardText, setHeardText] = useState('');

  // ===== DEBUG HUD: mo trang voi /slide?debug=1 de xem trang thai + loi truc tiep =====
  const [debugOn, setDebugOn] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    setDebugOn(qs.has('debug'));
    // ?demo=1|2|3 -> tu nap slide mau KHONG can mic (xem/chinh giao dien + chup test)
    // 1 = split (ban do + QR), 2 = full_background (3 anh), 3 = text_only
    const demo = qs.get('demo');
    if (demo) {
      const samples: Record<string, SlideData> = {
        '1': {
          layout_type: 'split_image_right',
          title: 'Vị trí dự án',
          points: ['Mặt tiền Trương Đình Hội, Quận 8', 'Kết nối trực tiếp Đại lộ Võ Văn Kiệt', 'Chỉ mất 18 phút di chuyển đến Quận 1'],
          speech_text: "Dự án Ny'ah Phú Định tọa lạc ngay mặt tiền đường Trương Đình Hội, kết nối trực tiếp đến quận 1 chỉ trong 18 phút.",
          image_urls: ['/images/01_NyAh-PhuDinh/vi_tri/duong_di/18_phut_den_quan_1_chi_tiet.jpg'],
          maps_url: 'https://maps.app.goo.gl/qwf4XibyMCL9sEX6A',
        },
        '2': {
          layout_type: 'full_background',
          title: 'Mẫu nhà Cosmo Gen 2',
          points: ['Diện tích sử dụng tối ưu hóa', 'Thang máy kính từ gara tầng trệt', 'Thiết kế trần cao thoáng đãng'],
          speech_text: 'Mẫu nhà Cosmo Gen 2 được thiết kế thông minh, tối ưu diện tích sử dụng.',
          image_urls: [
            '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_tong-quan.jpg',
            '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/phong_khach/cosmo-gen-2_phong-khach.png',
            '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/bep/cosmo-gen-2_bep.png',
          ],
        },
        '3': {
          layout_type: 'text_only',
          title: 'Chỉ 18 phút đến Quận 1',
          points: ['Kết nối thẳng đại lộ Võ Văn Kiệt', 'Tránh kẹt xe giờ cao điểm'],
          speech_text: 'Từ dự án chỉ mười tám phút là vào tới trung tâm.',
          highlight_number: '18 phút',
          image_urls: [],
        },
      };
      setSlideKey(k => k + 1);
      setSlide(samples[demo] || samples['1']);
    }
  }, []);
  const dbg = (msg: string) => {
    console.log('[SlideDebug]', msg);
    const t = new Date().toLocaleTimeString('vi-VN', { hour12: false });
    setDebugLog(prev => [`${t}  ${msg}`, ...prev].slice(0, 14));
  };

  const bufferRef = useRef('');
  // Quyết định đổi/giữ slide dùng chung shouldRefreshSlide() (lib/intent.ts) với /voice,
  // để 2 nơi không lệch logic.
  const lastSlideRef = useRef<{ topic: IntentTopic | null; at: number }>({ topic: null, at: 0 });
  const isGeneratingRef = useRef(false);

  const slideRef = useRef<SlideData | null>(null);
  const brokenImagesRef = useRef<Record<string, boolean>>({});
  const mainRef = useRef<HTMLElement | null>(null);

  // CHỐT AN TOÀN RENDER: nội dung slide vào màn bằng CSS animation (line-in/img-card,
  // fill-mode both -> frame 0 là TÀNG HÌNH). Nếu trình duyệt không chạy animation
  // (extension chặn, chế độ tiết kiệm pin, forced reduced-motion...) thì chữ + ảnh
  // kẹt ở frame 0 vĩnh viễn -> "slide: CÓ" mà màn hình trắng. Sau 1.5s kiểm tra:
  // chữ vẫn tàng hình -> ép hiện toàn bộ + ghi log để biết máy đó bị chặn animation.
  useEffect(() => {
    if (!slide) return;
    const t = setTimeout(() => {
      const el = mainRef.current?.querySelector('.line-in') as HTMLElement | null;
      if (!el) { dbg('📐 Render check: không thấy .line-in trong DOM!'); return; }
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      dbg(`📐 Render: op=${cs.opacity}, anim=${cs.animationName.split(',')[0]}/${cs.animationPlayState.split(',')[0]}, y=${Math.round(rect.top)}, h=${Math.round(rect.height)}`);
      if (parseFloat(cs.opacity) < 0.5) {
        mainRef.current?.classList.add('anim-failsafe');
        dbg('🩹 Animation bị chặn — ép hiện nội dung ngay');
      }
    }, 1500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide, slideKey]);
  
  useEffect(() => { slideRef.current = slide; }, [slide]);
  useEffect(() => { brokenImagesRef.current = brokenImages; }, [brokenImages]);

  const {
    state,
    transcript,
    errorMsg,
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
      const normalized = normalizeVietnameseSpeech(text);
      dbg(`🎙️ Nhận: "${text}" -> Chuẩn hóa: "${normalized}"`);
      if (handleVoiceCommands(normalized)) return;
      handleAmbientSpeech(normalized);
    },
    onDebug: (m) => dbg(m),
  });

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
      // Cosmo Gen 2
      '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/bep/cosmo-gen-2_bep.png',
      '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/gara/cosmo-gen-2_gara.png',
      '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/phong_khach/cosmo-gen-2_phong-khach.png',
      '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/phong_ngu/cosmo-gen-2_noi-that-ngu-master.png',
      '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/phong_ngu/cosmo-gen-2_phong-ngu-con-2.png',
      '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/phong_ngu/cosmo-gen-2_phong-ngu-con-3.png',
      '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/phong_ngu/cosmo-gen-2_tang-2-phong-ngu-ong-ba-1.png',
      '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/wc/cosmo-gen-2_wc.png',
      '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_tong-quan.jpg',
      '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_mat-cat.jpg',
      // Fusion Gen 5
      '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/gara/fusion-gen-5_gara.png',
      '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/phong_khach/fusion-gen-5_phong-khach.png',
      '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/phong_ngu/fusion-gen-5_master-bedroom.png',
      '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/phong_ngu/fusion-gen-5_phong-hoc.png',
      '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/phong_ngu/fusion-gen-5_phong-ngu-con.png',
      '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/bep/fusion-gen-5_tang-3.png',
      '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/tang-2/fusion-gen-5_tang-2.png',
      // Opus
      '/images/01_NyAh-PhuDinh/noi_that/opus/bep/opus_bep.jpg',
      '/images/01_NyAh-PhuDinh/noi_that/opus/phong_ngu/opus_phong-ngu-1.jpg',
      '/images/01_NyAh-PhuDinh/noi_that/opus/phong_ngu/opus_phong-ngu-2.jpg',
      '/images/01_NyAh-PhuDinh/noi_that/opus/phong_ngu/opus_phong-ngu-master.jpg',
      '/images/01_NyAh-PhuDinh/noi_that/opus/van phong/opus_tang-1.jpg',
      '/images/01_NyAh-PhuDinh/noi_that/opus/van phong/opus_tang-2.jpg',
      '/images/01_NyAh-PhuDinh/noi_that/opus/wc/opus_wc.jpg',
    ];
    staticImages.forEach(src => {
      const img = new Image();
      img.src = src;
    });
  }, []);

  // Dung han -> xoa chu de dang hien.
  useEffect(() => { if (state === 'idle') { setTopicLabel(''); setHeardText(''); } }, [state]);

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

  // Ve trang thai "dang lang nghe" (chua bat duoc chu de nao).
  const backToListening = () => {
    setTopicLabel('');
    setHeardText('');
    setState('listening');
    setTranscript("🎙️ Ny'ah đang lắng nghe bạn...");
    startListening();
  };

  const maybeGenerateAmbient = () => {
    if (!isListeningLoopActive.current || isGeneratingRef.current) {
      dbg(isGeneratingRef.current ? '⏳ Đang tạo slide, bỏ qua câu mới' : '⏸ Loop nghe đã tắt');
      return;
    }
    const query = bufferRef.current.trim();
    if (!query) { backToListening(); return; }
    dbg(`🎙 Nghe: "${query.slice(0, 60)}"`);

    let intent = classifyAmbientIntent(query);
    if (!intent.shouldGenerate) {
      // Intent chấm điểm yếu NHƯNG câu khớp catalog slide tĩnh (lib/static_slides.ts
      // — cùng nguồn với server) -> vẫn cho qua. Sửa vụ "tiến độ đến đâu rồi" bị
      // weak_signal chặn oan dù server có sẵn slide tiến độ.
      const catalogHit = matchStaticSlide(query, 'combo') || matchStaticSlide(query, 'general');
      if (catalogHit) {
        dbg(`📚 Catalog khớp "${catalogHit.title}" — cho qua dù intent ${intent.reason}`);
        intent = { ...intent, shouldGenerate: true, topic: intent.topic || 'general', reason: 'has_project_topic' };
      } else {
        dbg(`🚫 Intent BỎ QUA — lý do: ${intent.reason}, topic: ${intent.topic || '—'}`);
        backToListening();
        return;
      }
    } else {
      dbg(`✅ Intent OK — topic: ${intent.topic}, lý do: ${intent.reason}`);
    }

    const now = Date.now();
    if (!shouldRefreshSlide(intent, lastSlideRef.current, now)) {
      dbg('⏱ Giữ slide cũ (chưa đủ thời gian đổi)');
      backToListening();
      return;
    }

    // BAT DUOC CHU DE -> hien "Nguoi ta dang noi ve [chu de]" + cau hoi that.
    lastSlideRef.current = { topic: intent.topic || null, at: now };
    setTopicLabel(TOPIC_LABELS[intent.topic || 'general'] || TOPIC_LABELS.general);
    setHeardText(query);
    setTranscript(query);
    fetchSlideData(query, true);
  };

  const streamChatForVoice = async (speechText: string, history: any[] = []) => {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-chat-handshake': 'npd-mktg-handshake'
        },
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
    const t0 = Date.now();
    try {
      isGeneratingRef.current = true;
      if (!ambient) setState('processing');
      dbg(`📡 Gọi /api/slide (ambient=${ambient})…`);

      // Mở luồng giọng nói TỨC THÌ nếu voiceOn = true
      if (voiceOn) {
        streamChatForVoice(text);
      }

      const res = await fetch('/api/slide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Gửi cờ ambient để server áp CỔNG TIN CẬY (chỉ tạo slide khi RAG đủ điểm hoặc khớp
        // slide tĩnh; câu mơ hồ -> skip). Trước đây bỏ cờ này vì server skip quá gắt + mất ảnh,
        // nhưng đã sửa: bỏ luật ép LLM skip (AMBIENT_RULE) nên chủ đề thật luôn có ảnh, chỉ câu
        // mơ hồ/nghe nhầm mới bị bỏ. Kết hợp cổng intent client (scoring) -> 2 lớp lọc slide sai.
        body: JSON.stringify({ message: text, ambient })
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`API ${res.status}: ${body.slice(0, 120) || res.statusText}`);
      }
      const data: SlideData = await res.json();
      const secs = ((Date.now() - t0) / 1000).toFixed(1);

      if (data.skip || !data.speech_text || !data.title || data.title === 'Lỗi hiển thị' || data.title.includes('Lỗi hiển thị')) {
        dbg(`⚪ Server SKIP sau ${secs}s — ${(data as any).reason || `title="${data.title || ''}"`}`);
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

      const nImgs = (data.image_urls?.length ?? (data.image_url ? 1 : 0));
      dbg(`🖼 Slide OK sau ${secs}s — "${data.title}", ${nImgs} ảnh, layout: ${data.layout_type || 'mặc định'}`);

      if (!data.layout_type) data.layout_type = 'split_image_right';
      setBrokenImages({});
      setSlideKey(k => k + 1);
      setSlide(data);

      if (voiceOn) {
        // Đã được đọc bởi streamChatForVoice, không đọc lại data.speech_text nữa
        // Chỉ lưu lại text để hiển thị hoặc xử lý sau nếu cần
      } else {
        setState('listening');
        setTranscript("🎙️ Ny'ah đang lắng nghe bạn...");
        startListening();
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      dbg(`🔴 LỖI sau ${((Date.now() - t0) / 1000).toFixed(1)}s: ${msg}`);
      // Hien loi that len thanh transcript (thay vi im lang gia vo nghe tiep)
      setTranscript(`⚠️ Lỗi tạo slide: ${msg.slice(0, 90)} — vẫn đang nghe…`);
      if (ambient || isListeningLoopActive.current) {
        setState('listening');
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
      '/images/01_NyAh-PhuDinh/vi_tri/duong_di/18_phut_den_quan_1_chi_tiet.jpg',
      '/images/01_NyAh-PhuDinh/vi_tri/duong_di/vi_tri.jpg',
      '/images/01_NyAh-PhuDinh/tien_ich/cong_vien/nyah-phu-dinh_cong-vien.png',
      '/images/01_NyAh-PhuDinh/mat_bang/cosmo-gen-2_cau-truc-1-2-3.jpg',
      '/images/01_NyAh-PhuDinh/mat_bang/fusion-gen-5_cau-truc-1-2-3.jpg',
      '/images/01_NyAh-PhuDinh/mat_bang/opus_cau-truc-1-2-3.jpg',
      '/images/01_NyAh-PhuDinh/noi_that/opus/opus_tong-quan.jpg',
      '/images/01_NyAh-PhuDinh/noi_that/opus/bep/opus_bep.jpg',
      '/images/01_NyAh-PhuDinh/noi_that/opus/phong_ngu/opus_phong-ngu-1.jpg',
      '/images/01_NyAh-PhuDinh/noi_that/opus/phong_ngu/opus_phong-ngu-master.jpg',
      '/images/01_NyAh-PhuDinh/noi_that/opus/wc/opus_wc.jpg',
      '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_tong-quan.jpg',
      '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/bep/cosmo-gen-2_bep.png',
      '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/gara/cosmo-gen-2_gara.png',
      '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/phong_khach/cosmo-gen-2_phong-khach.png',
      '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/phong_ngu/cosmo-gen-2_noi-that-ngu-master.png',
      '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/phong_ngu/cosmo-gen-2_phong-ngu-con-2.png',
      '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/wc/cosmo-gen-2_wc.png',
      '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_tong-quan.jpg',
      '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/gara/fusion-gen-5_gara.png',
      '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/phong_khach/fusion-gen-5_phong-khach.png',
      '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/phong_ngu/fusion-gen-5_master-bedroom.png',
      '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/phong_ngu/fusion-gen-5_phong-hoc.png',
      '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/phong_ngu/fusion-gen-5_phong-ngu-con.png',
      '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/tang-2/fusion-gen-5_tang-2.png',
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
          {/* Khong dung tracking-tight o day: tracking tinh theo em, o co chu toi 190px
              no co moi cap chu lai ~5px — qua nhieu voi chu hoa dam co dau tieng Viet,
              lam dau (mu, moc, nang) bi de len chu ben canh. */}
          <h1 className="uppercase font-black leading-[1.5] tracking-[0.05em]">
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
        .line-mask { overflow: hidden; padding: 0.25em 0 0.2em; margin: -0.25em 0 -0.2em; }
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
        /* Doi noi dung o transcript (lang nghe <-> nguoi ta dang noi ve) truot len + hien dan */
        .transcript-swap { animation: swapIn .38s cubic-bezier(.22,1,.36,1) both; }
        @keyframes swapIn { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: translateY(0); } }
        /* Chot an toan: trinh duyet khong chay animation -> ep hien noi dung (JS gan class nay) */
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

      {/* DEBUG HUD — chi hien khi mo /slide?debug=1 */}
      {debugOn && (
        <div className="fixed top-2 left-2 z-[70] w-[420px] max-w-[92vw] rounded-xl bg-black/85 text-white p-3 font-mono text-[11px] leading-relaxed shadow-2xl">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-bold text-[#A8D94A]">🔧 DEBUG</span>
            <span>
              state: <b className="text-amber-300">{state}</b>
              {' · '}voice: <b className="text-amber-300">{voiceOn ? 'ON' : 'OFF'}</b>
              {' · '}slide: <b className="text-amber-300">{slide ? 'CÓ' : 'CHƯA'}</b>
            </span>
          </div>
          {errorMsg && <div className="text-red-400 font-bold mb-1">⛔ {errorMsg}</div>}
          <div className="max-h-[38vh] overflow-y-auto space-y-0.5">
            {debugLog.length === 0 && <div className="text-white/50">Chưa có sự kiện — bấm mic và nói thử…</div>}
            {debugLog.map((l, i) => <div key={i} className={i === 0 ? 'text-white' : 'text-white/60'}>{l}</div>)}
          </div>
        </div>
      )}

      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="dots absolute top-[8%] right-[5%] w-44 h-28 opacity-70" />
        <div className="absolute -top-[10vh] -left-[10vh] w-[26vw] h-[26vw] rounded-full bg-[#E3F0E3]" />
        <div className="absolute top-[17%] -right-16 w-[18vw] h-[18vw] rounded-full border-[3px] border-[#2E9E5B]/20" />
        {/* Vòng tròn dưới-trái + chấm bi nhỏ đè LÊN TRÊN, sát mép dưới (render sau = nằm trên) */}
        <div className="absolute bottom-[13%] -left-10 w-[12vw] h-[12vw] rounded-full border-2 border-[#2E9E5B]/15" />
        <div className="dots absolute bottom-[6%] left-[3.5%] w-20 h-28 opacity-60" />
      </div>

      <header className={`relative z-10 px-[5vw] pt-[2vh] pb-[1vh] flex items-center justify-between shrink-0 transition-opacity duration-300 ${slide ? 'opacity-0 pointer-events-none' : ''}`}>
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

      <main ref={mainRef} className="relative z-10 flex-1 min-h-0 flex flex-col">
        {renderSlideBody()}
      </main>

      {/* Marquee slogan đã BỎ theo yêu cầu (chạy chạy gây rối khi trình chiếu) */}
      <footer className="relative z-10 px-[4vw] py-[1.2vh] flex items-center justify-center gap-3 shrink-0">
        <div
          key={topicLabel ? `t:${topicLabel}` : `s:${state}`}
          className={`transcript-swap flex-1 max-w-[52vw] min-w-0 flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-white border font-medium transition-colors text-[clamp(11px,1.2vw,17px)] ${
            topicLabel ? 'border-[#2E9E5B]/60 justify-start' : `justify-center ${state === 'processing' ? 'border-amber-300' : state === 'listening' ? 'border-[#2E9E5B]/50' : 'border-black/10'}`
          }`}
        >
          {topicLabel ? (
            <>
              <span className="flex items-end gap-0.5 h-4 shrink-0" aria-hidden>
                <span className="w-0.5 bg-[#2E9E5B] rounded-full animate-sound-wave" style={{ height: '40%', animationDelay: '0ms' }} />
                <span className="w-0.5 bg-[#2E9E5B] rounded-full animate-sound-wave" style={{ height: '100%', animationDelay: '150ms' }} />
                <span className="w-0.5 bg-[#2E9E5B] rounded-full animate-sound-wave" style={{ height: '60%', animationDelay: '300ms' }} />
              </span>
              <span className="shrink-0 text-neutral-500">Nội dung nói:</span>
              <span className="font-bold text-[#0E5A34] truncate">“{heardText || topicLabel}”</span>
              {heardText && (
                <span className="shrink-0 px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-500 text-[10px] uppercase font-bold whitespace-nowrap ml-auto">
                  {topicLabel}
                </span>
              )}
            </>
          ) : (
            <>
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
              {errorMsg
                ? <span className="truncate text-red-600 font-semibold">⚠️ {errorMsg}</span>
                : <span className="truncate text-neutral-600">{transcript}</span>}
            </>
          )}
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
