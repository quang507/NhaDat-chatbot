'use client';

// ============================================================================
// SlideBody — STYLE TỐI THEO FIGMA "Demo layout" (07/2026):
//
//  Nguyên tắc: ẢNH LÀ CHỦ ĐẠO, chữ chỉ điểm xuyết.
//  • Nền: chính ảnh slide phóng to + blur + tối (brightness .35) phủ toàn màn
//    → không còn khung trắng, ảnh "mờ mờ phía sau" như bản Figma.
//  • Nhãn nhỏ tracked ở TRÊN (kiểu "mẫu nhà opus") thay cho block title to.
//  • Text nằm ĐÈ LÊN vùng ảnh, ghim đáy trên gradient đen, cách title một
//    khoảng lớn (~100px trên màn trình chiếu) — title trên / points dưới.
//  • full_background: ảnh tràn màn, toàn bộ chữ đè trực tiếp lên ảnh.
//  • NHIỀU ẢNH: mỗi thời điểm chỉ hiện MỘT ảnh nằm ngang — tự động chuyển
//    lần lượt bằng crossfade, KHÔNG BAO GIỜ xếp ảnh cạnh nhau.
// ============================================================================

import React, { useEffect, useState } from 'react';

// Thời gian hiển thị mỗi ảnh trước khi chuyển sang ảnh kế (ms)
const IMAGE_ROTATE_MS = 4000;

export interface SlideBodyData {
  layout_type?: string;
  title: string;
  points?: string[];
  speech_text?: string;
  image_urls?: string[];
  highlight_number?: string;
  maps_url?: string;
}

export type Orient = 'landscape' | 'portrait';

interface SlideBodyProps {
  data: SlideBodyData;
  orientOf: (src: string) => Orient;
  onImageClick?: (src: string) => void;
  onImageError?: (src: string) => void;
  replayKey?: number | string;
}

const Line = ({ children, delay = 0, className = '' }: {
  children: React.ReactNode; delay?: number; className?: string;
}) => (
  <span className="line-mask block">
    <span className={`line-in block ${className}`} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </span>
  </span>
);

export function SlideBody({ data, orientOf, onImageClick, onImageError, replayKey }: SlideBodyProps) {
  const imgs = (data.image_urls || []).filter(Boolean).slice(0, 3);
  const points = (data.points || []).filter(Boolean);
  const hasImg = imgs.length > 0;
  const isMapImg = (src: string) => src.includes('vi_tri') || src.includes('18_phut');
  const qrUrl = data.maps_url || 'https://maps.app.goo.gl/qwf4XibyMCL9sEX6A';

  // NGUYÊN TẮC: mỗi thời điểm chỉ hiện MỘT ảnh. Nhiều ảnh -> tự chuyển lần
  // lượt (crossfade), KHÔNG xếp cạnh nhau.
  const [imgIdx, setImgIdx] = useState(0);
  const imgsKey = imgs.join('|');
  useEffect(() => {
    setImgIdx(0);
    if (imgs.length <= 1) return;
    const t = setInterval(() => setImgIdx(i => (i + 1) % imgs.length), IMAGE_ROTATE_MS);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgsKey, replayKey]);

  const cur = imgs[Math.min(imgIdx, Math.max(imgs.length - 1, 0))];

  const QrChip = () => (
    <a
      href={qrUrl} target="_blank" rel="noopener noreferrer"
      className="absolute bottom-[2.5cqw] left-[2.5cqw] z-20 bg-white/95 rounded-[1.6cqw] p-[1.2cqw] shadow-lg flex flex-col items-center"
      onClick={e => e.stopPropagation()}
    >
      <img
        src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrUrl)}`}
        alt="QR bản đồ"
        className="w-[8cqw] h-[8cqw] max-w-[92px] max-h-[92px] min-w-[52px] min-h-[52px]"
      />
      <span className="text-[clamp(9px,1.3cqw,14px)] font-bold text-neutral-600 mt-[0.4cqw]">
        Quét bản đồ
      </span>
    </a>
  );

  // Chấm chỉ báo vị trí ảnh khi slide có nhiều ảnh.
  const Dots = () => imgs.length > 1 ? (
    <div className="absolute bottom-[2cqw] right-[3cqw] z-20 flex gap-[1cqw] bg-black/50 backdrop-blur px-[2cqw] py-[1cqw] rounded-full">
      {imgs.map((_, i) => (
        <span
          key={i}
          className={`h-[1.4cqw] min-h-[6px] rounded-full transition-all duration-300 ${
            i === imgIdx ? 'w-[3.5cqw] min-w-[16px] bg-[#A8D94A]' : 'w-[1.4cqw] min-w-[6px] bg-white/40'
          }`}
        />
      ))}
    </div>
  ) : null;

  // Nhãn nhỏ tracked kiểu Figma: "mẫu nhà opus" — lowercase nhẹ nhàng, mờ.
  const TopLabel = ({ delay = 80 }: { delay?: number }) => (
    <Line delay={delay}>
      <span className="inline-block text-white/60 font-semibold tracking-[0.3em] uppercase text-[clamp(9px,1.4cqw,16px)]">
        Ny&apos;ah Phú Định
      </span>
    </Line>
  );

  // Points ghim đáy — mỗi ý 1 dòng, thanh dọc xanh brand trước chữ (như Figma).
  const BottomPoints = ({ startDelay = 700 }: { startDelay?: number }) => (
    <div className="space-y-[1cqw]">
      {points.slice(0, 3).map((p, i) => (
        <Line key={i} delay={startDelay + i * 150}
          className="text-white/95 font-medium leading-snug text-[clamp(13px,2.6cqw,34px)] drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
          <span className="inline-block w-[0.35cqw] min-w-[3px] h-[1em] rounded-full bg-[#A8D94A] mr-[1.4cqw] align-middle" />
          {p}
        </Line>
      ))}
    </div>
  );

  // Nền mờ phía sau: chính ảnh đang hiện blur + tối phủ toàn khung.
  const BlurBackdrop = ({ src }: { src: string }) => (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      <img src={src} alt="" className="w-full h-full object-cover scale-110 blur-2xl brightness-[0.32] saturate-[0.85] transition-opacity duration-1000" />
      <div className="absolute inset-0 bg-black/35" />
    </div>
  );

  // ══════════════ LAYOUT 1: FULL BACKGROUND — chữ đè trực tiếp lên ảnh ═══════
  // Nhiều ảnh: nền tràn màn tự chuyển lần lượt (crossfade) — không thumbnail.
  if (hasImg && (data.layout_type === 'full_background' || !data.layout_type)) {
    return (
      <div style={{ containerType: 'inline-size' }} className="w-full h-full">
        <div key={replayKey} className="relative w-full h-full overflow-hidden bg-[#0C0F0D]">
          <div className="img-card absolute inset-0" style={{ animationDelay: '0ms', borderRadius: 0 }}>
            {imgs.map((src, i) => (
              <img
                key={src} src={src} alt=""
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-out ${
                  i === imgIdx ? 'opacity-100 animate-ken-burns' : 'opacity-0 pointer-events-none'
                }`}
                onError={onImageError ? () => onImageError(src) : undefined}
                onClick={onImageClick && i === imgIdx ? () => onImageClick(src) : undefined}
              />
            ))}
          </div>
          {/* Gradient đen đáy + đỉnh cho label */}
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-black/35" />

          {/* Label nhỏ trên cùng, giữa — như Figma */}
          <div className="absolute top-[3cqw] inset-x-0 text-center">
            <TopLabel />
          </div>

          {/* Title + khoảng cách LỚN + points — ghim đáy trái */}
          <div className="absolute left-[5cqw] right-[5cqw] bottom-[4.5cqw] max-w-[78cqw]">
            <h1 className="uppercase font-black leading-[1.06] tracking-tight text-white text-[clamp(22px,5.4cqw,100px)] drop-shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
              <Line delay={190}>{data.title}</Line>
            </h1>
            {/* khoảng cách lớn giữa title và points (~100px màn trình chiếu) */}
            <div className="mt-[clamp(28px,6cqw,110px)]">
              <BottomPoints />
            </div>
          </div>

          <Dots />
          {isMapImg(cur) && <QrChip />}
        </div>
      </div>
    );
  }

  // ══════════════ LAYOUT 2: ẢNH CHỦ ĐẠO trên nền blur tối ════════════════════
  // Dùng chung cho màn dọc lẫn ngang: label nhỏ trên → MỘT ảnh chiếm giữa
  // (contain, không crop; nhiều ảnh tự chuyển lần lượt) → text đè vùng đáy.
  if (hasImg) {
    return (
      <div style={{ containerType: 'inline-size' }} className="w-full h-full">
        <div key={replayKey} className="relative w-full h-full overflow-hidden bg-[#0C0F0D] flex flex-col">
          <BlurBackdrop src={cur} />

          {/* 1. Label + title nhỏ gọn trên cùng, giữa */}
          <div className="relative z-10 shrink-0 text-center pt-[2.6cqw] px-[5cqw]">
            <TopLabel />
            <h1 className="mt-[0.8cqw] uppercase font-bold leading-[1.1] tracking-wide text-white/90 text-[clamp(14px,2.6cqw,40px)]">
              <Line delay={190}>{data.title}</Line>
            </h1>
          </div>

          {/* 2. MỘT ảnh chiếm toàn bộ không gian còn lại — object-contain,
              không crop. Nhiều ảnh: crossfade lần lượt, không xếp cạnh nhau. */}
          <div className="relative z-10 flex-1 min-h-0 pt-[2cqw] pb-[clamp(90px,16cqw,220px)]">
            <figure
              className={`img-card relative w-full h-full ${onImageClick ? 'cursor-zoom-in' : ''}`}
              style={{ animationDelay: '380ms' }}
              onClick={onImageClick ? () => onImageClick(cur) : undefined}
            >
              {imgs.map((src, i) => (
                <img
                  key={src} src={src} alt=""
                  className={`absolute inset-0 w-full h-full object-contain drop-shadow-[0_24px_60px_rgba(0,0,0,0.55)] transition-all duration-1000 ease-out ${
                    i === imgIdx ? 'opacity-100 scale-100' : 'opacity-0 scale-[1.03] pointer-events-none'
                  }`}
                  onError={onImageError ? () => onImageError(src) : undefined}
                />
              ))}
              {isMapImg(cur) && <QrChip />}
            </figure>
          </div>

          {/* 3. Text đè vùng đáy trên gradient đen — cách ảnh/title khoảng lớn */}
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-[clamp(140px,26cqw,320px)] bg-gradient-to-t from-black/90 via-black/55 to-transparent z-10" />
          <div className="absolute inset-x-[5cqw] bottom-[3cqw] z-20">
            <BottomPoints />
          </div>
          <Dots />
        </div>
      </div>
    );
  }

  // ══════════════ LAYOUT 3: TEXT-ONLY — giữ nền SÁNG như cũ ══════════════════
  return (
    <div style={{ containerType: 'inline-size' }} className="w-full h-full flex flex-col">
      <div key={replayKey} className="flex-1 min-h-0 flex flex-col justify-center items-center text-center px-[8cqw] gap-[3cqw]">
        <div className="shrink-0 text-center">
          <Line delay={60}>
            <span className="inline-flex px-[2.2cqw] py-[0.7cqw] rounded-full font-bold tracking-[0.18em] uppercase text-[clamp(9px,1.5cqw,17px)] bg-[#E3F0E3] text-[#0E5A34]">
              Ny&apos;ah Phú Định
            </span>
          </Line>
          <h1 className="mt-[2cqw] uppercase font-black leading-[1.08] tracking-tight text-[#161616] text-[clamp(22px,6cqw,96px)]">
            <Line delay={190}>{data.title}</Line>
          </h1>
        </div>
        {data.highlight_number && (
          <Line delay={340} className="font-black leading-none text-transparent text-[clamp(34px,11cqw,150px)]">
            <span style={{ WebkitTextStroke: '0.55cqw #2E9E5B' }}>{data.highlight_number}</span>
          </Line>
        )}
        {points.length > 0 && (
          <div className="space-y-[1.2cqw]">
            {points.slice(0, 4).map((p, i) => (
              <Line key={i} delay={520 + i * 150}
                className="text-neutral-600 font-medium leading-snug text-[clamp(12px,3cqw,30px)]">
                {p}
              </Line>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
