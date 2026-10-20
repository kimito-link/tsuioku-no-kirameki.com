/**
 * rankOrderMeterBoot.js — 順位計(rankOrderMeter.js)を popup から1行で呼べるようにする薄い層(2026-10-20)。
 *
 * popup は描画のたびに `noteRankOrder(上位10の userKey)` を呼ぶだけ。ここが
 *   ① サイドパネルの popup のときだけ(視聴ページ内の inline popup は書かない=同じキーの上書き合戦を避ける)
 *   ② 記録が増えていて、かつ最短 PUBLISH_MIN_MS 経過したときだけ
 *   chrome.storage.session に書く(storage.session は拡張全体の onChanged を起こすので小さく・まれに)。
 *   失敗(拡張更新後の context invalidated など)は黙って諦める=描画を壊さない。
 * サイドパネル側(sidepanel-entry.js)が読んで、状態速報の1行にする(ちらつき計と同じ型)。
 * @module rankOrderMeterBoot
 */
import { createRankOrderMeter, RANK_ORDER_METER_STORAGE_KEY } from './rankOrderMeter.js';

/** 書き込みの最短間隔。 */
export const PUBLISH_MIN_MS = 3000;

/**
 * @param {{ now: () => number, isSidePanel: () => boolean, session?: { set?: (o: Record<string, unknown>) => any } }} env
 */
export function createRankOrderPublisher(env) {
  const meter = createRankOrderMeter(env.now());
  let lastPublishAt = -Infinity;
  return {
    meter,
    /** @param {readonly string[]} topKeys */
    note(topKeys) {
      try {
        const now = env.now();
        meter.note(topKeys, now);
        if (!env.isSidePanel()) return;
        if (now - lastPublishAt < PUBLISH_MIN_MS) return;
        if (!meter.takeDirty()) return;
        lastPublishAt = now;
        const p = env.session && typeof env.session.set === 'function'
          ? env.session.set({ [RANK_ORDER_METER_STORAGE_KEY]: meter.snapshot(now) })
          : null;
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {
        /* 計器の失敗で描画を壊さない */
      }
    }
  };
}

/** popup 本体が使う実体(サイドパネル判定は dock=sidepanel のクエリ)。 */
const _publisher = createRankOrderPublisher({
  now: () => Date.now(),
  isSidePanel: () => {
    try {
      return new URLSearchParams(globalThis.location?.search || '').get('dock') === 'sidepanel';
    } catch {
      return false;
    }
  },
  session: /** @type {any} */ (globalThis).chrome?.storage?.session
});

/** @param {readonly string[]} topKeys 上位10人の userKey(並び順) */
export function noteRankOrder(topKeys) {
  _publisher.note(topKeys);
}
