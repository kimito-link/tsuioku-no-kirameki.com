/**
 * 【層】L2 配線層(副作用あり・各拡張文書から1行 import で起動する)
 * 【この箱に入るもの】文書ごとの忙しさ(longtask・心拍のずれ・storage.onChanged・ヒープ)を数え、
 *                     60秒ごとに Service Worker へ要約を送る常駐処理
 * 【この箱に入らないもの】storage への書き込み(書き手は ext-census-sw.js の1か所)・DOM・描画
 * 【書けるstorageキー】なし
 * 【正本宣言】文書側の忙しさの採取と報告はこのファイルのみ
 *
 * extDocBusyCensusBoot.js — ★ページを開かなくても、拡張プロセスの犯人を名指しできるようにする常駐計器。
 *
 * ■ 負荷の上限(計器が負荷になっては本末転倒)
 *   ・タイマーは 2 本だけ(心拍 1 秒・報告 60 秒)。起動 10 秒後に初回報告を 1 回だけ前倒しする。
 *   ・storage.onChanged はキー名を数えるだけ。バイトは族ごとに 30 秒に 1 回だけ JSON.stringify で測る。
 *   ・報告は ≤400B を runtime.sendMessage で 1 通。storage には【書かない】。
 *   ・失敗(コンテキスト無効・SW 不在)は全部握る。本処理を壊さない。
 * ■ 測り方は extDocBusyCensus.js の冒頭を参照(longtask は実行した当人にだけ届く)。
 *
 * @module extDocBusyCensusBoot
 */

import {
  createDocCensus,
  detectExtSurface,
  noteHeap,
  noteLag,
  noteLongTask,
  noteOnChanged,
  summarizeDocCensus
} from './extDocBusyCensus.js';
import { EXT_CENSUS_MESSAGE_TYPE } from './extProcessCensusKey.js';

/** 心拍の間隔[ms]。 */
const HEARTBEAT_MS = 1000;
/** 報告の間隔[ms]。 */
const REPORT_MS = 60_000;
/** 初回報告を前倒しする遅延[ms](状態ページを起動直後に開いても何か見えるように)。 */
const FIRST_REPORT_MS = 10_000;

/**
 * @typedef {object} CensusEnv
 * @property {{ location: { pathname: string, search: string }, document: { hidden: boolean }, top?: unknown }} win
 * @property {any} chromeApi chrome 相当(runtime.sendMessage / storage.onChanged)
 * @property {any} [perf] performance 相当(memory だけ使う)
 * @property {any} [PerformanceObserverCtor]
 * @property {() => number} [now]
 * @property {() => string} [randomId]
 */

/**
 * @param {CensusEnv} env
 * @returns {{ stop: () => void }}
 */
export function startExtDocBusyCensus(env) {
  const now = typeof env.now === 'function' ? env.now : () => Date.now();
  const randomId = typeof env.randomId === 'function'
    ? env.randomId
    : () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  const census = createDocCensus({
    surface: detectExtSurface(env.win.location.pathname, env.win.location.search),
    nowMs: now(),
    instanceId: randomId()
  });

  /** @type {Array<() => void>} */
  const cleanups = [];

  // ① 長い処理(longtask)=犯人側。別のタブの処理は届かない。★同じタブ内の親子 iframe は同じものを全員が受け取るので、
  //   containerType で実行元を分ける: top 文書は window=自分/iframe=子、iframe 文書は iframe=自分か兄弟/window=親。
  let isFrame = false;
  try {
    const top = env.win.top;
    isFrame = !!top && top !== env.win;
  } catch {
    isFrame = true; // cross-origin の親から見た読み取り失敗=iframe 扱い
  }
  try {
    const Ctor = env.PerformanceObserverCtor;
    if (typeof Ctor === 'function') {
      const po = new Ctor((/** @type {any} */ list) => {
        try {
          for (const e of list.getEntries()) {
            const ct = e.attribution && e.attribution[0] ? e.attribution[0].containerType : '';
            noteLongTask(census, e.duration, isFrame ? ct === 'window' : ct === 'iframe');
          }
        } catch { /* 計器の失敗で本処理を壊さない */ }
      });
      po.observe({ type: 'longtask', buffered: true });
      cleanups.push(() => { try { po.disconnect(); } catch { /* no-op */ } });
    }
  } catch { /* longtask 非対応の環境 */ }

  // ② 自分が受けた遅れ(心拍のずれ)=被害側。★非表示のあいだは数えない(裏タブのタイマー間引きは忙しさではない)。
  let lastBeat = now();
  const hb = setInterval(() => {
    try {
      const t = now();
      const hidden = !!(env.win.document && env.win.document.hidden);
      if (!hidden) noteLag(census, t - lastBeat - HEARTBEAT_MS);
      lastBeat = t;
    } catch { /* no-op */ }
  }, HEARTBEAT_MS);
  cleanups.push(() => clearInterval(hb));

  // ③ storage.onChanged をキー族別に数える(バイトは族ごと 30 秒に 1 回だけ測る)。
  try {
    env.chromeApi?.storage?.onChanged?.addListener?.((/** @type {Record<string, any>} */ changes, /** @type {string} */ area) => {
      if (area !== 'local' || !changes) return;
      try {
        const t = now();
        for (const k of Object.keys(changes)) {
          noteOnChanged(census, k, {
            nowMs: t,
            bytesOf: () => {
              const v = changes[k] && changes[k].newValue;
              return v === undefined ? 0 : JSON.stringify(v).length;
            }
          });
        }
      } catch { /* no-op */ }
    });
  } catch { /* chrome.storage 不在 */ }

  // ④ 報告(≤400B・runtime.sendMessage で SW へ。storage には書かない)。
  const report = () => {
    try {
      const mem = env.perf && env.perf.memory;
      if (mem) noteHeap(census, mem.usedJSHeapSize, mem.jsHeapSizeLimit);
      const r = summarizeDocCensus(census, now());
      const send = env.chromeApi?.runtime?.sendMessage;
      if (typeof send === 'function') {
        const p = send.call(env.chromeApi.runtime, { type: EXT_CENSUS_MESSAGE_TYPE, report: r }, () => {
          void env.chromeApi?.runtime?.lastError; // 受け手(SW)不在の警告を握る
        });
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch { /* 拡張更新後の Extension context invalidated 等 */ }
  };
  const first = setTimeout(report, FIRST_REPORT_MS);
  cleanups.push(() => clearTimeout(first));
  const rep = setInterval(report, REPORT_MS);
  cleanups.push(() => clearInterval(rep));

  return {
    stop() {
      for (const fn of cleanups.splice(0)) fn();
    }
  };
}

/**
 * 拡張文書(window がある)で import するだけで起動する。二重起動しない。
 * テストや非拡張環境(chrome.runtime が無い)では何もしない。
 */
export function autoStartExtDocBusyCensus() {
  try {
    const g = /** @type {any} */ (globalThis);
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (g.__nlsExtDocBusyCensus) return;
    const c = g.chrome;
    if (!c || !c.runtime || typeof c.runtime.sendMessage !== 'function' || !c.runtime.id) return;
    g.__nlsExtDocBusyCensus = startExtDocBusyCensus({
      win: window,
      chromeApi: c,
      perf: typeof performance !== 'undefined' ? performance : undefined,
      PerformanceObserverCtor: typeof PerformanceObserver !== 'undefined' ? PerformanceObserver : undefined
    });
  } catch { /* 計器の起動失敗で文書を壊さない */ }
}

autoStartExtDocBusyCensus();
