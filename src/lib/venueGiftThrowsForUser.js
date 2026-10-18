/**
 * 会場の発言パネルに出す「この人のギフトの1回ごとの明細」を、別人のものを貼らないよう安全に作る(純関数)。v0.1.1659。
 *
 * ■ 経緯(2026-10-18 ユーザー「ちゃんとわかるようにしたい。事故を防ぐ仕組みを調査して」)
 *   公式 koken の /histories は【1回ごとの記録に数値の supporterId】を持つ(記名のみ・匿名は無い)。
 *   拡張は既に取得して `nls_gift_subapp_history_<lv>` に保存している(各行 userId・kokenHistoryId)。
 *   事故は「名前で結びつける」ことで起きる(同名・「名無し」・改名で別人の明細が混ざる)。そこで:
 *     1. 結びつけは row.userId === 押した人の数値uid の完全一致だけ(名前では絶対に引かない)
 *     2. uid の無い行(匿名・DOM 由来)は誰にも付けない。含まない旨を注記する
 *     3. 保存の liveId が今の配信と一致するときだけ使う(空でも不使用=fail-closed)
 *     4. 明細の合計がタイルの🎁ptを超えたら出さない(嘘の明細を出さない)・下回れば「全部ではありません」
 *     5. kokenHistoryId で重複を畳む・新しい順・古い保存は何分前かを注記
 *     6. 外部入力は検疫(アイテム名は escape・サムネは http(s) のみ・壊れた行は1件だけ捨てる)
 *   ★広告に1回ごとの記録は無い(公式は人ごとの合計のみ)ので、ここでは扱わない。
 */

import { ageMsOf } from './timeAuthority.js';
import { formatVenueHoverRelativeTime } from './venueHoverCard.js';

const NUMERIC_UID_RE = /^[1-9]\d{0,17}$/;
const STALE_MS = 5 * 60_000;
/** パネルに出す明細の最大件数(新しい順)。 */
export const GIFT_THROWS_PANEL_MAX = 30;

/** @param {unknown} v @returns {string} */
const norm = (v) => String(v == null ? '' : v).trim().toLowerCase();

/** @param {unknown} v @returns {string} */
function httpUrlOrEmpty(v) {
  const s = String(v == null ? '' : v).trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

/** @param {number} n */
const ja = (n) => Math.floor(n).toLocaleString('en-US');

/**
 * @typedef {{ itemName: string, points: number, time: string, at: number, thumbnailUrl: string }} GiftThrowRow
 * @typedef {{ ok: boolean, reason?: string, rows: GiftThrowRow[], sumPoints: number, count: number, notes: string[] }} GiftThrowsResult
 */

/**
 * @param {{ payload: unknown, uid: unknown, liveId: unknown, tileGiftPt: number|null|undefined, nowMs: number }} p
 * @returns {GiftThrowsResult}
 */
export function giftThrowsForUser(p) {
  /** @param {string} reason @returns {GiftThrowsResult} */
  const no = (reason) => ({ ok: false, reason, rows: [], sumPoints: 0, count: 0, notes: [] });
  const uid = String(p?.uid == null ? '' : p.uid).trim();
  if (!NUMERIC_UID_RE.test(uid)) return no('no-uid');
  const payload = /** @type {Record<string, any>|null} */ (p?.payload && typeof p.payload === 'object' ? p.payload : null);
  if (!payload || !Array.isArray(payload.history)) return no('no-history');
  const want = norm(p.liveId);
  if (!want || norm(payload.liveId) !== want) return no('live-mismatch');

  /** @type {Map<string, { r: GiftThrowRow, sortKey: number }>} */
  const byId = new Map();
  let anonCount = 0;
  for (const raw of payload.history) {
    if (!raw || typeof raw !== 'object') continue;
    const h = /** @type {Record<string, any>} */ (raw);
    const rowUid = String(h.userId == null ? '' : h.userId).trim();
    if (!rowUid) {
      anonCount += 1;
      continue;
    }
    if (rowUid !== uid) continue; // ★完全一致だけ
    const points = Math.floor(Number(h.points));
    if (!Number.isFinite(points) || points <= 0) continue;
    const key = String(h.kokenHistoryId || '').trim() || `${h.itemName}|${h.time}|${points}|${h.sortKey}`;
    if (byId.has(key)) continue;
    byId.set(key, {
      sortKey: Number(h.sortKey) || 0,
      r: {
        itemName: String(h.itemName == null ? '' : h.itemName).trim() || '(名称未取得)',
        points,
        time: String(h.time == null ? '' : h.time).trim(),
        // 公式の公開時刻(epoch 秒→ms)。無ければ 0=時計の時刻は出さず、配信内の経過だけを出す。
        at: Number(h.publishedAt) > 0 ? Math.floor(Number(h.publishedAt)) * 1000 : 0,
        thumbnailUrl: httpUrlOrEmpty(h.thumbnailUrl)
      }
    });
  }
  const all = [...byId.values()].sort((a, b) => b.sortKey - a.sortKey).map((x) => x.r);
  if (all.length === 0) return no('empty');
  const sumPoints = all.reduce((s, r) => s + r.points, 0);
  const tile = Number(p.tileGiftPt);
  if (Number.isFinite(tile) && tile > 0 && sumPoints > tile) return { ...no('over-total'), sumPoints, count: all.length };

  /** @type {string[]} */
  const notes = [];
  if (Number.isFinite(tile) && tile > 0 && sumPoints < tile) {
    notes.push(`全部ではありません(明細の合計 ${ja(sumPoints)}pt / 累計 ${ja(tile)}pt)`);
  }
  if (anonCount > 0) notes.push('ID のない匿名のギフトは、誰のものか分からないため含みません');
  // 保存時点の齢は timeAuthority に委ねる(取れなければ null=古いとも新しいとも言わない)。
  const ageMs = ageMsOf(payload.capturedAt, p.nowMs);
  if (ageMs != null && ageMs > STALE_MS) notes.push(`${Math.floor(ageMs / 60_000)}分前の記録です`);
  return { ok: true, rows: all.slice(0, GIFT_THROWS_PANEL_MAX), sumPoints, count: all.length, notes };
}

/** @param {number} n */
const pad2 = (n) => String(n).padStart(2, '0');

/**
 * 「いつ投げたか」の表示文字列。時計の時刻(例 10:03)・何分前・配信内の経過(例 配信1:16:43)を、分かるものだけ並べる。
 * 時刻が不明なら配信内の経過だけを「配信○」と明示して出す(単なる数字だけにしない)。
 * @param {{ time: string, at: number }} row @param {number} nowMs @returns {string}
 */
export function giftThrowWhenLabel(row, nowMs) {
  const parts = [];
  if (row.at > 0) {
    const d = new Date(row.at);
    const clock = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    const rel = formatVenueHoverRelativeTime(row.at, nowMs);
    parts.push(rel ? `${clock}(${rel})` : clock);
  }
  const el = String(row.time || '').trim();
  if (el && el !== '—') parts.push(`配信${el}`);
  return parts.join(' ・ ');
}

/**
 * パネルの「ギフトの記録」区画の HTML。出せない理由が over-total のときだけ文言を出し、それ以外(取れていない等)は空。
 * @param {GiftThrowsResult} r
 * @param {(s: unknown) => string} escapeHtml
 * @returns {string}
 */
export function giftThrowsSectionHtml(r, escapeHtml, nowMs = Date.now()) {
  if (!r) return '';
  if (!r.ok) {
    return r.reason === 'over-total'
      ? `<div class="nlsb-speech-gifts"><div class="nlsb-speech-gifts__note">ギフトの明細は、累計と照合できません</div></div>`
      : '';
  }
  const rows = r.rows
    .map((x) => {
      const thumb = x.thumbnailUrl ? `<img class="nlsb-speech-gifts__img" src="${escapeHtml(x.thumbnailUrl)}" alt="" loading="lazy">` : '';
      return (
        `<div class="nlsb-speech-gifts__row">${thumb}` +
        `<span class="nlsb-speech-gifts__item">${escapeHtml(x.itemName)}</span>` +
        `<span class="nlsb-speech-gifts__pt">${escapeHtml(ja(x.points))}pt</span>` +
        `<span class="nlsb-speech-gifts__time">${escapeHtml(giftThrowWhenLabel(x, nowMs))}</span></div>`
      );
    })
    .join('');
  const head = `🎁 ギフトの記録(${r.count}回・合計 ${ja(r.sumPoints)}pt)`;
  const notes = r.notes.map((n) => `<div class="nlsb-speech-gifts__note">${escapeHtml(n)}</div>`).join('');
  return `<div class="nlsb-speech-gifts"><div class="nlsb-speech-gifts__head">${escapeHtml(head)}</div>${rows}${notes}</div>`;
}
