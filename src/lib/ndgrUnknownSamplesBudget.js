/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】watch ページの `<html>` に書く診断属性の【予算】と切り詰め
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*(import も禁止)
 * 【書けるstorageキー】なし
 * 【正本宣言】診断属性の上限はこのファイルのみ
 *
 * ndgrUnknownSamplesBudget.js — 診断属性を無限に太らせないための予算。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ ★ユーザー指示(2026-08-21)がこのモジュールの出発点
 *   「表面的なものを考えるんじゃなくて、まず MCP デベロッパーツールで
 *     現在の DOM を全部把握して、それを計器に入れる基本から見直すべき」
 *
 *   実際に DevTools の Elements を見たら、watch ページの `<html>` に
 *   拡張がこれを書き込んでいた:
 *     data-nls-ndgr-unknown-samples={巨大なJSON}
 *     data-nls-fetch-log=[長大なURL列]
 *     data-nls-page-intercept-xhr="4068"
 *
 * ■ ★見つけた欠陥(コードで確認・推測ではない)
 *   `page-intercept-entry.js:555-569` の `_ndgrUnknownSamples`:
 *     ・**lifetime 蓄積**(消えない)
 *     ・上限は **1キーあたり3件だけ**
 *     ・★**キーの個数に上限が無い**
 *   `publishNdgrUnknownSamples()`(:571) は
 *   ★**毎回オブジェクト全体を JSON.stringify して属性へ書き直す**。
 *
 *   ＝ キーが増えるほど1回の書き込みが重くなる。
 *   ★属性の書き換えはスタイル再計算・レイアウトを誘発するので、
 *   実測したメインスレッド停止(最悪4,776ms・16.7秒中15.9秒)の候補になる。
 *
 * ■ 掟
 *   ・**キー数とバイト数の両方**に上限を持つ(片方だけだと片肺)
 *   ・上限に当たったら**新しいものを足さない**(既存は消さない=観測の連続性)
 *   ・★**捨てたことを隠さない**(切り捨ての印を残す)
 *     [[discarded-pass-reason-makes-greens-unreadable-2026-08-12]]
 * ───────────────────────────────────────────────────────────────────────────
 */

/** 1キーあたりに溜める件数。★既存(page-intercept-entry.js:556)と同値＝挙動を変えない。 */
export const NDGR_UNKNOWN_SAMPLES_MAX_PER_KEY = 3;

/**
 * ★溜めてよいキーの個数。ここが元の欠陥(上限が無かった)。
 * 未知フィールドの種類は本来ごく少数なので、32もあれば診断には十分。
 */
export const NDGR_UNKNOWN_SAMPLES_MAX_KEYS = 32;

/**
 * ★属性へ書き出してよい総バイト数。
 * DOM 属性は書くたびにパース・スタイル再計算を誘発するため、
 * 「診断のために本体を重くする」ことが無いよう小さく抑える。
 */
export const NDGR_UNKNOWN_SAMPLES_MAX_BYTES = 8 * 1024;

/**
 * @typedef {object} UnknownSamplesState
 * @property {Record<string, unknown[]>} samples 溜めたサンプル
 * @property {number} droppedKeys 上限で足さなかったキーの数
 */

/** @param {any} state @returns {UnknownSamplesState} */
function ensure(state) {
  if (!state.samples || typeof state.samples !== 'object') state.samples = {};
  if (typeof state.droppedKeys !== 'number') state.droppedKeys = 0;
  return state;
}

/**
 * 上限つきでサンプルを取り込む(破壊的更新)。
 *
 * ★上限に当たったら**新しいキーを足さない**。既存は消さない。
 *   (消すと「さっきまで見えていた診断が消える」＝別の混乱を生む)
 *
 * @param {any} state 蓄積先。`{ samples, droppedKeys }` を持つ
 * @param {unknown} incoming `{ key: サンプル配列 }`
 * @returns {UnknownSamplesState}
 */
export function mergeNdgrUnknownSamplesBounded(state, incoming) {
  const st = ensure(state && typeof state === 'object' ? state : {});
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return st;

  for (const key of Object.keys(/** @type {Record<string, unknown>} */ (incoming))) {
    const existing = st.samples[key];
    if (!existing) {
      // ★新しいキー。上限に達していたら足さない(捨てた事実は数で残す)。
      if (Object.keys(st.samples).length >= NDGR_UNKNOWN_SAMPLES_MAX_KEYS) {
        st.droppedKeys += 1;
        continue;
      }
      st.samples[key] = [];
    }
    const slot = st.samples[key];
    if (slot.length >= NDGR_UNKNOWN_SAMPLES_MAX_PER_KEY) continue;
    const rows = Array.isArray(/** @type {any} */ (incoming)[key])
      ? /** @type {any} */ (incoming)[key]
      : [];
    for (const row of rows) {
      if (slot.length >= NDGR_UNKNOWN_SAMPLES_MAX_PER_KEY) break;
      slot.push(row);
    }
  }
  return st;
}

/**
 * 属性へ書ける文字列にする。★総バイト数の上限で切る。
 *
 * ★切ったときは `truncated` を含む形にして、**捨てたことを隠さない**。
 *
 * @param {any} state
 * @returns {string}
 */
export function serializeNdgrUnknownSamples(state) {
  const st = ensure(state && typeof state === 'object' ? state : {});
  const keys = Object.keys(st.samples);
  if (keys.length === 0) return '{}';

  let json = '';
  try {
    json = JSON.stringify(st.samples);
  } catch {
    return JSON.stringify({ truncated: 'serialize_failed' });
  }
  if (json.length <= NDGR_UNKNOWN_SAMPLES_MAX_BYTES && !st.droppedKeys) return json;

  /*
   * ★上限超過。キーを減らしながら収まるところまで削る。
   *   ここで「全部消す」ことはしない(診断が何も見えなくなる)。
   */
  /** @type {Record<string, unknown[]>} */
  const kept = {};
  let used = 2; // "{}" ぶん
  let truncatedKeys = 0;
  for (const key of keys) {
    let piece = '';
    try {
      piece = JSON.stringify(st.samples[key]);
    } catch {
      truncatedKeys += 1;
      continue;
    }
    const cost = key.length + piece.length + 4;
    if (used + cost > NDGR_UNKNOWN_SAMPLES_MAX_BYTES - 64) {
      truncatedKeys += 1;
      continue;
    }
    kept[key] = st.samples[key];
    used += cost;
  }
  const out = {
    ...kept,
    // ★何をどれだけ捨てたかを必ず残す。
    truncated: { keys: truncatedKeys, droppedKeys: st.droppedKeys }
  };
  try {
    const s = JSON.stringify(out);
    return s.length <= NDGR_UNKNOWN_SAMPLES_MAX_BYTES
      ? s
      : JSON.stringify({ truncated: { keys: keys.length, droppedKeys: st.droppedKeys } });
  } catch {
    return JSON.stringify({ truncated: 'serialize_failed' });
  }
}
