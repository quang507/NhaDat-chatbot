'use client';

// HUD chẩn đoán tách từ app/slide/page.tsx (P1.4) - chỉ hiện với /slide?debug=1.
// Kỹ thuật viên mới thấy log; khách và Sale không bao giờ gặp màn này.

import React from 'react';

interface DebugHudProps {
  state: string;
  machineState: string;
  hasSlide: boolean;
  transportKind: string;
  errorMsg?: string;
  log: string[];
}

export function DebugHud({ state, machineState, hasSlide, transportKind, errorMsg, log }: DebugHudProps) {
  return (
    <div className="fixed top-2 left-2 z-[70] w-[420px] max-w-[92vw] rounded-xl bg-black/85 text-white p-3 font-mono text-[11px] leading-relaxed shadow-2xl">
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-bold text-[#A8D94A]">🔧 DEBUG</span>
        <span>
          audio: <b className="text-amber-300">{state}</b>
          {' · '}fsm: <b className="text-amber-300">{machineState}</b>
          {' · '}slide: <b className="text-amber-300">{hasSlide ? 'CÓ' : 'CHƯA'}</b>
          {' · '}<b className="text-sky-300">{transportKind}</b>
        </span>
      </div>
      {errorMsg && <div className="text-red-400 font-bold mb-1">⛔ {errorMsg}</div>}
      <div className="max-h-[38vh] overflow-y-auto space-y-0.5">
        {log.length === 0 && <div className="text-white/50">Chưa có sự kiện - bấm mic và nói thử…</div>}
        {log.map((l, i) => <div key={i} className={i === 0 ? 'text-white' : 'text-white/60'}>{l}</div>)}
      </div>
    </div>
  );
}
