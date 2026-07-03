'use client';

// ============================================================================
// SlideBody — THAN SLIDE DUNG CHUNG cho ca trang /slide (that) va /slide/demo.
// Muc tieu: demo va that KHONG BAO GIO lech nhau nua (truoc day 2 noi code rieng).
//
// NGUYEN TAC THIET KE (chot tu ban Framer cua Quang — "impeccable style"):
//  1. TIEU DE: 1 mau (den #161616), IN HOA, dam, KHONG tach 2 mau/2 dong (tranh loi
//     dinh chu "CACHPHONG"). Nhan xanh nho "NY'AH PHU DINH" o tren.
//  2. ANH: KHONG BAO GIO crop -> object-contain, nen trang. Toi da 3 anh.
//     Bo cuc theo SO LUONG + HUONG anh:
//        1 ngang        -> 1 the full be ngang
//        1 doc          -> 1 the doc, hep, canh giua
//        2 cung ngang   -> xep DOC 2 hang
//        2 cung doc     -> chia DOI 2 cot
//        2 tron         -> doc trai | ngang phai (canh giua)
//        3 cung ngang   -> xep DOC 3 hang
//        3 cung doc     -> chia BA 3 cot
//        3 tron         -> 1 tren + 2 duoi
//        0 anh          -> layout text-only canh giua, co so noi bat (highlight)
//  3. ANIMATION: chu truot len trong "mat na" (line-mask/line-in), anh fade+scale vao
//     co so le (stagger). KHONG dung carousel tu xoay nua — hien het anh 1 luc.
//  4. MO TA anh: "points" -> may dong chu XAM NHAT ngay duoi anh.
//  5. SECTION CHU khong tran: cqw scale theo be ngang the + clamp chan tran + line-clamp.
//  6. FOOTER marquee xanh do trang page tu ve (khong nam trong SlideBody).
//
// Co giãn: root dat container-type:inline-size -> font dung don vi cqw (theo be ngang
// CUA THE, khong theo viewport) nen chay dung ca o khung demo nho lan man hinh 85".
// ============================================================================

import React from 'react';

export interface SlideBodyData {
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

// 1 dong chu truot tu duoi len trong mat na, loe sang roi mo dan.
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

  // ---- 1 the anh (dung chung moi bo cuc) ----
  const Card = ({ src, className = '', delay = 0 }: { src: string; className?: string; delay?: number }) => {
    const isMap = src.includes('vi_tri') || src.includes('18_phut');
    const qrUrl = data.maps_url || 'https://maps.app.goo.gl/qwf4XibyMCL9sEX6A';
    return (
      <figure
        className={`img-card relative rounded-[clamp(16px,3.2cqw,38px)] overflow-hidden bg-white border border-black/[0.05] shadow-[0_18px_46px_-22px_rgba(14,90,52,0.30)] ${onImageClick ? 'cursor-zoom-in' : ''} ${className}`}
        style={{ animationDelay: `${delay}ms` }}
        onClick={onImageClick ? () => onImageClick(src) : undefined}
      >
        <img
          src={src}
          alt=""
          className="w-full h-full object-contain"
          onError={onImageError ? () => onImageError(src) : undefined}
        />
        {isMap && (
          <a
            href={qrUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-[3cqw] left-[3cqw] bg-white/95 rounded-[2cqw] p-[1.5cqw] shadow-lg border border-black/5 flex flex-col items-center"
            onClick={e => e.stopPropagation()}
          >
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrUrl)}`}
              alt="QR ban do"
              className="w-[11cqw] h-[11cqw] max-w-[80px] max-h-[80px]"
            />
            <span className="text-[1.6cqw] font-bold text-neutral-600 mt-[0.5cqw]">Quét bản đồ</span>
          </a>
        )}
      </figure>
    );
  };

  // ---- Khoi anh theo so luong + huong (KHONG crop) ----
  const ImageBlock = () => {
    const n = imgs.length;
    const D = 520; // do tre base cho anh vao sau chu

    if (n === 1) {
      return o(imgs[0]) === 'portrait'
        ? <div className="h-full flex items-center justify-center"><Card src={imgs[0]} delay={D} className="h-full w-[62%]" /></div>
        : <div className="h-full flex items-center"><Card src={imgs[0]} delay={D} className="w-full h-full" /></div>;
    }

    if (n === 2) {
      const [a, b] = imgs;
      const bothL = o(a) === 'landscape' && o(b) === 'landscape';
      const bothP = o(a) === 'portrait' && o(b) === 'portrait';
      if (bothL) {
        return (
          <div className="h-full grid grid-rows-2 gap-[3cqw]">
            <Card src={a} delay={D} className="w-full h-full" />
            <Card src={b} delay={D + 260} className="w-full h-full" />
          </div>
        );
      }
      if (bothP) {
        return (
          <div className="h-full grid grid-cols-2 gap-[3cqw]">
            <Card src={a} delay={D} className="w-full h-full" />
            <Card src={b} delay={D + 260} className="w-full h-full" />
          </div>
        );
      }
      // tron: doc trai | ngang phai (canh giua theo chieu cao)
      const p = o(a) === 'portrait' ? a : b;
      const l = p === a ? b : a;
      return (
        <div className="h-full grid grid-cols-2 gap-[3cqw]">
          <Card src={p} delay={D} className="w-full h-full" />
          <div className="h-full flex items-center"><Card src={l} delay={D + 260} className="w-full h-[70%]" /></div>
        </div>
      );
    }

    // n === 3
    const [a, b, c] = imgs;
    const allL = imgs.every(u => o(u) === 'landscape');
    const allP = imgs.every(u => o(u) === 'portrait');
    if (allL) {
      return (
        <div className="h-full grid grid-rows-3 gap-[2.4cqw]">
          {imgs.map((u, i) => <Card key={u} src={u} delay={D + i * 220} className="w-full h-full" />)}
        </div>
      );
    }
    if (allP) {
      return (
        <div className="h-full grid grid-cols-3 gap-[2.4cqw]">
          {imgs.map((u, i) => <Card key={u} src={u} delay={D + i * 220} className="w-full h-full" />)}
        </div>
      );
    }
    // tron: 1 tren + 2 duoi
    return (
      <div className="h-full flex flex-col gap-[3cqw]">
        <Card src={a} delay={D} className="w-full h-[46%]" />
        <div className="grid grid-cols-2 gap-[3cqw] flex-1 min-h-0">
          <Card src={b} delay={D + 240} className="w-full h-full" />
          <Card src={c} delay={D + 480} className="w-full h-full" />
        </div>
      </div>
    );
  };

  const TitleGroup = ({ center = false }: { center?: boolean }) => (
    <div className={`shrink-0 ${center ? 'text-center' : ''}`}>
      <Line delay={60} className={center ? 'flex justify-center' : ''}>
        <span className="inline-flex px-[3cqw] py-[1cqw] rounded-full bg-[#E3F0E3] text-[#0E5A34] font-bold tracking-[0.18em] uppercase text-[clamp(9px,2.5cqw,18px)]">
          Ny&apos;ah Phú Định
        </span>
      </Line>
      <h1 className="mt-[2.4cqw] uppercase font-black leading-[1.06] tracking-tight text-[#161616] text-[clamp(22px,7cqw,96px)]">
        <Line delay={190}>{data.title}</Line>
      </h1>
    </div>
  );

  // ---- MO TA anh (points) -> chu xam nhat duoi anh ----
  const Captions = () => (
    <div className="shrink-0 mt-[2.6cqw] space-y-[0.6cqw]">
      {points.slice(0, 3).map((p, i) => (
        <Line key={i} delay={860 + i * 150} className="text-neutral-400 font-normal leading-snug text-[clamp(10px,3cqw,26px)]">
          {p}
        </Line>
      ))}
    </div>
  );

  // ---- MO TA dai (speech_text) -> chu xam dam hon, vien xanh mong ----
  const Description = ({ mt = '3cqw' }: { mt?: string }) => {
    if (speechLines.length === 0) return null;
    return (
      <div className="shrink-0 border-l-[3px] border-[#2E9E5B]/60 pl-[3cqw]" style={{ marginTop: `var(--mt, ${mt})` }}>
        {speechLines.slice(0, 4).map((ln, i) => (
          <Line key={i} delay={1120 + i * 160} className="text-neutral-600 font-normal leading-[1.75] text-[clamp(11px,3.1cqw,27px)]">
            {ln}
          </Line>
        ))}
      </div>
    );
  };

  return (
    <div style={{ containerType: 'inline-size' }} className="w-full h-full flex flex-col">
      {hasImg ? (
        <div key={replayKey} className="flex-1 min-h-0 flex flex-col px-[6cqw] pt-[1.5cqw] pb-[3cqw]">
          <TitleGroup />
          <div className="flex-1 min-h-0 flex flex-col mt-[3cqw]">
            <div className="flex-1 min-h-0"><ImageBlock /></div>
            {points.length > 0 && <Captions />}
          </div>
          <Description />
        </div>
      ) : (
        // TEXT-ONLY: canh giua, tieu de + so noi bat + y chinh + mo ta
        <div key={replayKey} className="flex-1 min-h-0 flex flex-col justify-center items-center text-center px-[8cqw] gap-[3.5cqw]">
          <TitleGroup center />
          {data.highlight_number && (
            <Line delay={340} className="font-black leading-none text-transparent text-[clamp(34px,12cqw,150px)]">
              <span style={{ WebkitTextStroke: '0.6cqw #2E9E5B' }}>{data.highlight_number}</span>
            </Line>
          )}
          {points.length > 0 && (
            <div className="space-y-[1.4cqw]">
              {points.slice(0, 4).map((p, i) => (
                <Line key={i} delay={520 + i * 150} className="text-neutral-600 font-medium leading-snug text-[clamp(12px,3.4cqw,30px)]">
                  {p}
                </Line>
              ))}
            </div>
          )}
          {speechLines.length > 0 && (
            <div className="max-w-[80cqw]">
              {speechLines.slice(0, 3).map((ln, i) => (
                <Line key={i} delay={900 + i * 160} className="text-neutral-400 font-normal leading-[1.7] text-[clamp(11px,2.9cqw,25px)]">
                  {ln}
                </Line>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
