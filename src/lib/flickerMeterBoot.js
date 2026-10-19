/**
 * 【層】L2 配線層(副作用あり・サイドパネルの popup から import するだけで起動する)
 * 【この箱に入るもの】popup の画面の書き換えを MutationObserver で数え、4秒ごとに chrome.storage.session へ写しを書く常駐処理
 * 【この箱に入らないもの】数え方・文言(flickerMeter.js)・DOM の変更・描画
 * 【書けるstorageキー】nls_flicker_meter_sidepanel_v1(session)
 * 【正本宣言】画面の書き換えの採取と報告はこのファイルのみ
 *
 * flickerMeterBoot.js — v0.1.1686「ちらつき計」(実機で『どこがちらつくか』を裏どりする)
 *
 * ■ 負荷の上限(計器が症状になっては本末転倒)
 *   ・DOM を触らない・数えるだけ。MutationObserver の1回の通知は先頭 MAX_RECORDS_PER_BATCH 件だけ処理する。
 *   ・storage への書き込みは 4 秒に 1 回・変化があったときだけ・session のみ(ディスクへ書かない)。
 *   ・計器自身が使った時間(ms)を速報に出す=計器が重くなっていないことを実機で確かめられる。
 *   ・起動するのはサイドパネルの popup(dock=sidepanel)だけ。
 * @module flickerMeterBoot
 */

import { createFlickerMeter, FLICKER_METER_STORAGE_KEY } from './flickerMeter.js';

const PUBLISH_MS = 4000;
const MAX_RECORDS_PER_BATCH = 5000;

/**
 * 近い祖先の id か nl- で始まる class を場所の名前にする(例: #liveStatComments / .nl-story-growth-icon)。
 * @param {any} node Element か Text
 * @param {WeakMap<object, string>} cache
 * @returns {string}
 */
export function regionKeyOf(node, cache) {
  const el = node && node.nodeType === 3 ? node.parentElement : node;
  if (!el || el.nodeType !== 1) return '(不明)';
  const hit = cache.get(el);
  if (hit) return hit;
  let cur = el;
  let key = '';
  for (let i = 0; i < 8 && cur && cur.nodeType === 1; i += 1) {
    if (cur.id) {
      key = `#${cur.id}`;
      break;
    }
    const cls = cur.classList && Array.prototype.find.call(cur.classList, (/** @type {string} */ c) => c.startsWith('nl-'));
    if (cls) {
      key = `.${cls}`;
      break;
    }
    cur = cur.parentElement;
  }
  if (!key) key = String(el.tagName || '?').toLowerCase();
  cache.set(el, key);
  return key;
}

/**
 * @param {{
 *   doc: any, MutationObserverCtor: any, session: any,
 *   now?: () => number, perfNow?: () => number,
 *   setIntervalRef?: (fn: () => void, ms: number) => any
 * }} env
 * @returns {{ stop: () => void, meter: ReturnType<typeof createFlickerMeter> }}
 */
export function startFlickerMeter(env) {
  const meter = createFlickerMeter({ now: env.now });
  const perfNow = env.perfNow || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const cache = new WeakMap();
  const elOf = (/** @type {any} */ n) => (n && n.nodeType === 3 ? n.parentElement : n);
  const countEls = (/** @type {any} */ list) => {
    let n = 0;
    if (list) for (let i = 0; i < list.length; i += 1) if (list[i] && list[i].nodeType === 1) n += 1;
    return n;
  };
  const observer = new env.MutationObserverCtor((/** @type {any[]} */ records) => {
    const t0 = perfNow();
    const n = Math.min(records.length, MAX_RECORDS_PER_BATCH);
    for (let i = 0; i < n; i += 1) {
      const r = records[i];
      try {
        if (r.type === 'attributes') {
          const t = r.target;
          meter.record({ kind: 'attr', region: regionKeyOf(t, cache), el: t, name: r.attributeName, oldValue: r.oldValue, newValue: t.getAttribute(r.attributeName) });
        } else if (r.type === 'characterData') {
          meter.record({ kind: 'text', region: regionKeyOf(r.target, cache), el: r.target, oldValue: r.oldValue, newValue: r.target.data });
        } else if (r.type === 'childList') {
          const added = countEls(r.addedNodes);
          const removed = countEls(r.removedNodes);
          if (added || removed) meter.record({ kind: 'childList', region: regionKeyOf(elOf(r.target), cache), added, removed });
        }
      } catch {
        /* 1件の失敗で止めない */
      }
    }
    meter.addSelfMs(perfNow() - t0);
  });
  observer.observe(env.doc.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ['src', 'class', 'style', 'hidden'],
    characterData: true,
    characterDataOldValue: true
  });
  const publish = () => {
    try {
      if (!meter.takeDirty()) return;
      const p = env.session.set({ [FLICKER_METER_STORAGE_KEY]: meter.snapshot() });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      /* 拡張更新後の Extension context invalidated 等 */
    }
  };
  const iv = (env.setIntervalRef || ((fn, ms) => setInterval(fn, ms)))(publish, PUBLISH_MS);
  return {
    meter,
    stop() {
      try {
        observer.disconnect();
      } catch {
        /* no-op */
      }
      try {
        clearInterval(iv);
      } catch {
        /* no-op */
      }
    }
  };
}

/** サイドパネルの popup(dock=sidepanel)で import するだけで起動する。二重起動しない。 */
export function autoStartFlickerMeter() {
  try {
    const g = /** @type {any} */ (globalThis);
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    if (g.__nlsFlickerMeter) return;
    if (!/[?&]dock=sidepanel(?:&|$)/.test(String(g.location && g.location.search))) return;
    const session = g.chrome && g.chrome.storage && g.chrome.storage.session;
    if (!session || typeof session.set !== 'function') return;
    g.__nlsFlickerMeter = startFlickerMeter({ doc: document, MutationObserverCtor: MutationObserver, session });
  } catch {
    /* 計器の起動失敗で画面を壊さない */
  }
}

autoStartFlickerMeter();
