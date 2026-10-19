/**
 * 「最初の描画が済むまで」待つ関門(純粋寄り・時計と PerformanceObserver は deps で注入)。v0.1.1684
 *
 * ■ なぜ要るか(2026-10-19・実機の履歴)
 *   サイドパネルの自己診断の早い測定は、画面中央で elementFromPoint を呼んで子 iframe のレイアウトを同期で強制する。
 *   起動直後(最初の描画の前)に走ると 150〜470ms 主スレッドが止まり、最初の描画(=縞の終わり)がその分遅れていた。
 *   実機の履歴で「最初の描画 ≒ 最初の停止の終わり + 約50ms」がほぼ全件で一致。計器が症状を延ばしていた。
 *
 * ■ 守ること
 *   - 最初の描画が来なくても必ず開く(fallbackMs): 黒いまま描画されない場合の測定が失われない。
 *   - 失敗(PerformanceObserver 非対応など)は即座に開く=従来どおり測る。
 */

/**
 * @param {{
 *   hasFirstPaint?: () => boolean,
 *   PerformanceObserverCtor?: any,
 *   setTimeoutRef?: (fn: () => void, ms: number) => unknown,
 *   fallbackMs?: number
 * }} [deps]
 * @returns {{ promise: Promise<void>, isOpen: () => boolean }}
 */
export function createFirstPaintGate(deps = {}) {
  const later = deps.setTimeoutRef || ((fn, ms) => setTimeout(fn, ms));
  const fallbackMs = deps.fallbackMs ?? 600;
  let open = false;
  /** @type {() => void} */
  let release = () => {};
  const promise = new Promise((resolve) => {
    release = () => {
      if (open) return;
      open = true;
      resolve(undefined);
    };
  });
  try {
    const has = deps.hasFirstPaint
      ? deps.hasFirstPaint()
      : typeof performance !== 'undefined' && performance.getEntriesByName('first-paint').length > 0;
    if (has) {
      release();
    } else {
      const Ctor = deps.PerformanceObserverCtor !== undefined ? deps.PerformanceObserverCtor : typeof PerformanceObserver !== 'undefined' ? PerformanceObserver : null;
      if (typeof Ctor !== 'function') {
        release();
      } else {
        const po = new Ctor(() => {
          try { po.disconnect(); } catch { /* no-op */ }
          release();
        });
        po.observe({ type: 'paint', buffered: true });
        later(release, fallbackMs);
      }
    }
  } catch {
    release();
  }
  return { promise, isOpen: () => open };
}
