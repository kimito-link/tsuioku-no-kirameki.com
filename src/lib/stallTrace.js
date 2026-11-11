/**
 * 画面が止まったときの記録。時刻・長さ・拡張のファイル名とドメインだけ。
 * URL とコメント本文は残さない。メモリには直近50件。60秒ごとに要約を渡す。
 */

export const STALL_RING_MAX = 50;
export const STALL_FLUSH_MS = 60_000;
export const STALL_PAGE_KEEP = 200;

/**
 * LoAF が使えるならそれを使う。content script で observe が失敗したら心拍のずれ。
 * @param {{ loafSupported: boolean }} s
 * @returns {'loaf' | 'heartbeat'}
 */
/**
 * 状態速報に足す1行。URL もコメント本文も出さない。
 * @param {any} rec
 * @returns {string}
 */
export function stallOverviewLine(rec) {
  if (!rec || typeof rec !== 'object') return '';
  return (
    `\n画面の固まり: ${Number(rec.over100) || 0}回が100ms以上 / 最長${Number(rec.max) || 0}ms` +
    ` ファイル=${String(rec.lastFile || '—')} ドメイン=${String(rec.lastDomain || '—')} 欄=${String(rec.lastSection || '—')}` +
    ` 書き込み=${Number(rec.writeN) || 0}回/分 ${Number(rec.writeBytesPerMin) || 0}B 最大=${Number(rec.writeMaxBytes) || 0}B(${String(rec.writeMaxKey || '—')})`
  );
}

/** @param {{ loafSupported?: boolean } | null | undefined} s */
export function chooseStallSource(s) {
  return s && s.loafSupported === true ? 'loaf' : 'heartbeat';
}

/**
 * @param {unknown} name
 * @returns {string}
 */
export function stallFileName(name) {
  const raw = String(name || '');
  if (!raw) return '';
  if (raw.includes('://') && !raw.startsWith('chrome-extension:') && !raw.startsWith('moz-extension:')) return '';
  const base = raw.split('?')[0].split('#')[0].split('/').pop() || '';
  if (!base.endsWith('.js') || base.includes(' ')) return '';
  return base.slice(0, 80);
}

/**
 * @param {unknown} host
 * @returns {string}
 */
export function stallDomain(host) {
  const s = String(host || '').trim().toLowerCase();
  if (!s || s.includes('/') || s.includes(' ') || s.includes('://')) return '';
  return s.slice(0, 80);
}

/**
 * @returns {{ events: { t: number, dur: number, file: string, domain: string, section: string }[], note: (ev: { t?: number, dur?: number, file?: string, domain?: string, section?: string }) => void, summary: () => { v: number, n: number, max: number, over100: number, over50: number, lastFile: string, lastDomain: string, lastSection: string } }}
 */
export function createStallRing() {
  /** @type {{ t: number, dur: number, file: string, domain: string, section: string }[]} */
  const events = [];
  return {
    events,
    note(ev) {
      const file = stallFileName(ev?.file);
      const domain = stallDomain(ev?.domain);
      const section = String(ev?.section || '').slice(0, 40);
      if (section.includes('://') || section.includes('/')) return;
      const row = {
        t: Number(ev?.t) || 0,
        dur: Math.max(0, Math.round(Number(ev?.dur) || 0)),
        file,
        domain,
        section,
      };
      events.push(row);
      if (events.length > STALL_RING_MAX) events.splice(0, events.length - STALL_RING_MAX);
    },
    summary() {
      let max = 0;
      let over100 = 0;
      let over50 = 0;
      for (const e of events) {
        if (e.dur > max) max = e.dur;
        if (e.dur >= 100) over100 += 1;
        else if (e.dur >= 50) over50 += 1;
      }
      const last = events[events.length - 1];
      return {
        v: 1,
        n: events.length,
        max,
        over100,
        over50,
        lastFile: last?.file || '',
        lastDomain: last?.domain || '',
        lastSection: last?.section || '',
      };
    },
  };
}

/**
 * ページごとの直近を 200 件で打ち切る。
 * @param {readonly { t: number }[]} prev
 * @param {readonly { t: number }[]} incoming
 * @returns {{ t: number }[]}
 */
export function capStallPage(prev, incoming) {
  const all = (Array.isArray(prev) ? prev : []).concat(Array.isArray(incoming) ? incoming : []);
  return all.slice(-STALL_PAGE_KEEP);
}

/**
 * 拡張の画面と content script で、長いフレームを環に積む。
 * @param {{
 *   file?: string,
 *   section?: () => string,
 *   send?: (summary: ReturnType<ReturnType<typeof createStallRing>['summary']>) => void,
 *   flushMs?: number,
 *   PerformanceObserver?: typeof PerformanceObserver,
 *   requestAnimationFrame?: (cb: (t: number) => void) => number,
 *   cancelAnimationFrame?: (id: number) => void,
 *   setInterval?: (cb: () => void, ms: number) => number,
 *   clearInterval?: (id: number) => void,
 *   now?: () => number,
 *   hostname?: string,
 *   protocol?: string,
 * }} [deps]
 * @returns {{ stop: () => void, source: 'loaf' | 'heartbeat', ring: ReturnType<typeof createStallRing> }}
 */
export function startPageStallWatch(deps = {}) {
  const ring = createStallRing();
  const host = deps.hostname != null ? String(deps.hostname) : (typeof location !== 'undefined' ? location.hostname : '');
  const protocol = deps.protocol != null ? String(deps.protocol) : (typeof location !== 'undefined' ? location.protocol : '');
  const PO = deps.PerformanceObserver || (typeof PerformanceObserver !== 'undefined' ? PerformanceObserver : null);
  let source = /** @type {'loaf' | 'heartbeat'} */ ('heartbeat');
  /** @type {PerformanceObserver | null} */
  let obs = null;
  let rafId = 0;
  let timer = 0;
  let stopped = false;
  const ownFile = stallFileName(deps.file) || 'page.js';
  const sectionOf = () => {
    try {
      return String(deps.section?.() || '').slice(0, 40);
    } catch {
      return '';
    }
  };
  const noteDur = (/** @type {number} */ dur, /** @type {string} */ file) => {
    if (!(dur >= 50)) return;
    ring.note({ t: Date.now(), dur, file: file || ownFile, domain: host, section: sectionOf() });
  };
  try {
    if (PO) {
      obs = new PO((list) => {
        for (const entry of list.getEntries()) {
          const scripts = /** @type {{ sourceURL?: string }[]} */ (/** @type {any} */ (entry).scripts || []);
          let file = '';
          for (const sc of scripts) {
            const name = stallFileName(sc?.sourceURL);
            if (name.endsWith('.js')) {
              file = name;
              break;
            }
          }
          if (!file && protocol === 'chrome-extension:') file = ownFile;
          if (!file) file = ownFile;
          noteDur(Number(entry.duration) || 0, file);
        }
      });
      obs.observe({ type: 'long-animation-frame', buffered: true });
      source = 'loaf';
    }
  } catch {
    source = 'heartbeat';
    try { obs?.disconnect(); } catch { /* 使えなければ心拍 */ }
    obs = null;
  }
  if (source === 'heartbeat') {
    const raf = deps.requestAnimationFrame || (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : null);
    const nowFn = deps.now || (typeof performance !== 'undefined' ? () => performance.now() : () => Date.now());
    if (raf) {
      let last = nowFn();
      const tick = (/** @type {number} */ t) => {
        if (stopped) return;
        const drift = t - last - 16;
        last = t;
        noteDur(drift, ownFile);
        rafId = raf(tick);
      };
      rafId = raf(tick);
    }
  }
  const setInt = deps.setInterval || (typeof setInterval !== 'undefined' ? setInterval : null);
  if (setInt && deps.send) {
    timer = setInt(() => {
      try { deps.send?.(ring.summary()); } catch { /* 計器は本体を止めない */ }
    }, deps.flushMs || STALL_FLUSH_MS);
  }
  return {
    source: chooseStallSource({ loafSupported: source === 'loaf' }),
    ring,
    stop() {
      stopped = true;
      try { obs?.disconnect(); } catch { /* no-op */ }
      const cancel = deps.cancelAnimationFrame || (typeof cancelAnimationFrame !== 'undefined' ? cancelAnimationFrame : null);
      if (cancel && rafId) cancel(rafId);
      const clear = deps.clearInterval || (typeof clearInterval !== 'undefined' ? clearInterval : null);
      if (clear && timer) clear(timer);
    },
  };
}
