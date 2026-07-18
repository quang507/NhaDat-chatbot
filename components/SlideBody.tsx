'use client';

// ============================================================================
// SlideBody — layout_type-aware, screen-orientation-aware:
//
//  • full_background : ảnh TRÀN MÀN (object-cover + ken-burns), chữ trắng đè
//                      góc dưới-trái, ảnh phụ thumbnail góc dưới-phải.
//
//  • split_image_*   :
//      MÀN DỌC  → Title ở TRÊN ảnh  |  Ảnh GIỮA full-width giữ tỉ lệ  |
//                  Text cố định BÊN DƯỚI, chữ to
//      MÀN NGANG → 2 cột (ảnh TRÁI | chữ PHẢI), ảnh object-contain
//
//  • text_only       : căn giữa, tiêu đề + số nổi bật + ý chính.
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

const Line = ({ children, delay = 0, className = '' }: {
  children: React.ReactNode; delay?: number; className?: string;
}) => (
  <span className="line-mask block">
    <span className={`line-in block ${className}`} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </span>
  </span>
);

const splitSentences = (t: string): string[] =>
  (t || '').replace(/\s+/g, ' ').match(/[^.!?…]+[.!?…]?/g)
    ?.map(s => s.trim()).filter(Boolean) || [];

export function SlideBody({ data, orientOf, onImageClick, onImageError, replayKey }: SlideBodyProps) {
  const imgs = (data.image_urls || []).filter(Boolean).slice(0, 3);
  const points = (data.points || []).filter(Boolean);
  const speechLines = splitSentences(data.speech_text || '');
  const hasImg = imgs.length > 0;
  const o = (u: string) => orientOf(u);
  const isMapImg = (src: string) => src.includes('vi_tri') || src.includes('18_phut');
  const qrUrl = data.maps_url || 'https://maps.app.goo.gl/qwf4XibyMCL9sEX6A';

  const QrChip = () => (
    <a
      href={qrUrl} target="_blank" rel="noopener noreferrer"
      className="absolute bottom-[2.5cqw] left-[2.5cqw] bg-white/95 rounded-[1.6cqw] p-[1.2cqw] shadow-lg border border-black/5 flex flex-col items-center"
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

  const Badge = ({ light = false, delay = 60 }: { light?: boolean; delay?: number }) => (
    <Line delay={delay}>
      <span className={`inline-flex px-[2.2cqw] py-[0.7cqw] rounded-full font-bold tracking-[0.18em] uppercase text-[clamp(9px,1.5cqw,17px)] ${
        light ? 'bg-white/20 text-white backdrop-blur-sm' : 'bg-[#E3F0E3] text-[#0E5A34]'
      }`}>
        Ny&apos;ah Phú Định
      </span>
    </Line>
  );

  // ─── Card dùng cho MÀN NGANG: height-driven, object-contain, bo góc ─────────
  const Card = ({ src, className = '', delay = 0 }: {
    src: string; className?: string; delay?: number;
  }) => (
    <figure
      className={`img-card relative rounded-[clamp(12px,2.4cqw,32px)] overflow-hidden bg-white border border-black/[0.05] shadow-[0_18px_46px_-22px_rgba(14,90,52,0.30)] ${onImageClick ? 'cursor-zoom-in' : ''} ${className}`}
      style={{ animationDelay: `${delay}ms` }}
      onClick={onImageClick ? () => onImageClick(src) : undefined}
    >
      <img
        src={src} alt=""
        className="absolute inset-0 w-full h-full object-contain"
        onError={onImageError ? () => onImageError(src) : undefined}
      />
      {isMapImg(src) && <QrChip />}
    </figure>
  );

  // ─── CardP dùng cho MÀN DỌC: container-driven, object-contain, không crop ───
  // Không dùng aspect-ratio — container (flex-1) quyết định kích thước,
  // img object-contain tự căn giữa trong đó, ảnh luôn thấy đủ, không overflow.
  const CardP = ({ src, className = '', delay = 0 }: {
    src: string; className?: string; delay?: number;
  }) => (
    <figure
      className={`img-card relative overflow-hidden ${onImageClick ? 'cursor-zoom-in' : ''} ${className}`}
      style={{ animationDelay: `${delay}ms` }}
      onClick={onImageClick ? () => onImageClick(src) : undefined}
    >
      <img
        src={src} alt=""
        className="absolute inset-0 w-full h-full object-contain object-top"
        onError={onImageError ? () => onImageError(src) : undefined}
      />
      {isMapImg(src) && <QrChip />}
    </figure>
  );

  // ─── ImageBlock MÀN NGANG: fills column height ───────────────────────────────
  const ImgLandscape = () => {
    const D = 480;
    if (imgs.length === 1) {
      const land = o(imgs[0]) === 'landscape';
      return (
        <div className="h-full w-full flex items-center justify-center">
          <Card
            src={imgs[0]} delay={D}
            className={land ? 'w-full max-h-full aspect-[16/10]' : 'h-full max-w-full aspect-[3/4]'}
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

  // ─── ImageBlock MÀN DỌC: fills flex-1 container, object-contain (không crop) ─
  // Container cha là flex-1 min-h-0 → ảnh fit trong không gian còn lại,
  // không bao giờ overflow ra ngoài màn dù ảnh dọc hay ngang.
  const ImgPortrait = () => {
    const D = 480;
    if (imgs.length === 1) {
      return <CardP src={imgs[0]} delay={D} className="w-full h-full" />;
    }
    if (imgs.length === 2) {
      return (
        <div className="w-full h-full grid grid-cols-2 gap-[2.5cqw]">
          {imgs.map((u, i) => <CardP key={u} src={u} delay={D + i * 220} className="w-full h-full" />)}
        </div>
      );
    }
    // 3 ảnh: ảnh chính to trên (flex 1.5), 2 ảnh nhỏ dưới (flex 1)
    return (
      <div className="w-full h-full flex flex-col gap-[2cqw]">
        <CardP src={imgs[0]} delay={D} className="w-full flex-[1.5] min-h-0" />
        <div className="flex-1 min-h-0 grid grid-cols-2 gap-[2cqw]">
          {imgs.slice(1).map((u, i) => (
            <CardP key={u} src={u} delay={D + (i + 1) * 200} className="w-full h-full" />
          ))}
        </div>
      </div>
    );
  };

  // ══════════════ LAYOUT 1: FULL BACKGROUND ══════════════════════════════════
  if (hasImg && (data.layout_type === 'full_background' || !data.layout_type)) {
    const [bg, ...thumbs] = imgs;
    return (
      <div style={{ containerType: 'inline-size' }} className="w-full h-full">
        <div key={replayKey} className="relative w-full h-full overflow-hidden">
          <div className="img-card absolute inset-0" style={{ animationDelay: '0ms', borderRadius: 0 }}>
            <img
              src={bg} alt=""
              className="w-full h-full object-cover animate-ken-burns"
              onError={onImageError ? () => onImageError(bg) : undefined}
              onClick={onImageClick ? () => onImageClick(bg) : undefined}
            />
          </div>
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/45 via-transparent to-transparent" />

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

          {thumbs.length > 0 && (
            <div className="absolute right-[3cqw] bottom-[4.5cqw] hidden md:flex flex-col gap-[1.4cqw]">
              {thumbs.map((u, i) => (
                <figure
                  key={u}
                  className={`img-card w-[16cqw] max-w-[260px] min-w-[120px] aspect-[4/3] rounded-[1.6cqw] overflow-hidden border-2 border-white/70 shadow-2xl ${onImageClick ? 'cursor-zoom-in' : ''}`}
                  style={{ animationDelay: `${900 + i * 220}ms` }}
                  onClick={onImageClick ? () => onImageClick(u) : undefined}
                >
                  <img src={u} alt="" className="w-full h-full object-cover"
                    onError={onImageError ? () => onImageError(u) : undefined} />
                </figure>
              ))}
            </div>
          )}
          {isMapImg(bg) && <QrChip />}
        </div>
      </div>
    );
  }

  // ══════════════ LAYOUT 2: SPLIT (có ảnh) ═══════════════════════════════════
  if (hasImg) {
    // Ảnh đầu tiên dọc → flex-1 (fill không gian); ngang → shrink-0 + aspect-ratio cố định.
    const firstPortrait = imgs.length > 0 && o(imgs[0]) === 'portrait';

    return (
      <div style={{ containerType: 'inline-size' }} className="w-full h-full">

        {/* ── MÀN DỌC: TITLE trên → ẢNH giữa → TEXT cố định dưới ── */}
        <div key={replayKey} className="h-full flex flex-col landscape:hidden overflow-hidden">

          {/* 1. Badge + Tiêu đề — NẰM TRÊN ảnh, 1 dòng duy nhất */}
          <div className="shrink-0 px-[5cqw] pt-[3cqw] pb-[1.5cqw]">
            <Badge />
            <h1 className="mt-[1.2cqw] uppercase font-black leading-[1.1] tracking-tight text-[#161616] text-[clamp(15px,4.3cqw,52px)] overflow-hidden">
              <Line delay={190} className="whitespace-nowrap overflow-hidden text-ellipsis">{data.title}</Line>
            </h1>
          </div>

          {/* 2. Ảnh:
               • Dọc → flex-1 capped 56vh: ảnh fit trong không gian, ko gap lớn với text
               • Ngang → shrink-0 aspect-ratio tự nhiên + spacer đẩy text xuống đáy */}
          {firstPortrait ? (
            <div className="flex-1 min-h-0 max-h-[56vh] w-full relative">
              <ImgPortrait />
            </div>
          ) : (
            <>
              <div className="shrink-0 w-full aspect-[16/10] relative">
                <ImgPortrait />
              </div>
              <div className="flex-1" />
            </>
          )}

          {/* 3. Text câu trả lời — shrink-0, luôn bên dưới, chữ to */}
          <div className="shrink-0 flex flex-col px-[5cqw] pb-[3cqw] pt-[2cqw] gap-[1.5cqw]">
            {points.slice(0, 3).map((p, i) => (
              <Line key={i} delay={600 + i * 140}
                className="text-neutral-700 font-semibold leading-[1.4] text-[clamp(14px,3.8cqw,36px)]">
                <span className="inline-block w-[1.2cqw] h-[1.2cqw] min-w-[8px] min-h-[8px] rounded-full bg-[#2E9E5B] mr-[1.5cqw] align-middle" />
                {p}
              </Line>
            ))}
            {speechLines.length > 0 && points.length === 0 && (
              <div className="space-y-[1.4cqw]">
                {speechLines.slice(0, 2).map((ln, i) => (
                  <Line key={i} delay={780 + i * 150}
                    className="text-neutral-500 font-normal leading-[1.6] text-[clamp(13px,3.5cqw,32px)]">
                    {ln}
                  </Line>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── MÀN NGANG: ẢNH TRÁI — CHỮ PHẢI ── */}
        <div
          key={`${replayKey}-l`}
          className="h-full hidden landscape:grid landscape:items-center landscape:gap-[4cqw] landscape:grid-cols-[1.15fr_1fr] landscape:px-[4cqw] landscape:py-[2.5cqw]"
        >
          {/* Cột ảnh */}
          <div className="min-h-0 h-full max-h-full min-w-0">
            <ImgLandscape />
          </div>

          {/* Cột chữ */}
          <div className="flex-none self-center">
            <Badge />
            <h1 className="mt-[1.8cqw] uppercase font-black leading-[1.08] tracking-tight text-[#161616] text-[clamp(20px,4.6cqw,92px)]">
              <Line delay={190}>{data.title}</Line>
            </h1>
            <div className="mt-[2.2cqw] space-y-[0.8cqw]">
              {points.slice(0, 3).map((p, i) => (
                <Line key={i} delay={620 + i * 150}
                  className="text-neutral-500 font-medium leading-snug text-[clamp(11px,2cqw,28px)]">
                  <span className="inline-block w-[0.8cqw] h-[0.8cqw] min-w-[6px] min-h-[6px] rounded-full bg-[#2E9E5B] mr-[1.1cqw] align-middle" />
                  {p}
                </Line>
              ))}
            </div>
            {speechLines.length > 0 && (
              <div className="mt-[2.4cqw] border-l-[3px] border-[#2E9E5B]/60 pl-[2.2cqw]">
                {speechLines.slice(0, 3).map((ln, i) => (
                  <Line key={i} delay={1050 + i * 160}
                    className="text-neutral-600 font-normal leading-[1.7] text-[clamp(11px,1.7cqw,24px)]">
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

  // ══════════════ LAYOUT 3: TEXT-ONLY ════════════════════════════════════════
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
              <Line key={i} delay={520 + i * 150}
                className="text-neutral-600 font-medium leading-snug text-[clamp(12px,3cqw,30px)]">
                {p}
              </Line>
            ))}
          </div>
        )}
        {speechLines.length > 0 && (
          <div className="max-w-[76cqw]">
            {speechLines.slice(0, 3).map((ln, i) => (
              <Line key={i} delay={880 + i * 160}
                className="text-neutral-400 font-normal leading-[1.7] text-[clamp(11px,2.4cqw,25px)]">
                {ln}
              </Line>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
