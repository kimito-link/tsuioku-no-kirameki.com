/**
 * supportersParity.js — popup の応援ランキング(鏡)と、診断のレポート集計の【上位の値】を突き合わせる純関数(2026-10-20)。
 *
 * 背景: 数字の設計の調査で、「応援者ランキング」の件数が面ごとに別の式・別の母集団で出ていた(popup 帯は2,500件サンプル=実数より小さい・
 *   レポート集計は全件)。parityVerdict が突き合わせるのはレーンの行数・世代・会場人数だけで、ユーザー別の【値】は誰も見張っていなかった。
 *   このため popup の件数が縮んでいても診断は✅のままだった。ここで上位3人の userKey・件数・順位を突き合わせる。
 *
 * 嘘の🔴を出さない(parityVerdict と同じ規律):
 *   - 取れていない・古い・別配信 → 必ず 'pending'(mismatch にしない)。
 *   - レポート集計は約15秒に1回の更新(reportPreviewPublish)=popup より遅れうる → 件数差は許容幅(絶対3件 or 5% の大きい方)まで
 *     'explained'。それを超える差・上位の顔ぶれの違いだけ 'mismatch'。
 *   - 同数の人どうしの順位の入れ替わりは差とみなさない(同数の並びは前回順位で決まる=rankedRoomsOrder.js)。
 *
 * 時点(capturedAt)の解釈は自前でせず timeAuthority.js の ageMsOf に委ねる(timeAuthorityRegistry の規律: 時点フィールドの独自実装を増やさない)。
 *
 * @module supportersParity
 */

import { ageMsOf } from './timeAuthority.js';

/** 鏡が古いとみなす時間[ms](観測の鮮度)。 */
export const SUPPORTERS_PARITY_FRESH_MS = 600_000;
/** 比べる上位の人数。 */
export const SUPPORTERS_PARITY_TOP = 3;

/**
 * @typedef {{ state: 'match'|'explained'|'mismatch'|'pending', code: string, reason: string, compared: number }} SupportersParity
 */

/** @param {unknown} v */
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/**
 * @param {{ liveId?: string, capturedAt?: number, rooms?: Array<{ userKey?: string, count?: number }> }|null|undefined} popupMirror popup が publish した応援者ランキング鏡
 * @param {{ liveId?: string, topSupporters?: Array<{ userKey?: string, userId?: string, count?: number }> }|null|undefined} reportPreview 診断のレポート集計
 * @param {string} curLid 現配信ID(小文字)
 * @param {number} nowMs
 * @returns {SupportersParity}
 */
export function judgeSupportersParity(popupMirror, reportPreview, curLid, nowMs) {
  const pend = (/** @type {string} */ code, /** @type {string} */ reason) => ({ state: /** @type {const} */ ('pending'), code, reason, compared: 0 });
  const m = popupMirror && typeof popupMirror === 'object' ? popupMirror : null;
  const r = reportPreview && typeof reportPreview === 'object' ? reportPreview : null;
  if (!m) return pend('supporters_no_mirror', 'popup の応援者ランキング鏡が未観測');
  if (!r) return pend('supporters_no_report', 'レポート集計が未観測');
  const rooms = Array.isArray(m.rooms) ? m.rooms : [];
  const reportRows = Array.isArray(r.topSupporters) ? r.topSupporters : [];
  if (!rooms.length) return pend('supporters_mirror_empty', 'popup の応援者ランキング鏡が空');
  if (!reportRows.length) return pend('supporters_report_empty', 'レポート集計の応援者が0人');
  const mLid = String(m.liveId || '').trim().toLowerCase();
  const rLid = String(r.liveId || '').trim().toLowerCase();
  if (!mLid || !rLid || (curLid && (mLid !== curLid || rLid !== curLid))) {
    return pend('supporters_other_live', '応援者ランキングの観測が別配信/配信IDなし');
  }
  const ageMs = ageMsOf(m.capturedAt, nowMs);
  if (ageMs != null && ageMs > SUPPORTERS_PARITY_FRESH_MS) {
    return pend('supporters_mirror_stale', 'popup の応援者ランキング鏡が古い');
  }

  const n = Math.min(SUPPORTERS_PARITY_TOP, rooms.length, reportRows.length);
  const pop = rooms.slice(0, n).map((x) => ({ key: String(x?.userKey || ''), count: num(x?.count) }));
  const rep = reportRows.slice(0, n).map((x) => ({ key: String(x?.userKey || x?.userId || ''), count: num(x?.count) }));
  const repByKey = new Map(rep.map((x) => [x.key, x]));

  // 上位の顔ぶれ: popup の上位 n 人は、レポートの上位 n 人にも居るはず(同数の入れ替わり・境界の同数は許す)。
  const missing = pop.filter((p) => !repByKey.has(p.key));
  if (missing.length) {
    // 境界の同数(レポートの n 位+1 以降に同じ件数の人が居る)かもしれないので、レポートの全行で探す。
    const allByKey = new Map(reportRows.map((x) => [String(x?.userKey || x?.userId || ''), num(x?.count)]));
    const trulyMissing = missing.filter((p) => !allByKey.has(p.key));
    if (trulyMissing.length) {
      return {
        state: 'mismatch',
        code: 'supporters_members_mismatch',
        reason: `popup の上位${n}人にレポートの集計に居ない人がいる(${trulyMissing.map((p) => `${p.key}=${p.count}件`).join('・')})`,
        compared: n
      };
    }
  }

  let worst = 0;
  let worstDesc = '';
  let exact = true;
  for (const p of pop) {
    const q = repByKey.get(p.key);
    if (!q) continue;
    const diff = Math.abs(p.count - q.count);
    if (diff !== 0) exact = false;
    const tol = Math.max(3, Math.ceil(Math.max(p.count, q.count) * 0.05));
    if (diff > tol && diff > worst) {
      worst = diff;
      worstDesc = `${p.key}: popup${p.count}件 ≠ レポート${q.count}件(差${diff})`;
    }
  }
  if (worst > 0) {
    return { state: 'mismatch', code: 'supporters_count_mismatch', reason: `上位${n}人の件数が食い違い: ${worstDesc}`, compared: n };
  }
  if (exact) {
    return { state: 'match', code: 'supporters_match', reason: `popup とレポートの上位${n}人の件数が一致`, compared: n };
  }
  return {
    state: 'explained',
    code: 'supporters_explained',
    reason: `上位${n}人の件数に小さな差(許容幅以内=レポートは約15秒に1回の更新)`,
    compared: n
  };
}

/**
 * 状態速報の1行。
 * @param {SupportersParity|null|undefined} v
 * @returns {string}
 */
export function formatSupportersParityLine(v) {
  if (!v || typeof v !== 'object' || !v.state) return '';
  const mark = v.state === 'mismatch' ? '🔴 不一致' : v.state === 'pending' ? '🟡 保留' : '✅ 一致';
  return `応援者ランキングの値の突き合わせ(popup鏡 vs レポート集計): ${mark} — ${v.reason}`;
}
