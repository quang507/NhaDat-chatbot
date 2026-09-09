"use client";

// ============================================================================
// /sale - TAB THỨ HAI CHO SALE: soi TV (/slide) đang nghe gì, hiểu gì, vì sao
// bỏ qua / nhảy slide, kèm từ khóa kích hoạt theo chủ đề và gợi ý nói tiếp.
//
// Cách dùng: cùng một trình duyệt, tab 1 mở /slide (kéo sang TV cho khách),
// tab 2 mở /sale (màn Sale). Hai tab nói chuyện qua BroadcastChannel
// (lib/sale-monitor.ts) - không cần server showroom, chạy được cả trên Vercel.
//
// Không có logic slide ở đây: phân tích câu nghe (intent + catalog) chạy lại
// từ chính lib/intent + lib/static_slides nên tab Sale thấy ĐÚNG lý do mà
// machine trên TV đã quyết định.
// ============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { IntentTopic } from '@/lib/intent';
import type { SaleCmd } from '@/lib/ws-protocol';
import {
  MonitorBus, MonitorToTv, TOPIC_GUIDE, TOPIC_ORDER, TvSnapshot, TvToMonitor, UtteranceAnalysis,
  analyzeUtterance, openMonitorBus, searchCatalog, suggestNextTopics, topicKeywords,
} from '@/lib/sale-monitor';

type FeedInput =
  | { kind: 'heard'; at: number; text: string; a: UtteranceAnalysis }
  | { kind: 'log'; at: number; line: string };
type FeedItem = FeedInput & { id: number };

const MAX_FEED = 80;
const TV_STALE_MS = 20_000;

const STATE_VI: Record<string, string> = {
  idle: 'Chờ', listening: 'Đang nghe', querying: 'Đang tạo slide', processing: 'Đang xử lý',
  frozen: 'Đóng băng', mic_error: 'Mic lỗi', error: 'Lỗi mic', '—': '—',
};

const SOURCE_VI: Record<string, string> = {
  static_fast: 'slide tĩnh (từ khóa)',
  static_no_rag: 'slide tĩnh (RAG không khớp)',
  static_llm_text: 'slide tĩnh + LLM viết câu',
  dynamic_llm: 'LLM tạo mới (RAG)',
};

const VERDICT_STYLE: Record<UtteranceAnalysis['verdict'], { label: string; cls: string }> = {
  query: { label: 'TRUY VẤN', cls: 'bg-[#2E9E5B]/20 text-[#A8D94A] border-[#2E9E5B]/40' },
  catalog: { label: 'CATALOG', cls: 'bg-sky-500/15 text-sky-300 border-sky-400/40' },
  skip: { label: 'BỎ QUA', cls: 'bg-red-500/15 text-red-300 border-red-400/40' },
};

const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString('vi-VN', { hour12: false });

export default function SalePage() {
  const busRef = useRef<MonitorBus<MonitorToTv, TvToMonitor> | null>(null);
  const [busOk, setBusOk] = useState(true);
  const [snap, setSnap] = useState<TvSnapshot | null>(null);
  const [lastSeen, setLastSeen] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [showLogs, setShowLogs] = useState(true);
  const [pinnedTopic, setPinnedTopic] = useState<IntentTopic | null>(null);
  const [shownTitles, setShownTitles] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [queryText, setQueryText] = useState('');
  const idRef = useRef(0);

  const push = useCallback((item: FeedInput) => {
    // Chốt id NGAY tại đây: updater chạy trễ theo batch, đọc idRef trong đó thì
    // nhiều dòng cùng batch trùng key -> React vẽ trùng dòng.
    const id = ++idRef.current;
    setFeed(prev => [{ ...item, id }, ...prev].slice(0, MAX_FEED));
  }, []);

  useEffect(() => {
    const bus = openMonitorBus<MonitorToTv, TvToMonitor>();
    if (!bus) { setBusOk(false); return; }
    busRef.current = bus;
    const unsub = bus.subscribe(msg => {
      setLastSeen(Date.now());
      switch (msg.t) {
        case 'TV_HELLO':
          push({ kind: 'log', at: Date.now(), line: '📺 Tab TV vừa mở / tải lại' });
          bus.post({ t: 'MONITOR_HELLO' });
          break;
        case 'HEARD':
          push({ kind: 'heard', at: msg.at, text: msg.text, a: analyzeUtterance(msg.text) });
          break;
        case 'LOG':
          push({ kind: 'log', at: msg.at, line: msg.line });
          break;
        case 'SNAPSHOT':
          setSnap(msg.snap);
          if (msg.snap.slideTitle) {
            setShownTitles(prev => (prev.includes(msg.snap.slideTitle!) ? prev : [...prev, msg.snap.slideTitle!]));
          }
          break;
      }
    });
    bus.post({ t: 'MONITOR_HELLO' });
    const tick = setInterval(() => setNow(Date.now()), 5_000);
    return () => { clearInterval(tick); unsub(); bus.close(); busRef.current = null; };
  }, [push]);

  const post = useCallback((msg: MonitorToTv) => busRef.current?.post(msg), []);
  const cmd = useCallback((c: SaleCmd) => post({ t: 'SALE_CMD', cmd: c }), [post]);
  const show = useCallback((text: string) => {
    const q = text.trim();
    if (!q) return;
    post({ t: 'OVERRIDE_QUERY', text: q });
    push({ kind: 'log', at: Date.now(), line: `✏️ Sale chiếu: "${q}"` });
  }, [post, push]);

  // Chủ đề hiện tại: Sale ghim > câu gần nhất có topic > general.
  const heardTopic = useMemo(() => {
    for (const it of feed) {
      if (it.kind === 'heard' && it.a.intent.topic) return it.a.intent.topic;
    }
    return null;
  }, [feed]);
  const topic: IntentTopic = pinnedTopic || heardTopic || 'general';
  const suggestions = useMemo(() => suggestNextTopics(topic, shownTitles, 8), [topic, shownTitles]);
  const keywords = useMemo(() => topicKeywords(topic), [topic]);
  const catalogHits = useMemo(() => searchCatalog(search), [search]);

  const tvOnline = lastSeen > 0 && now - lastSeen < TV_STALE_MS;
  const frozen = snap?.machine === 'frozen';
  const visibleFeed = showLogs ? feed : feed.filter(it => it.kind === 'heard');

  return (
    <div className="min-h-screen bg-[#0b0c12] text-white" style={{ fontFamily: 'var(--font-display, sans-serif)' }}>
      {/* ── Thanh trạng thái TV ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-[#0b0c12]/95 backdrop-blur border-b border-white/10 px-5 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="mr-auto">
            <p className="text-[#e8b84b] font-bold tracking-[0.25em] uppercase text-xs">Ny&apos;ah · Sale Monitor</p>
            <p className="text-white/50 text-sm mt-0.5">
              {!busOk
                ? 'Trình duyệt không hỗ trợ BroadcastChannel - dùng Chrome/Edge'
                : tvOnline
                  ? `TV: ${STATE_VI[snap?.machine || '—'] || snap?.machine} · mic: ${STATE_VI[snap?.audio || '—'] || snap?.audio} · ${snap?.transport || '?'}${snap?.ws === 'reconnecting' ? ' · MẤT WS' : ''}`
                  : 'Chưa thấy TV - mở /slide ở tab khác của CÙNG trình duyệt này'}
            </p>
          </div>
          <span className={`w-3 h-3 rounded-full ${tvOnline ? 'bg-[#2E9E5B]' : 'bg-amber-400 animate-pulse'}`} aria-hidden />
        </div>
        {(snap?.errorMsg || snap?.errorNote) && (
          <p className="mt-2 text-red-300 text-sm">⚠️ {snap.errorMsg || snap.errorNote}</p>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-5 p-5">
        {/* ── CỘT TRÁI: TV đang chiếu gì + luồng nghe ───────────────────── */}
        <section className="min-w-0 space-y-4">
          <div className="rounded-2xl bg-[#101218] border border-white/10 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-white/40 text-xs uppercase tracking-wider">TV đang chiếu</p>
                <p className="font-semibold text-lg truncate">{snap?.slideTitle || 'Màn chờ'}</p>
                <p className="text-white/50 text-sm truncate">
                  {snap?.topicLabel ? `Chủ đề: ${snap.topicLabel}` : '—'}
                  {snap?.slideSource ? ` · nguồn: ${SOURCE_VI[snap.slideSource] || snap.slideSource}` : ''}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => cmd(frozen ? 'RESUME' : 'FREEZE')}
                  disabled={!tvOnline}
                  className={`px-4 py-2 rounded-xl font-bold text-sm active:scale-95 transition-transform disabled:opacity-40 ${frozen ? 'bg-[#2E9E5B] text-white' : 'bg-[#e8b84b] text-[#0b0c12]'}`}
                >
                  {frozen ? '▶ Tiếp tục' : '⏸ Đóng băng'}
                </button>
                <button
                  onClick={() => cmd('CLEAR')}
                  disabled={!tvOnline}
                  className="px-4 py-2 rounded-xl border border-red-400/40 text-red-300 font-bold text-sm active:scale-95 transition-transform disabled:opacity-40"
                >
                  🗑 Xoá
                </button>
              </div>
            </div>
            {!!snap?.recent?.length && (
              <p className="mt-2 text-white/40 text-xs truncate" title={snap.recent.join(' | ')}>
                Ngữ cảnh gửi server ({snap.recent.length} câu): {snap.recent.slice(-3).join(' | ')}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-white/40 text-xs uppercase tracking-wider">TV nghe gì · hiểu gì</h2>
            <label className="flex items-center gap-2 text-xs text-white/50 cursor-pointer">
              <input type="checkbox" checked={showLogs} onChange={e => setShowLogs(e.target.checked)} />
              hiện log kỹ thuật
            </label>
          </div>

          <ol className="space-y-2">
            {visibleFeed.length === 0 && (
              <li className="rounded-2xl bg-[#101218] border border-white/10 px-4 py-6 text-white/40 text-sm text-center">
                Chưa có gì. Bật mic trên TV và nói thử một câu về dự án.
              </li>
            )}
            {visibleFeed.map(it =>
              it.kind === 'log' ? (
                <li key={it.id} className="px-4 py-1.5 font-mono text-[11px] text-white/45 break-words">
                  <span className="text-white/25 mr-2">{fmtTime(it.at)}</span>{it.line}
                </li>
              ) : (
                <li key={it.id} className="rounded-2xl bg-[#101218] border border-white/10 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <span className={`shrink-0 mt-0.5 px-2 py-0.5 rounded-md border text-[11px] font-bold tracking-wide ${VERDICT_STYLE[it.a.verdict].cls}`}>
                      {VERDICT_STYLE[it.a.verdict].label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium break-words">🎧 {it.text}</p>
                      <p className="text-white/55 text-sm mt-1">
                        <span className="text-white/30 mr-2">{fmtTime(it.at)}</span>
                        {it.a.why}
                        {it.a.intent.topic && <> · chủ đề <b className="text-white/80">{TOPIC_GUIDE[it.a.intent.topic].label}</b></>}
                        {typeof it.a.intent.score === 'number' && <> · điểm {it.a.intent.score}</>}
                        {it.a.intent.detail && <> · mẫu <b className="text-white/80">{it.a.intent.detail}</b></>}
                      </p>
                      {it.a.verdict === 'query' && it.a.catalogTitle && (
                        <p className="text-sky-300/80 text-sm mt-0.5">📚 Slide tĩnh khớp: {it.a.catalogTitle}</p>
                      )}
                      {!!it.a.intent.hits?.length && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {it.a.intent.hits.map(h => (
                            <span key={h} className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/70">{h}</span>
                          ))}
                        </div>
                      )}
                      {it.a.verdict === 'skip' && (
                        <button
                          onClick={() => show(it.text)}
                          disabled={!tvOnline}
                          className="mt-2 text-xs text-[#e8b84b] underline underline-offset-2 disabled:opacity-40"
                        >
                          Vẫn chiếu câu này
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ),
            )}
          </ol>
        </section>

        {/* ── CỘT PHẢI: chủ đề, từ khóa, gợi ý nói tiếp, tra catalog ─────── */}
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-[72px] lg:self-start">
          <div className="rounded-2xl bg-[#101218] border border-white/10 px-4 py-3">
            <p className="text-white/40 text-xs uppercase tracking-wider mb-2">Chủ đề đang theo</p>
            <div className="flex flex-wrap gap-1.5">
              {TOPIC_ORDER.map(t => (
                <button
                  key={t}
                  onClick={() => setPinnedTopic(pinnedTopic === t ? null : t)}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                    t === topic ? 'bg-[#e8b84b] text-[#0b0c12] border-[#e8b84b] font-bold' : 'bg-transparent text-white/70 border-white/15'
                  }`}
                  title={pinnedTopic === t ? 'Bỏ ghim - theo hội thoại' : 'Ghim chủ đề này'}
                >
                  {TOPIC_GUIDE[t].label}{pinnedTopic === t ? ' 📌' : ''}
                </button>
              ))}
            </div>
            <p className="text-white/35 text-xs mt-2">
              {pinnedTopic ? 'Đang ghim. Bấm lại để theo hội thoại.' : 'Tự theo câu gần nhất TV nghe được. Bấm để ghim.'}
            </p>
          </div>

          <div className="rounded-2xl bg-[#101218] border border-white/10 px-4 py-3">
            <p className="text-white/40 text-xs uppercase tracking-wider mb-2">Nói tiếp gì? (bấm để chiếu)</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map(s => (
                <button
                  key={s.query}
                  onClick={() => show(s.query)}
                  disabled={!tvOnline}
                  className="px-4 py-2.5 rounded-full bg-[#0b0c12] border border-[#2E9E5B]/40 text-sm text-white/90 active:scale-95 transition-transform disabled:opacity-40"
                >
                  {s.label}
                </button>
              ))}
              {suggestions.length === 0 && <p className="text-white/40 text-sm">Đã chiếu hết gợi ý của chủ đề này.</p>}
            </div>
            <form className="mt-3 flex gap-2" onSubmit={e => { e.preventDefault(); show(queryText); setQueryText(''); }}>
              <input
                value={queryText}
                onChange={e => setQueryText(e.target.value)}
                placeholder="Gõ chủ đề muốn chiếu…"
                aria-label="Chủ đề muốn chiếu"
                className="flex-1 min-w-0 rounded-xl bg-[#0b0c12] border border-white/15 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#e8b84b]/60"
              />
              <button type="submit" disabled={!tvOnline} className="px-4 rounded-xl bg-[#e8b84b] text-[#0b0c12] font-bold text-sm disabled:opacity-40">Chiếu</button>
            </form>
          </div>

          <div className="rounded-2xl bg-[#101218] border border-white/10 px-4 py-3">
            <p className="text-white/40 text-xs uppercase tracking-wider mb-1">Từ TV nghe ra chủ đề này</p>
            <p className="text-white/35 text-xs mb-2"><b className="text-white/70">Đậm</b> = một từ là đủ. Mờ = cần thêm từ thứ hai trong cùng câu.</p>
            <div className="flex flex-wrap gap-1 max-h-[26vh] overflow-y-auto">
              {keywords.map(k => (
                <span
                  key={k.kw}
                  className={`px-2 py-0.5 rounded-full border text-xs ${k.strong ? 'bg-white/10 border-white/20 text-white font-semibold' : 'border-white/10 text-white/45'}`}
                >
                  {k.kw}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-[#101218] border border-white/10 px-4 py-3">
            <p className="text-white/40 text-xs uppercase tracking-wider mb-2">Tra slide có sẵn</p>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="vd: thang máy, pháp lý, sân bay…"
              aria-label="Tìm slide trong catalog"
              className="w-full rounded-xl bg-[#0b0c12] border border-white/15 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#e8b84b]/60"
            />
            <ul className="mt-2 space-y-1.5 max-h-[30vh] overflow-y-auto">
              {catalogHits.map(e => (
                <li key={e.title} className="flex items-start gap-2">
                  <button
                    onClick={() => show(e.query)}
                    disabled={!tvOnline}
                    className="shrink-0 mt-0.5 px-2 py-0.5 rounded-md bg-[#e8b84b]/15 text-[#e8b84b] text-[11px] font-bold disabled:opacity-40"
                  >
                    Chiếu
                  </button>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{e.title}</p>
                    <p className="text-white/40 text-xs break-words">
                      {e.allOf?.length ? `cần đủ: ${e.allOf.join(' + ')} · ` : ''}{e.keywords.slice(0, 8).join(', ')}{e.keywords.length > 8 ? '…' : ''}
                    </p>
                  </div>
                </li>
              ))}
              {search.trim() && catalogHits.length === 0 && (
                <li className="text-white/40 text-sm">Không có slide tĩnh nào khớp - TV sẽ phải nhờ LLM/RAG.</li>
              )}
            </ul>
          </div>
        </aside>
      </div>

      <p className="px-5 pb-5 text-white/25 text-xs">
        Tab này chỉ nghe được TV mở trong CÙNG trình duyệt (BroadcastChannel). Điều khiển từ điện thoại: dùng /companion qua server showroom.
      </p>
    </div>
  );
}
