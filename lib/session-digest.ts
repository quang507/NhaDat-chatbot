// Gom hỏi-đáp của MỘT phiên khách phía client và gửi 1 bản tổng hợp về
// /api/log-session khi phiên kết thúc. Dùng chung cho chat widget, màn slide
// và trang voice - mỗi nơi chỉ cần push() và gọi bind một lần.
//
// Phiên kết thúc khi: khách im lặng quá idleMs, HOẶC rời trang (pagehide -
// dùng navigator.sendBeacon vì fetch thường bị hủy khi tab đóng).
// flush() có chốt chống gửi trùng: gửi xong xóa transcript, phiên mới tự mở
// ở lần push() kế tiếp.

export interface DigestPair { q: string; a?: string }

const TOKEN = 'npd-mktg-handshake'; // khớp /api/log-session

export function createSessionRecorder(source: 'chat' | 'slide' | 'voice', idleMs = 10 * 60 * 1000) {
  let pairs: DigestPair[] = [];
  let startedAt = '';
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let bound = false;

  function payload() {
    return JSON.stringify({ token: TOKEN, source, transcript: pairs, startedAt });
  }

  function flush(useBeacon = false) {
    if (!pairs.length) return;
    const body = payload();
    pairs = [];
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    try {
      if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon('/api/log-session', new Blob([body], { type: 'application/json' }));
      } else {
        fetch('/api/log-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true, // sống sót qua chuyển trang
        }).catch(() => {});
      }
    } catch { /* mất digest không được phá trải nghiệm khách */ }
  }

  function armIdle() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => flush(false), idleMs);
  }

  return {
    /** Ghi một lượt hỏi (và đáp nếu có). Tự mở phiên mới nếu phiên trước đã gửi. */
    push(q: string, a?: string) {
      if (!q?.trim()) return;
      if (!pairs.length) startedAt = new Date().toISOString();
      pairs.push({ q: q.slice(0, 500), a: a ? a.slice(0, 600) : undefined });
      if (pairs.length > 30) pairs = pairs.slice(-30);
      armIdle();
    },
    /** Bổ sung/ghi đè câu đáp cho lượt hỏi cuối (khi answer về sau). */
    answerLast(a: string) {
      if (pairs.length && a?.trim()) pairs[pairs.length - 1].a = a.slice(0, 600);
    },
    /** Kết thúc phiên chủ động (ví dụ: phát hiện khách mới) và gửi digest. */
    flush,
    /** Gắn listener rời-trang. Gọi MỘT lần trong useEffect, trả về cleanup. */
    bindUnload(): () => void {
      if (bound || typeof window === 'undefined') return () => {};
      bound = true;
      const onHide = () => { if (document.visibilityState === 'hidden') flush(true); };
      const onPageHide = () => flush(true);
      document.addEventListener('visibilitychange', onHide);
      window.addEventListener('pagehide', onPageHide);
      return () => {
        bound = false;
        document.removeEventListener('visibilitychange', onHide);
        window.removeEventListener('pagehide', onPageHide);
      };
    },
  };
}
