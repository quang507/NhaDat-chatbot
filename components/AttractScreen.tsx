'use client';

// Màn chờ (attract screen) tách từ app/slide/page.tsx (P1.4): slideshow ảnh dự
// án chạy chậm phía sau - showroom phải khoe nhà ngay cả lúc nghỉ. Giao diện
// giữ NGUYÊN như bản cũ, chỉ đổi chỗ ở.

import React, { useEffect, useState } from 'react';

const IDLE_PHOTOS = [
  "/images/01_NyAh-PhuDinh/ny'ah-phu-dinh-tong-quan-1.jpg",
  "/images/01_NyAh-PhuDinh/ny'ah-phu-dinh-tong-quan-4.jpg",
  "/images/01_NyAh-PhuDinh/ny'ah-phu-dinh-tong-quan-7.jpg",
  '/images/01_NyAh-PhuDinh/tien_ich/cong_vien/nyah-phu-dinh_cong-vien.png',
  "/images/01_NyAh-PhuDinh/ny'ah-phu-dinh-tong-quan-10.jpg",
];

const Line = ({ children, delay = 0, className = '' }: {
  children: React.ReactNode; delay?: number; className?: string;
}) => (
  <span className="line-mask block">
    <span className={`line-in block ${className}`} style={{ animationDelay: `${delay}ms` }}>{children}</span>
  </span>
);

export function AttractScreen() {
  const [idleIdx, setIdleIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdleIdx(i => (i + 1) % IDLE_PHOTOS.length), 7000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex-1 relative overflow-hidden flex flex-col items-center justify-center text-center gap-[2.5vh] px-[5vw]">
      <div aria-hidden className="absolute inset-0">
        {IDLE_PHOTOS.map((src, i) => (
          <img
            key={src} src={src} alt=""
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-[2000ms] ease-out ${
              i === idleIdx ? 'opacity-100 animate-ken-burns' : 'opacity-0'
            }`}
          />
        ))}
        <div className="absolute inset-0 bg-black/55" />
      </div>
      <div className="relative z-10">
        <Line delay={100}>
          <span className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-white/15 backdrop-blur text-white/90 font-bold tracking-[0.2em] uppercase text-[clamp(11px,1.2vw,17px)]">
            Smart Showroom · Nhã Đạt
          </span>
        </Line>
        {/* Khong dung tracking-tight: tracking tinh theo em, chu hoa dam co dau
            tieng Viet se bi dau (mu, moc, nang) de len chu ben canh. */}
        <h1 className="uppercase font-black leading-[1.5] tracking-[0.05em] mt-[2vh]">
          <Line delay={240} className="text-[#A8D94A] text-[clamp(44px,9vw,150px)] drop-shadow-[0_4px_24px_rgba(0,0,0,0.5)]">Ny&apos;ah</Line>
          <Line delay={400} className="text-white text-[clamp(52px,11vw,190px)] drop-shadow-[0_4px_24px_rgba(0,0,0,0.5)]">Phú Định</Line>
        </h1>
        <Line delay={580} className="text-white/80 text-[clamp(15px,2vw,28px)] max-w-[78%] mx-auto leading-relaxed mt-[2vh]">
          Chạm nút micro - slide sẽ tự hiện theo câu chuyện của bạn.
        </Line>
      </div>
    </div>
  );
}
