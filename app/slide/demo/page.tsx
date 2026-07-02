'use client';

// TRANG DEMO LAYOUT SLIDE — xem đủ MỌI trường hợp ảnh/chữ trên 1 trang.
// Mỗi khung là 1 màn 85" dọc (tỉ lệ 9:16). Bấm vào khung để chạy lại animation.
// Dùng đúng CSS/animation của trang /slide thật (lineUp, glowFade, imgIn, marquee)
// nhưng ép sẵn hướng ảnh (ngang/dọc) cho từng case để chắc chắn hiện đủ tổ hợp.

import React, { useState } from 'react';
import Link from 'next/link';

type Orient = 'landscape' | 'portrait';
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

const IMG_A = '/images/01_NyAh-PhuDinh/phoi_canh/nyah-phu-dinh_phoi-canh-phong-khach.png';
const IMG_B = '/images/01_NyAh-PhuDinh/mat_bang/nyah-phu-ding_mat-bang-tang-1.jpg';
const IMG_C = '/images/01_NyAh-PhuDinh/noi_that/opus/opus_bep.jpg';

const SLOGAN = 'Sống đẹp hơn chung cư — Sinh lời hơn thổ cư';

const CASES: DemoCase[] = [
  {
    id: '1-ngang', label: '1 ảnh — NGANG', title: 'Mặt bằng tầng trệt',
    points: ['Garage trong nhà, cửa cuốn tự động', 'Thông tầng trần cao, siêu sáng'],
    speech: 'Tầng trệt có garage riêng và phòng khách thông tầng rất thoáng ạ.',
    images: [{ src: IMG_B, orient: 'landscape' }],
  },
  {
    id: '1-doc', label: '1 ảnh — DỌC', title: 'Phối cảnh phòng khách',
    points: ['Trần cao 5.8m nhìn lên lửng', 'Ánh sáng trực tiếp từ giếng trời'],
    speech: 'Phòng khách thông tầng là điểm nhấn đắt giá nhất của căn nhà.',
    images: [{ src: IMG_A, orient: 'portrait' }],
  },
  {
    id: '2-ngang', label: '2 ảnh — cùng NGANG', title: 'Mặt bằng hai tầng',
    points: ['Tầng trệt: garage + khách', 'Tầng 2: bếp, bar và phòng ăn'],
    speech: 'Hai tầng dưới được bố trí trọn vẹn cho sinh hoạt chung ạ.',
    images: [{ src: IMG_B, orient: 'landscape' }, { src: IMG_C, orient: 'landscape' }],
  },
  {
    id: '2-doc', label: '2 ảnh — cùng DỌC', title: 'Không gian sống',
    points: ['Phòng khách thông tầng', 'Bếp mở với đảo bar'],
    speech: 'Mỗi không gian đều có ánh sáng tự nhiên trực tiếp.',
    images: [{ src: IMG_A, orient: 'portrait' }, { src: IMG_C, orient: 'portrait' }],
  },
  {
    id: '2-tron', label: '2 ảnh — TRỘN (dọc + ngang)', title: 'Thiết kế và mặt bằng',
    points: ['Phối cảnh thực tế bàn giao', 'Mặt bằng công năng từng tầng'],
    speech: 'Anh chị xem phối cảnh bên trái và mặt bằng chi tiết bên phải ạ.',
    images: [{ src: IMG_A, orient: 'portrait' }, { src: IMG_B, orient: 'landscape' }],
  },
  {
    id: '3-ngang', label: '3 ảnh — cùng NGANG', title: 'Mặt bằng ba tầng',
    points: ['Trệt, lửng và lầu 1 liền mạch'],
    speech: 'Ba tầng dưới xếp chồng để anh chị dễ hình dung luồng di chuyển.',
    images: [
      { src: IMG_B, orient: 'landscape' },
      { src: IMG_C, orient: 'landscape' },
      { src: IMG_B, orient: 'landscape' },
    ],
  },
  {
    id: '3-doc', label: '3 ảnh — cùng DỌC', title: 'Ba góc nội thất',
    points: ['Khách — Bếp — Phòng ngủ master'],
    speech: 'Ba không gian chính của căn nhà, góc nào cũng có view đẹp.',
    images: [
      { src: IMG_A, orient: 'portrait' },
      { src: IMG_C, orient: 'portrait' },
      { src: IMG_A, orient: 'portrait' },
    ],
  },
  {
    id: '3-tron', label: '3 ảnh — TRỘN', title: 'Tổng quan căn nhà',
    points: ['Ảnh nổi bật + 2 ảnh chi tiết'],
    speech: 'Ảnh lớn là phối cảnh tổng thể, hai ảnh dưới là chi tiết công năng.',
    images: [
      { src: IMG_B, orient: 'landscape' },
      { src: IMG_A, orient: 'portrait' },
      { src: IMG_C, orient: 'landscape' },
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

// Khối ảnh: cùng ma trận layout với trang thật, nhưng hướng ảnh được ÉP theo case
function ImagesBlock({ images }: { images: DemoImg[] }) {
  if (images.length === 0) return null;
  const base = 550;

  const Card = ({ src, delay, className = '' }: { src: string; delay: number; className?: string }) => (
    <div
      className={`img-card relative rounded-2xl overflow-hidden bg-white border border-black/[0.06] shadow-[0_18px_44px_-20px_rgba(14,90,52,0.35)] ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <img src={src} alt="" className="w-full h-full object-contain" />
    </div>
  );

  if (images.length === 1) {
    const one = images[0];
    return one.orient === 'portrait'
      ? <div className="flex justify-center min-h-0"><Card src={one.src} delay={base} className="h-[300px] w-[74%]" /></div>
      : <Card src={one.src} delay={base} className="h-[210px] w-full" />;
  }

  if (images.length === 2) {
    const [a, b] = images;
    if (a.orient === 'portrait' && b.orient === 'portrait') {
      return (
        <div className="grid grid-cols-2 gap-3 h-[270px]">
          <Card src={a.src} delay={base} className="h-full" />
          <Card src={b.src} delay={base + 420} className="h-full" />
        </div>
      );
    }
    if (a.orient === 'landscape' && b.orient === 'landscape') {
      return (
        <div className="grid grid-rows-2 gap-3 h-[310px]">
          <Card src={a.src} delay={base} className="h-full min-h-0" />
          <Card src={b.src} delay={base + 420} className="h-full min-h-0" />
        </div>
      );
    }
    const p = a.orient === 'portrait' ? a : b;
    const l = p === a ? b : a;
    return (
      <div className="grid grid-cols-5 gap-3 h-[280px]">
        <Card src={p.src} delay={base} className="col-span-2 h-full" />
        <div className="col-span-3 flex items-center min-h-0">
          <Card src={l.src} delay={base + 420} className="h-[72%] w-full" />
        </div>
      </div>
    );
  }

  const [a, b, c] = images;
  const allP = images.every(i => i.orient === 'portrait');
  const allL = images.every(i => i.orient === 'landscape');
  if (allP) {
    return (
      <div className="grid grid-cols-3 gap-3 h-[240px]">
        {images.map((im, i) => <Card key={i} src={im.src} delay={base + i * 380} className="h-full" />)}
      </div>
    );
  }
  if (allL) {
    return (
      <div className="grid grid-rows-3 gap-2.5 h-[340px]">
        {images.map((im, i) => <Card key={i} src={im.src} delay={base + i * 380} className="h-full min-h-0" />)}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 min-h-0">
      <Card src={a.src} delay={base} className="h-[180px] w-full" />
      <div className="grid grid-cols-2 gap-3 h-[130px]">
        <Card src={b.src} delay={base + 420} className="h-full" />
        <Card src={c.src} delay={base + 800} className="h-full" />
      </div>
    </div>
  );
}

// 1 khung màn 85" dọc hoàn chỉnh (header + slide + marquee)
function SlideFrame({ c, replayKey }: { c: DemoCase; replayKey: number }) {
  const [t1, t2] = splitTitle(c.title);
  const speechLines = c.speech.match(/[^.!?…]+[.!?…]?/g)?.map(s => s.trim()).filter(Boolean) || [];
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

      {/* thân slide */}
      <div className="relative z-10 flex-1 min-h-0 px-5 flex flex-col gap-3 py-1">
        <div className="shrink-0">
          <Line delay={60}>
            <span className="inline-flex px-2.5 py-1 rounded-full bg-[#E3F0E3] text-[#0E5A34] font-bold tracking-[0.18em] uppercase text-[8px]">Ny&apos;ah Phú Định</span>
          </Line>
          <h2 className="mt-1.5 uppercase font-black leading-[0.98] tracking-tight">
            <Line delay={180} className="text-[#2E9E5B] text-[26px]">{t1}</Line>
            {t2 && <Line delay={330} className="text-[#161616] text-[30px]">{t2}</Line>}
          </h2>
          {c.highlight && (
            <Line delay={470} className="mt-0.5 font-black leading-none text-transparent text-[34px]">
              <span style={{ WebkitTextStroke: '2px #2E9E5B' }}>{c.highlight}</span>
            </Line>
          )}
        </div>

        <ImagesBlock images={c.images} />

        <ul className="shrink-0 space-y-1.5">
          {c.points.map((p, i) => (
            <li key={i} className="line-mask">
              <span className="line-in flex items-start gap-2 text-neutral-800 font-medium leading-snug text-[13px]" style={{ animationDelay: `${1000 + i * 160}ms` }}>
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
      </div>

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
  const [replays, setReplays] = useState<Record<string, number>>({});
  const replay = (id: string) => setReplays(r => ({ ...r, [id]: (r[id] || 0) + 1 }));

  return (
    <div className="min-h-screen bg-[#0E1512] text-white p-8" style={{ fontFamily: "'Be Vietnam Pro', 'Inter', system-ui, sans-serif" }}>
      <style dangerouslySetInnerHTML={{ __html: `
        .dots { background-image: radial-gradient(rgba(22,22,22,.28) 1.4px, transparent 1.4px); background-size: 13px 13px; }
        .line-mask { overflow: hidden; }
        .line-in { animation: lineUp .7s cubic-bezier(.22,1,.36,1) both, glowFade 1.15s ease-out both; will-change: transform, opacity; }
        @keyframes lineUp { 0% { transform: translateY(112%); opacity: 0; } 55% { opacity: 1; } 100% { transform: translateY(0); opacity: 1; } }
        @keyframes glowFade { 0% { text-shadow: 0 0 16px rgba(255,255,255,.95), 0 4px 28px rgba(46,158,91,.45); } 100% { text-shadow: 0 0 0 rgba(255,255,255,0), 0 0 0 rgba(46,158,91,0); } }
        .img-card { animation: imgIn .85s cubic-bezier(.22,1,.36,1) both; will-change: transform, opacity; }
        @keyframes imgIn { 0% { opacity: 0; transform: translateY(22px) scale(.965); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        .marquee-track { animation: marquee 26s linear infinite; }
        @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      ` }} />

      <div className="max-w-[1500px] mx-auto">
        <div className="flex items-end justify-between flex-wrap gap-3 mb-8">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Demo layout Slide — đủ 9 trường hợp</h1>
            <p className="text-neutral-400 mt-1 text-sm">Mỗi khung = màn 85&quot; dọc (9:16). <strong className="text-[#A8D94A]">Bấm vào khung để chạy lại animation.</strong> Hướng ảnh được ép sẵn theo từng case.</p>
          </div>
          <Link href="/slide" className="px-4 py-2 rounded-full bg-[#2E9E5B] text-white font-bold text-sm hover:bg-[#0E5A34] transition">← Về trang Slide thật</Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-8">
          {CASES.map(c => (
            <div key={c.id}>
              <p className="mb-2 font-bold text-[#A8D94A] text-sm uppercase tracking-wider">{c.label}</p>
              <div
                className="aspect-[9/16] rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/10 cursor-pointer hover:ring-[#2E9E5B]/60 transition"
                title="Bấm để chạy lại animation"
                onClick={() => replay(c.id)}
              >
                <SlideFrame c={c} replayKey={replays[c.id] || 0} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
