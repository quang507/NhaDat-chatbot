'use client';

// ============================================================================
// SlideBody — THÂN SLIDE dùng chung ("impeccable style" — chốt từ bản Framer).
//
// BỐ CỤC THEO layout_type + HƯỚNG MÀN HÌNH (trước đây xếp dọc tất cả -> màn
// ngang chữ chiếm hết chỗ, ảnh bị ép còn vài chục px "như không có hình"):
//
//  • full_background : ảnh TRÀN MÀN (object-cover + ken-burns), phủ gradient
//                      tối, chữ trắng đè góc dưới-trái. Ảnh phụ = thumbnail
//                      góc dưới-phải. Dùng cho ảnh chụp thực tế/phối cảnh.
//  • split_image_*   : MÀN NGANG -> 2 cột (chữ | ảnh, đảo theo left/right),
//                      ảnh object-contain KHÔNG crop (bản đồ, mặt bằng, sơ đồ).
//                      MÀN DỌC  -> xếp chồng nhưng ảnh được BẢO ĐẢM >= 45%.
//  • text_only       : căn giữa, tiêu đề + số nổi bật + ý chính.
//
//  ANIMATION: chữ trượt lên trong mặt nạ (line-mask/line-in), ảnh fade+scale
//  (img-card) — giữ nguyên hệ animation cũ (đã có failsafe ép hiện ở page).
//  CO GIÃN: container-type inline-size -> đơn vị cqw theo bề ngang thẻ.
// ============================================================================

import React from 'react';

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

// 1 dòng chữ trượt từ dưới lên trong mặt nạ, lóe sáng rồi mờ dần.
const Line = ({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) => (
  <span className="line-mask block">
    <span className={`line-in block ${className}`} style={{ animationDelay: `${delay}ms` }}>{children}</span>
  </span>
);

const splitSentences = (t: string): string[] =>
  (t || '').replace(/\s+/g, ' ').match(/[^.!?…]+[.!?…]?/g)?.map(s => s.trim()).filter(Boolean) || [];

export function SlideBody({ data, orientOf, onImageClick, onImageError, replayKey }: SlideBodyProps) {
  const imgs = (data.image_urls || []).filter(Boolean).slice(0, 3);
  const points = (data.points || []).filter(Boolean);
  const speechLines = splitSentences(data.speech_text || '');
  const hasImg = imgs.length > 0;
  const o = (u: string) => orientOf(u);
  const isMapImg = (src: string) => src.includes('vi_tri') || src.includes('18_phut');
  const qrUrl = data.maps_url || 'https://maps.app.goo.gl/qwf4XibyMCL9sEX6A';

  // Nhãn QR bản đồ (đè lên ảnh có bản đồ)
  const QrChip = ({ big = false }: { big?: boolean }) => (
    <a
      href={qrUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`absolute bottom-[2.5cqw] left-[2.5cqw] bg-white/95 rounded-[1.6cqw] p-[1.2cqw] shadow-lg border border-black/5 flex flex-col items-center ${big ? '' : ''}`}
      onClick={e => e.stopPropagation()}
    >
      <img
        src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrUrl)}`}
        alt="QR bản đồ"
        className="w-[8cqw] h-[8cqw] max-w-[92px] max-h-[92px] min-w-[52px] min-h-[52px]"
      />
      <span className="text-[clamp(9px,1.3cqw,14px)] font-bold text-neutral-600 mt-[0.4cqw]">Quét bản đồ</span>
    </a>
  );

  // Thẻ ảnh object-contain (KHÔNG crop) — cho bản đồ/mặt bằng/sơ đồ.
  const Card = ({ src, className = '', delay = 0 }: { src: string; className?: string; delay?: number }) => (
    <figure
      className={`img-card relative rounded-none landscape:rounded-[clamp(14px,2.4cqw,32px)] overflow-hidden bg-white border border-black/[0.05] shadow-[0_18px_46px_-22px_rgba(14,90,52,0.30)] ${onImageClick ? 'cursor-zoom-in' : ''} ${className}`}
      style={{ animationDelay: `${delay}ms` }}
      onClick={onImageClick ? () => onImageClick(src) : undefined}
    >
      <img src={src} alt="" className="absolute inset-0 w-full h-full object-contain" onError={onImageError ? () => onImageError(src) : undefined} />
      {isMapImg(src) && <QrChip />}
    </figure>
  );

  // Khối ảnh cho layout SPLIT — lấp đầy cột, chia theo số ảnh.
  const ImageBlock = () => {
    const D = 480;
    if (imgs.length === 1) {
      // Man doc: card om theo ti le anh (khong nong het chieu cao -> het khoang trang).
      // Man ngang: lap day cot nhu cu.
      const land = o(imgs[0]) === 'landscape';
      return (
        <div className="h-full w-full flex items-center justify-center">
          <Card
            src={imgs[0]}
            delay={D}
            className={land
              ? 'w-full max-h-full aspect-[16/10]'
              : 'h-full max-w-full aspect-[3/4]'}
          />
        </div>
      );
    }
    if (imgs.length === 2) {
      const bothP = imgs.every(u => o(u) === 'portrait');
      return (
        <div className={`h-full grid gap-[2.2cqw] ${bothP ? 'grid-cols-2' : 'grid-rows-2'}`}>
          {imgs.map((u, i) => <Card key={u} src={u} delay={D + i * 220} className="w-full h-full" />)}
        </div>
      );
    }
    const allP = imgs.every(u => o(u) === 'portrait');
    if (allP) {
      return (
        <div className="h-full grid grid-cols-3 gap-[2cqw]">
          {imgs.map((u, i) => <Card key={u} src={u} delay={D + i * 200} className="w-full h-full" />)}
        </div>
      );
    }
    return (
      <div className="h-full grid grid-rows-[1.3fr_1fr] gap-[2.2cqw] min-h-0">
        <Card src={imgs[0]} delay={D} className="w-full h-full" />
        <div className="grid grid-cols-2 gap-[2.2cqw] min-h-0">
          <Card src={imgs[1]} delay={D + 220} className="w-full h-full" />
          <Card src={imgs[2]} delay={D + 440} className="w-full h-full" />
        </div>
      </div>
    );
  };

  const Badge = ({ light = false, delay = 60 }: { light?: boolean; delay?: number }) => (
    <Line delay={delay}>
      <span className={`inline-flex px-[2.2cqw] py-[0.7cqw] rounded-full font-bold tracking-[0.18em] uppercase text-[clamp(9px,1.5cqw,17px)] ${
        light ? 'bg-white/20 text-white backdrop-blur-sm' : 'bg-[#E3F0E3] text-[#0E5A34]'
      }`}>
        Ny&apos;ah Phú Định
      </span>
    </Line>
  );

  // ══════════════ LAYOUT 1: FULL BACKGROUND (ảnh tràn màn + chữ đè) ══════════════
  if (hasImg && (data.layout_type === 'full_background' || !data.layout_type)) {
    const [bg, ...thumbs] = imgs;
    return (
      <div style={{ containerType: 'inline-size' }} className="w-full h-full">
        <div key={replayKey} className="relative w-full h-full overflow-hidden">
          {/* Ảnh nền tràn màn + ken-burns nhẹ */}
          <div className="img-card absolute inset-0" style={{ animationDelay: '0ms', borderRadius: 0 }}>
            <img
              src={bg}
              alt=""
              className="w-full h-full object-cover animate-ken-burns"
              onError={onImageError ? () => onImageError(bg) : undefined}
              onClick={onImageClick ? () => onImageClick(bg) : undefined}
            />
          </div>
          {/* Gradient tối để chữ trắng luôn đọc được */}
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/45 via-transparent to-transparent" />

          {/* Khối chữ góc dưới-trái */}
          <div className="absolute left-[5cqw] right-[5cqw] bottom-[4.5cqw] max-w-[72cqw]">
            <Badge light />
            <h1 className="mt-[1.6cqw] uppercase font-black leading-[1.08] tracking-tight text-white text-[clamp(24px,6cqw,110px)] drop-shadow-[0_4px_24px_rgba(0,0,0,0.45)]">
              <Line delay={190}>{data.title}</Line>
            </h1>
            <div className="mt-[1.8cqw] space-y-[0.5cqw]">
              {points.slice(0, 3).map((p, i) => (
                <Line key={i} delay={700 + i * 150} className="text-white/90 font-medium leading-snug text-[clamp(12px,2.2cqw,30px)] drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]">
                  <span className="inline-block w-[0.9cqw] h-[0.9cqw] min-w-[7px] min-h-[7px] rounded-full bg-[#A8D94A] mr-[1.2cqw] align-middle" />{p}
                </Line>
              ))}
            </div>
          </div>

          {/* Ảnh phụ: thumbnail góc dưới-phải */}
          {thumbs.length > 0 && (
            <div className="absolute right-[3cqw] bottom-[4.5cqw] hidden md:flex flex-col gap-[1.4cqw]">
              {thumbs.map((u, i) => (
                <figure
                  key={u}
                  className={`img-card w-[16cqw] max-w-[260px] min-w-[120px] aspect-[4/3] rounded-[1.6cqw] overflow-hidden border-2 border-white/70 shadow-2xl ${onImageClick ? 'cursor-zoom-in' : ''}`}
                  style={{ animationDelay: `${900 + i * 220}ms` }}
                  onClick={onImageClick ? () => onImageClick(u) : undefined}
                >
                  <img src={u} alt="" className="w-full h-full object-cover" onError={onImageError ? () => onImageError(u) : undefined} />
                </figure>
              ))}
            </div>
          )}
          {isMapImg(bg) && <QrChip />}
        </div>
      </div>
    );
  }

  // ══════════════ LAYOUT 2: SPLIT — ẢNH BÊN TRÁI (màn ngang) / ẢNH TRÊN (màn dọc) ══════════════
  // Chốt theo yêu cầu sếp: ảnh luôn nằm TRÁI trên màn ngang; khi responsive (màn dọc)
  // ảnh lên TRÊN fill hết chiều ngang (cách mép trên ~250px), text nằm DƯỚI.
  if (hasImg) {
    return (
      <div style={{ containerType: 'inline-size' }} className="w-full h-full">
        <div
          key={replayKey}
          className="h-full min-h-0 flex flex-col gap-[3cqw] px-[5cqw] pb-[2.5cqw] pt-[clamp(24px,calc(250px_-_12vh),170px)] landscape:pt-[2.5cqw] landscape:grid landscape:items-center landscape:gap-[4cqw] landscape:grid-cols-[1.15fr_1fr]"
        >
          {/* ẢNH — trái (ngang) / trên + full ngang (dọc, -mx bù padding wrapper) */}
          <div className="shrink-0 -mx-[5cqw] landscape:mx-0 landscape:flex-none landscape:min-h-0 landscape:h-full landscape:max-h-full min-w-0">
            <ImageBlock />
          </div>

          {/* CHỮ — phải (ngang) / dưới (dọc) */}
          <div className="flex-1 min-w-0 landscape:flex-none landscape:self-center">
            <Badge />
            <h1 className="mt-[1.8cqw] uppercase font-black leading-[1.08] tracking-tight text-[#161616] text-[clamp(20px,4.6cqw,92px)]">
              <Line delay={190}>{data.title}</Line>
            </h1>
            <div className="mt-[2.2cqw] space-y-[0.8cqw]">
              {points.slice(0, 3).map((p, i) => (
                <Line key={i} delay={620 + i * 150} className="text-neutral-500 font-medium leading-snug text-[clamp(11px,2cqw,28px)]">
                  <span className="inline-block w-[0.8cqw] h-[0.8cqw] min-w-[6px] min-h-[6px] rounded-full bg-[#2E9E5B] mr-[1.1cqw] align-middle" />{p}
                </Line>
              ))}
            </div>
            {speechLines.length > 0 && (
              <div className="mt-[2.4cqw] border-l-[3px] border-[#2E9E5B]/60 pl-[2.2cqw] hidden landscape:block">
                {speechLines.slice(0, 3).map((ln, i) => (
                  <Line key={i} delay={1050 + i * 160} className="text-neutral-600 font-normal leading-[1.7] text-[clamp(11px,1.7cqw,24px)]">
                    {ln}
                  </Line>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════ LAYOUT 3: TEXT-ONLY (căn giữa + số nổi bật) ══════════════
  return (
    <div style={{ containerType: 'inline-size' }} className="w-full h-full flex flex-col">
      <div key={replayKey} className="flex-1 min-h-0 flex flex-col justify-center items-center text-center px-[8cqw] gap-[3cqw]">
        <div className="shrink-0 text-center">
          <Line delay={60} className="flex justify-center"><Badge /></Line>
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
              <Line key={i} delay={520 + i * 150} className="text-neutral-600 font-medium leading-snug text-[clamp(12px,3cqw,30px)]">
                {p}
              </Line>
            ))}
          </div>
        )}
        {speechLines.length > 0 && (
          <div className="max-w-[76cqw]">
            {speechLines.slice(0, 3).map((ln, i) => (
              <Line key={i} delay={880 + i * 160} className="text-neutral-400 font-normal leading-[1.7] text-[clamp(11px,2.4cqw,25px)]">
                {ln}
              </Line>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
