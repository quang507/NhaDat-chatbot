'use client';

// TRANG DEMO LAYOUT SLIDE — duyệt thiết kế TRƯỚC khi port sang trang /slide thật.
// - Toggle DỌC (9:16, màn 75-85" đứng) / NGANG (16:9 desktop, split layout chữ trái ảnh phải)
// - Nhiều ảnh -> Carousel 3D Stack kiểu Apple: ảnh active nhỏ lại, trượt sang trái,
//   chìm ra sau; ảnh kế lớn lên, tiến ra trước. Tự chạy mỗi 4.2s.
// - Bo góc squircle Apple (rounded 28-40px), ảnh object-contain không crop.
// - Bấm vào khung để chạy lại toàn bộ animation.

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

type Orient = 'landscape' | 'portrait';
type Mode = 'portrait' | 'landscape';
interface DemoImg { src: string; orient: Orient; }
interface DemoCase {
  id: string;
  label: string;
  title: string;
  highlight?: string;
  points: string[];
  speech: string;
  images: DemoImg[];
}

// ẢNH THẬT từ thư viện public/images — hướng ghi đúng theo kích thước file thật
// (đã quét naturalWidth/naturalHeight toàn bộ 183 ảnh: 123 ngang, 60 dọc)
const BEP_COSMO = '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/bep/cosmo-gen-2_bep.png';                      // 1920x1080 NGANG
const CONG_VAO = '/images/01_NyAh-PhuDinh/tien_ich/cong_vao/tien-ich-1.jpg';                                    // 1920x1080 NGANG
const TIEN_DO = '/images/01_NyAh-PhuDinh/tien_do/xay_dung/thang_05-2026-1-jpg.jpg';                             // 1623x1080 NGANG
const MAP_18P = '/images/01_NyAh-PhuDinh/vi_tri/duong_di/18_phut_den_quan_1_chi_tiet.jpg';                      // 1728x1080 NGANG
const THANG_XOAN = '/images/01_NyAh-PhuDinh/noi_that/thang_xoan/thang-xoan.jpg';                                // 720x1080 DỌC
const PK_FUSION = '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/phong_khach/fusion-gen-5_phong-khach.png';     // 945x1080 DỌC
const PK_COSMO = '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/phong_khach/cosmo-gen-2_phong-khach.png';        // 887x1080 DỌC
const PHAN_LO = '/images/01_NyAh-PhuDinh/mat_bang/ban-do-phan-lo-dien-tich.jpg';                                // 1449x2048 DỌC
const PK_SIGNATURE = '/images/01_NyAh-PhuDinh/noi_that/signature_by_codinachs/phong-khach-01.jpg';              // 1707x2048 DỌC
const KHUON_VIEN = '/images/01_NyAh-PhuDinh/tien_ich/lanscape-khuon-vien-anh-chup/enscape_2021-08-09-14-00-56.jpg'; // 1707x2048 DỌC
const MAT_TIEN_FUSION = '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_mat-tien.jpg';              // 1447x2048 DỌC

const SLOGAN = 'Sống đẹp hơn chung cư — Sinh lời hơn thổ cư';

const CASES: DemoCase[] = [
  {
    id: '1-ngang', label: '1 ảnh — NGANG', title: 'Bếp và phòng ăn',
    points: ['Đảo bếp kiêm quầy bar', 'Tủ lạnh side by side, máy rửa chén'],
    speech: 'Gian bếp mở với đảo bar là nơi cả nhà quây quần mỗi ngày ạ.',
    images: [{ src: BEP_COSMO, orient: 'landscape' }],
  },
  {
    id: '1-doc', label: '1 ảnh — DỌC', title: 'Thang xoắn biến hóa',
    points: ['Giải phóng không gian từng tầng', 'Điểm nhấn kiến trúc độc bản'],
    speech: 'Thang xoắn biến hóa là chữ ký thiết kế riêng của Nhã Đạt.',
    images: [{ src: THANG_XOAN, orient: 'portrait' }],
  },
  {
    id: '2-ngang', label: '2 ảnh — cùng NGANG (carousel)', title: 'Tiện ích và tiến độ',
    points: ['Cổng chính tự động, compound biệt lập', 'Tiến độ xây dựng cập nhật tháng 5'],
    speech: 'Khu compound đã hoàn thiện cổng chào và đang xây đúng tiến độ ạ.',
    images: [{ src: CONG_VAO, orient: 'landscape' }, { src: TIEN_DO, orient: 'landscape' }],
  },
  {
    id: '2-doc', label: '2 ảnh — cùng DỌC (carousel)', title: 'Hai phong cách phòng khách',
    points: ['Fusion Gen 5 — thông tầng siêu sáng', 'Cosmo Gen 2 — mặt tiền 5 mét'],
    speech: 'Anh chị so sánh trực tiếp hai mẫu phòng khách được yêu thích nhất.',
    images: [{ src: PK_FUSION, orient: 'portrait' }, { src: PK_COSMO, orient: 'portrait' }],
  },
  {
    id: '2-tron', label: '2 ảnh — TRỘN (carousel)', title: 'Vị trí và phân lô',
    points: ['Bản đồ phân lô kèm diện tích từng căn', 'Chỉ 18 phút về Quận 1'],
    speech: 'Sơ đồ phân lô chi tiết và đường về Quận 1 chỉ 18 phút ạ.',
    images: [{ src: PHAN_LO, orient: 'portrait' }, { src: MAP_18P, orient: 'landscape' }],
  },
  {
    id: '3-ngang', label: '3 ảnh — cùng NGANG (carousel)', title: 'Một vòng dự án',
    points: ['Cổng vào — Bếp mẫu — Công trường thật'],
    speech: 'Ba góc nhìn từ tiện ích, nhà mẫu đến tiến độ thi công thực tế.',
    images: [
      { src: CONG_VAO, orient: 'landscape' },
      { src: BEP_COSMO, orient: 'landscape' },
      { src: TIEN_DO, orient: 'landscape' },
    ],
  },
  {
    id: '3-doc', label: '3 ảnh — cùng DỌC (carousel)', title: 'Ba chất sống Ny’ah',
    points: ['Thang xoắn — Khuôn viên xanh — Signature'],
    speech: 'Từ kiến trúc, cảnh quan đến nội thất, góc nào cũng đáng sống.',
    images: [
      { src: THANG_XOAN, orient: 'portrait' },
      { src: KHUON_VIEN, orient: 'portrait' },
      { src: PK_SIGNATURE, orient: 'portrait' },
    ],
  },
  {
    id: '3-tron', label: '3 ảnh — TRỘN (carousel)', title: 'Tổng quan Fusion Gen 5',
    points: ['Vị trí — Mặt tiền — Gian bếp'],
    speech: 'Kết nối giao thông, mặt tiền và gian bếp của mẫu Fusion ạ.',
    images: [
      { src: MAP_18P, orient: 'landscape' },
      { src: MAT_TIEN_FUSION, orient: 'portrait' },
      { src: BEP_COSMO, orient: 'landscape' },
    ],
  },
  {
    id: '0-anh', label: 'KHÔNG ảnh — chỉ text', title: 'Chính sách thanh toán',
    highlight: '3%/tháng',
    points: ['Đặt cọc 10%, mỗi tháng chỉ 3%', 'Bàn giao 8%, sang tên 61%', 'BIDV & Vietcombank cho vay 50%'],
    speech: 'Anh chị chỉ cần đóng 3 phần trăm mỗi tháng cho đến khi nhận nhà.',
    images: [],
  },
];

// 1 dòng chữ trượt từ dưới lên trong "mặt nạ", lóe sáng rồi mờ dần (giống trang thật)
const Line = ({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) => (
  <span className="line-mask block">
    <span className={`line-in block ${className}`} style={{ animationDelay: `${delay}ms` }}>{children}</span>
  </span>
);

const splitTitle = (t: string): [string, string] => {
  const w = t.trim().split(/\s+/);
  if (w.length <= 2) return [w.join(' '), ''];
  const cut = Math.ceil(w.length / 2);
  return [w.slice(0, cut).join(' '), w.slice(cut).join(' ')];
};

// ===== CAROUSEL 3D STACK kiểu Apple =====
// Ảnh active: nhỏ lại + trượt sang TRÁI + chìm ra sau (mờ dần).
// Ảnh kế: từ sau tiến ra trước, lớn dần. Tự chạy mỗi 4.2s sau khi entrance xong.
function Stack3D({ images, className = '', delayIn = 550 }: { images: DemoImg[]; className?: string; delayIn?: number }) {
  const n = images.length;
  const [active, setActive] = useState(0);
  const prevActiveRef = useRef(0);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), delayIn + 1100);
    return () => clearTimeout(t);
  }, [delayIn]);

  useEffect(() => {
    if (!entered || n < 2) return;
    const iv = setInterval(() => {
      setActive(a => { prevActiveRef.current = a; return (a + 1) % n; });
    }, 4200);
    return () => clearInterval(iv);
  }, [entered, n]);

  const styleFor = (idx: number): React.CSSProperties => {
    const off = (idx - active + n) % n;
    const prevOff = (idx - prevActiveRef.current + n) % n;
    // Thẻ từ "slot tái chế" (ẩn bên trái) quay lại deck -> dịch chuyển TỨC THÌ, không animate
    const recycling = n >= 3 && prevOff === n - 1 && off !== n - 1;
    const base: React.CSSProperties = {
      transition: recycling
        ? 'none'
        : 'transform .8s cubic-bezier(.32,.72,.35,1), opacity .8s ease, filter .8s ease',
    };
    if (n === 2) {
      // 2 ảnh: hoán đổi chiều sâu (trước lùi ra sau, sau tiến ra trước)
      return off === 0
        ? { ...base, transform: 'translateX(0) translateY(0) scale(1)', zIndex: 20, opacity: 1, filter: 'brightness(1)' }
        : { ...base, transform: 'translateX(6%) translateY(3.5%) scale(.9)', zIndex: 10, opacity: .85, filter: 'brightness(.92)' };
    }
    if (off === 0) {
      return { ...base, transform: 'translateX(0) translateY(0) scale(1)', zIndex: 30, opacity: 1, filter: 'brightness(1)' };
    }
    if (off === n - 1) {
      // Active cũ: nhỏ lại, trượt sang trái, chìm ra sau
      return { ...base, transform: 'translateX(-110%) translateY(0) scale(.9)', zIndex: 5, opacity: 0, filter: 'brightness(.9)' };
    }
    // Các thẻ chờ phía sau, hé mép bên phải
    const k = off - 1;
    return {
      ...base,
      transform: `translateX(${6 + k * 5}%) translateY(${3.5 + k * 2}%) scale(${0.9 - k * 0.06})`,
      zIndex: 20 - k,
      opacity: Math.max(0.55, 0.85 - k * 0.2),
      filter: 'brightness(.92)',
    };
  };

  return (
    <div className={`img-card relative ${className}`} style={{ animationDelay: `${delayIn}ms` }}>
      {images.map((im, idx) => (
        <div
          key={im.src + idx}
          className="absolute inset-0 rounded-[28px] md:rounded-[32px] overflow-hidden bg-white border border-black/[0.06] shadow-[0_24px_60px_-24px_rgba(14,90,52,0.45)]"
          style={styleFor(idx)}
        >
          <img src={im.src} alt="" className="w-full h-full object-contain" />
        </div>
      ))}
      {/* Chấm chỉ báo */}
      {n > 1 && (
        <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-40">
          {images.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-500 ${i === active ? 'w-5 bg-[#2E9E5B]' : 'w-1.5 bg-black/20'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Khối ảnh: 1 ảnh -> thẻ đơn theo hướng; nhiều ảnh -> Carousel 3D Stack
function ImagesBlock({ images, mode }: { images: DemoImg[]; mode: Mode }) {
  if (images.length === 0) return null;

  if (images.length === 1) {
    const one = images[0];
    const single = (cls: string) => (
      <div
        className={`img-card relative rounded-[28px] md:rounded-[32px] overflow-hidden bg-white border border-black/[0.06] shadow-[0_24px_60px_-24px_rgba(14,90,52,0.35)] ${cls}`}
        style={{ animationDelay: '550ms' }}
      >
        <img src={one.src} alt="" className="w-full h-full object-contain" />
      </div>
    );
    if (mode === 'landscape') return <div className="h-full flex items-center justify-center">{single('h-[92%] w-full')}</div>;
    return one.orient === 'portrait'
      ? <div className="flex justify-center min-h-0">{single('h-[300px] w-[74%]')}</div>
      : single('h-[200px] w-full');
  }

  // Nhiều ảnh: KHÔNG trải lưới nữa — 1 khung carousel duy nhất, ảnh tự luân chuyển 3D
  return mode === 'landscape'
    ? <div className="h-full py-1 pr-1"><Stack3D images={images} className="h-[94%] w-full" /></div>
    : <Stack3D images={images} className="h-[290px] w-full" />;
}

// 1 khung slide hoàn chỉnh — mode 'portrait' (xếp dọc) hoặc 'landscape' (chia đôi chữ|ảnh)
function SlideFrame({ c, mode, replayKey }: { c: DemoCase; mode: Mode; replayKey: number }) {
  const [t1, t2] = splitTitle(c.title);
  const speechLines = c.speech.match(/[^.!?…]+[.!?…]?/g)?.map(s => s.trim()).filter(Boolean) || [];

  const TextParts = (
    <>
      <div className="shrink-0">
        <Line delay={60}>
          <span className="inline-flex px-2.5 py-1 rounded-full bg-[#E3F0E3] text-[#0E5A34] font-bold tracking-[0.18em] uppercase text-[8px]">Ny&apos;ah Phú Định</span>
        </Line>
        <h2 className="mt-1.5 uppercase font-black leading-[0.98] tracking-tight">
          <Line delay={180} className="text-[#2E9E5B] text-[24px]">{t1}</Line>
          {t2 && <Line delay={330} className="text-[#161616] text-[28px]">{t2}</Line>}
        </h2>
        {c.highlight && (
          <Line delay={470} className="mt-0.5 font-black leading-none text-transparent text-[32px]">
            <span style={{ WebkitTextStroke: '2px #2E9E5B' }}>{c.highlight}</span>
          </Line>
        )}
      </div>
      <ul className="shrink-0 space-y-1.5">
        {c.points.map((p, i) => (
          <li key={i} className="line-mask">
            <span className="line-in flex items-start gap-2 text-neutral-800 font-medium leading-snug text-[12px]" style={{ animationDelay: `${1000 + i * 160}ms` }}>
              <span className="mt-[0.45em] w-1.5 h-1.5 rounded-full bg-[#2E9E5B] shrink-0" />
              <span>{p}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-auto shrink-0 border-l-[3px] border-[#2E9E5B] pl-2.5 pb-1">
        {speechLines.map((ln, i) => (
          <Line key={i} delay={1350 + i * 200} className="text-neutral-500 italic font-light leading-relaxed text-[10px]">{ln}</Line>
        ))}
      </div>
    </>
  );

  return (
    <div key={replayKey} className="relative w-full h-full flex flex-col bg-[#F5F3EC] text-[#161616] overflow-hidden">
      {/* trang trí */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="dots absolute top-[7%] right-[5%] w-24 h-16 opacity-70" />
        <div className="dots absolute top-[48%] left-[3%] w-14 h-24 opacity-60" />
        <div className="absolute -top-14 -left-14 w-40 h-40 rounded-full bg-[#E3F0E3]" />
        <div className="absolute top-[16%] -right-10 w-32 h-32 rounded-full border-[3px] border-[#2E9E5B]/20" />
      </div>

      {/* header */}
      <div className="relative z-10 px-5 pt-4 pb-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-xl overflow-hidden bg-white shadow border border-black/5 flex items-center justify-center shrink-0">
            <img src="/logo.svg" alt="" className="w-[82%] h-[82%] object-contain" />
          </span>
          <div>
            <p className="font-black tracking-tight leading-none text-[13px]">NY&apos;AH PHÚ ĐỊNH</p>
            <p className="text-neutral-500 font-semibold tracking-[0.2em] uppercase mt-0.5 text-[7px]">A development by Nhã Đạt</p>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-full bg-[#E3F0E3] text-[#0E5A34] border border-[#2E9E5B]/30 font-bold uppercase text-[8px]">Đang nghe</span>
      </div>

      {/* thân slide: dọc = xếp đứng; ngang = chữ trái | ảnh phải */}
      {mode === 'portrait' ? (
        <div className="relative z-10 flex-1 min-h-0 px-5 flex flex-col gap-3 py-1">
          <div className="shrink-0 flex flex-col gap-3">{TextParts}</div>
          <div className="order-none -mt-1">
            <ImagesBlock images={c.images} mode={mode} />
          </div>
        </div>
      ) : (
        <div className="relative z-10 flex-1 min-h-0 px-5 py-2 flex flex-row gap-5">
          <div className="w-[42%] min-h-0 flex flex-col gap-3">{TextParts}</div>
          <div className="flex-1 min-h-0">
            <ImagesBlock images={c.images} mode={mode} />
          </div>
        </div>
      )}

      {/* marquee */}
      <div className="relative z-10 shrink-0 overflow-hidden bg-[#0E5A34] py-1.5">
        <div className="marquee-track flex w-max items-center gap-6 whitespace-nowrap font-black uppercase tracking-wider text-[#F5F3EC] text-[10px]">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="flex items-center gap-6">
              <span>{SLOGAN}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#A8D94A] inline-block" />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SlideDemoPage() {
  const [mode, setMode] = useState<Mode>('portrait');
  const [replays, setReplays] = useState<Record<string, number>>({});
  const replay = (id: string) => setReplays(r => ({ ...r, [id]: (r[id] || 0) + 1 }));

  return (
    <div className="min-h-screen bg-[#0E1512] text-white p-8" style={{ fontFamily: "'Be Vietnam Pro', 'Inter', system-ui, sans-serif" }}>
      <style dangerouslySetInnerHTML={{ __html: `
        .dots { background-image: radial-gradient(rgba(22,22,22,.28) 1.4px, transparent 1.4px); background-size: 13px 13px; }
        .line-mask { overflow: hidden; padding: 0.14em 0 0.2em; margin: -0.14em 0 -0.2em; }
        .line-in { animation: lineUp .7s cubic-bezier(.22,1,.36,1) both, glowFade 1.15s ease-out both; will-change: transform, opacity; }
        @keyframes lineUp { 0% { transform: translateY(140%); opacity: 0; } 55% { opacity: 1; } 100% { transform: translateY(0); opacity: 1; } }
        @keyframes glowFade { 0% { text-shadow: 0 0 16px rgba(255,255,255,.95), 0 4px 28px rgba(46,158,91,.45); } 100% { text-shadow: 0 0 0 rgba(255,255,255,0), 0 0 0 rgba(46,158,91,0); } }
        .img-card { animation: imgIn .85s cubic-bezier(.22,1,.36,1) both; will-change: transform, opacity; }
        @keyframes imgIn { 0% { opacity: 0; transform: translateY(22px) scale(.965); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        .marquee-track { animation: marquee 26s linear infinite; }
        @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      ` }} />

      <div className="max-w-[1560px] mx-auto">
        <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Demo Slide — Carousel 3D Stack + Responsive</h1>
            <p className="text-neutral-400 mt-1 text-sm">
              Nhiều ảnh = carousel 3D tự chạy (active trượt trái → ra sau, ảnh kế tiến lên). <strong className="text-[#A8D94A]">Bấm vào khung để chạy lại animation.</strong>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-full bg-white/10 p-1">
              <button
                onClick={() => setMode('portrait')}
                className={`px-4 py-1.5 rounded-full text-sm font-bold transition ${mode === 'portrait' ? 'bg-[#2E9E5B] text-white' : 'text-neutral-300 hover:text-white'}`}
              >
                Dọc 9:16
              </button>
              <button
                onClick={() => setMode('landscape')}
                className={`px-4 py-1.5 rounded-full text-sm font-bold transition ${mode === 'landscape' ? 'bg-[#2E9E5B] text-white' : 'text-neutral-300 hover:text-white'}`}
              >
                Ngang 16:9
              </button>
            </div>
            <Link href="/slide" className="px-4 py-2 rounded-full bg-white/10 text-white font-bold text-sm hover:bg-white/20 transition">← Trang Slide thật</Link>
          </div>
        </div>

        <div className={mode === 'portrait' ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-8' : 'grid grid-cols-1 lg:grid-cols-2 gap-8'}>
          {CASES.map(c => (
            <div key={c.id + mode}>
              <p className="mb-2 font-bold text-[#A8D94A] text-sm uppercase tracking-wider">{c.label}</p>
              <div
                className={`${mode === 'portrait' ? 'aspect-[9/16]' : 'aspect-[16/9]'} rounded-[36px] overflow-hidden shadow-2xl ring-1 ring-white/10 cursor-pointer hover:ring-[#2E9E5B]/60 transition`}
                title="Bấm để chạy lại animation"
                onClick={() => replay(c.id)}
              >
                <SlideFrame c={c} mode={mode} replayKey={(replays[c.id] || 0) + (mode === 'portrait' ? 0 : 1000)} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
