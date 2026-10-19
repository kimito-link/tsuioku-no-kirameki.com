/**
 * 【層】L2 配線層(副作用あり・サイドパネルの popup から import するだけで起動する)
 * 【この箱に入るもの】popup(子)自身の起動の節目・長い処理・段階を、自分の時計で控え、開いて 6秒・16秒の2回だけ session へ写しを書く常駐処理
 * 【この箱に入らないもの】年表の組み立て・文言(bootTimeline.js)・DOM の変更
 * 【書けるstorageキー】nls_boot_timeline_sidepanel_v1(session)
 * 【正本宣言】popup 側の起動の年表の採取と報告はこのファイルのみ
 *
 * bootTimelineBoot.js — v0.1.1687
 *   負荷の上限: longtask の観測 1 本・書き込みは 2 回だけ(session)・DOM は触らない。起動するのはサイドパネルの popup(dock=sidepanel)だけ。
 * @module bootTimelineBoot
 */

import { BOOT_TIMELINE_STORAGE_KEY, buildBootTimelineRecord, createLongTaskLog } from './bootTimeline.js';
import { snapshotWatchPopupPhaseLog } from './watchPopupLoadDiagnostics.js';

/**
 * @param {{
 *   PerformanceObserverCtor: any, perf: any, session: any,
 *   now?: () => number,
 *   setTimeoutRef?: (fn: () => void, ms: number) => any,
 *   publishAtMs?: number[]
 * }} env
 * @returns {{ stop: () => void, log: ReturnType<typeof createLongTaskLog> }}
 */
export function startBootTimeline(env) {
  const now = env.now || (() => Date.now());
  const later = env.setTimeoutRef || ((fn, ms) => setTimeout(fn, ms));
  const log = createLongTaskLog();
  /** @type {any} */
  let observer = null;
  try {
    observer = new env.PerformanceObserverCtor((/** @type {any} */ list) => {
      for (const e of list.getEntries()) log.add(e.startTime, e.duration);
    });
    observer.observe({ type: 'longtask', buffered: true });
  } catch {
    observer = null; // longtask 非対応でも、節目と段階は出す
  }
  const publish = () => {
    try {
      const perf = env.perf;
      const navEntry = perf.getEntriesByType('navigation')[0] || {};
      const fpEntry = perf.getEntriesByName('first-paint')[0];
      const rec = buildBootTimelineRecord({
        at: now(),
        timeOrigin: perf.timeOrigin,
        nav: {
          responseEnd: navEntry.responseEnd,
          domInteractive: navEntry.domInteractive,
          domContentLoaded: navEntry.domContentLoadedEventEnd,
          load: navEntry.loadEventEnd > 0 ? navEntry.loadEventEnd : null,
          firstPaint: fpEntry ? fpEntry.startTime : null
        },
        longTasks: log.snapshot(),
        phases: snapshotWatchPopupPhaseLog()
      });
      const p = env.session.set({ [BOOT_TIMELINE_STORAGE_KEY]: rec });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      /* 拡張更新後の Extension context invalidated 等 */
    }
  };
  const handles = (env.publishAtMs || [6000, 16000]).map((ms) => later(publish, ms));
  return {
    log,
    stop() {
      try { if (observer) observer.disconnect(); } catch { /* no-op */ }
      for (const h of handles) { try { clearTimeout(h); } catch { /* no-op */ } }
    }
  };
}

/** サイドパネルの popup(dock=sidepanel)で import するだけで起動する。二重起動しない。 */
export function autoStartBootTimeline() {
  try {
    const g = /** @type {any} */ (globalThis);
    if (typeof performance === 'undefined' || typeof PerformanceObserver === 'undefined') return;
    if (g.__nlsBootTimeline) return;
    if (!/[?&]dock=sidepanel(?:&|$)/.test(String(g.location && g.location.search))) return;
    const session = g.chrome && g.chrome.storage && g.chrome.storage.session;
    if (!session || typeof session.set !== 'function') return;
    g.__nlsBootTimeline = startBootTimeline({ PerformanceObserverCtor: PerformanceObserver, perf: performance, session });
  } catch {
    /* 計器の起動失敗で画面を壊さない */
  }
}

autoStartBootTimeline();
