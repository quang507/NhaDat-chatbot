'use client';

// Adapter React mỏng cho presentation machine (P1): giữ context trong state,
// dồn effect vào hàng đợi và thực thi SAU khi React commit (không side-effect
// trong reducer). Toàn bộ logic nghiệp vụ nằm ở lib/presentation-machine.ts.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MachineCtx, MachineEvent, MachineEffect, initialCtx, transition,
} from '@/lib/presentation-machine';

export function usePresentationMachine(onEffect: (eff: MachineEffect) => void) {
  const [ctx, setCtx] = useState<MachineCtx>(initialCtx);
  const queueRef = useRef<MachineEffect[]>([]);
  const onEffectRef = useRef(onEffect);
  useEffect(() => { onEffectRef.current = onEffect; }, [onEffect]);

  const send = useCallback((ev: MachineEvent) => {
    setCtx(prev => {
      const r = transition(prev, ev);
      if (r.effects.length) queueRef.current.push(...r.effects);
      return r.ctx;
    });
  }, []);

  // Chạy sau MỌI render: xả hàng đợi effect (rẻ - chỉ check mảng rỗng).
  useEffect(() => {
    if (!queueRef.current.length) return;
    const effs = queueRef.current.splice(0);
    for (const eff of effs) {
      try { onEffectRef.current(eff); } catch (e) { console.error('[machine effect]', eff.type, e); }
    }
  });

  return { ctx, send };
}
