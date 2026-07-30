/**
 * 会場の「鏡優先+同型フォールバック」供給(純関数)。①POP が実 paint した5段 buckets の鏡
 * (KEY_LANE_MIRROR = laneMirror.js の LaneMirrorSnapshot)を会場の正本に昇格させる。
 *
 * 設計正本: memory/reference_pop_venue_parity_SYNTHESIS.md §B/§C-1。
 *   - P層: 鏡の5段をそのままの順序で描く(集合も順序も①と同一)。
 *   - T層: ①が cap で切った残り(鏡に居ない集計候補)を各段の末尾へ継ぎ足す(会場=全員500の方針)。
 *   - X層: 鏡にまだ居ない直近発言者は fallback 側の即着席がそのまま尾に出る(60秒で鏡と同化)。
 *   - preCount/preHasGift/preGiftCount は集計候補から join(L7: 落とすとVIP光らせが死ぬ・v0.1.734の轍)。
 *
 * DOM/chrome 非依存=単体テスト可能。venueBar.js が snap/candidates/seats を渡す。
 */

import {
  VENUE_LANE_MIRROR_SOFT_WINDOW_MS,
  VENUE_LANE_MIRROR_HARD_WINDOW_MS
} from './venueLaneParity.js';

/** @typedef {import('./laneMirror.js').LaneMirrorSnapshot} LaneMirrorSnapshot */

const TIERS = /** @type {const} */ (['link', 'gift', 'ad', 'konta', 'tanu']);
const TIER_PROFILE = { link: 3, gift: 3, ad: 3, konta: 2, tanu: 1 };

/** @param {unknown} u @returns {boolean} */
function isHttpUrl(u) {
  return /^https?:\/\//i.test(String(u || '').trim());
}

/**
 * 鏡が会場の正本として使えるか(mode 判定)。
 * @param {Partial<LaneMirrorSnapshot>|null|undefined} snap
 * @param {string} liveId 現配信
 * @param {number} nowMs 壁時計(Date.now)。snap.capturedAt も壁時計(publishLaneMirror が Date.now で刻印)。
 * 年齢は二段窓で見る(venue-avatar-stale-mirror-DESIGN.md §C-根治2):
 *   - SOFT(180s)以内       : usable=true。
 *   - SOFT超〜HARD(15分)以内: reason='stale'。呼び出し側(venueBar.js の staleButUsable)が
 *                             鏡を使い続ける=C2のちらつき防止(v0.1.1136)を維持する。
 *   - HARD超               : reason='staleHard'。popup実質不在とみなし fallback へ降格させ、
 *                             その間に来た新規参加者を段に出す。
 * ヒステリシスは不要(鏡が更新されない限り年齢は単調増加なので境界の往復が構造的に起きない)。
 *
 * @returns {{ usable: boolean, reason: ''|'absent'|'liveIdMismatch'|'stale'|'staleHard'|'empty' }}
 */
export function isLaneMirrorUsableForVenue(snap, liveId, nowMs) {
  if (!snap || typeof snap !== 'object') return { usable: false, reason: 'absent' };
  const snapLive = String(snap.liveId || '').trim().toLowerCase();
  const cur = String(liveId || '').trim().toLowerCase();
  if (!snapLive || !cur || snapLive !== cur) return { usable: false, reason: 'liveIdMismatch' };
  const capturedAt = Number(snap.capturedAt) || 0;
  const now = Number(nowMs) || 0;
  if (capturedAt <= 0) return { usable: false, reason: 'staleHard' };
  const ageMs = now - capturedAt;
  if (ageMs > VENUE_LANE_MIRROR_HARD_WINDOW_MS) {
    return { usable: false, reason: 'staleHard' };
  }
  if (ageMs > VENUE_LANE_MIRROR_SOFT_WINDOW_MS) {
    return { usable: false, reason: 'stale' };
  }
  const total = TIERS.reduce(
    (a, t) => a + (Array.isArray(/** @type {any} */ (snap)[t]) ? /** @type {any} */ (snap)[t].length : 0),
    0
  );
  if (total <= 0) return { usable: false, reason: 'empty' };
  return { usable: true, reason: '' };
}

/**
 * 鏡セル→buildVenueSeating が食える行(P層)。uid のあるセルだけが席を持てる(uid無しの広告主
 * セル等は席に座らず、compose 側で lane に直接出る)。同一 uid の重複(link と gift の両在籍等)は
 * 先勝ちで1席に畳む。preCount 系は候補集計から join(L7)。
 *
 * @param {Partial<LaneMirrorSnapshot>|null|undefined} snap
 * @param {ReadonlyMap<string, { commentCount?: unknown, giftCount?: unknown, _laneSortAt?: unknown }>} candidatesByUid
 *   userLaneCandidatesFromStorage 由来の候補(userId→候補)。
 * @returns {Array<{userId: string, name: string, avatar: string, text: string, capturedAt: number, preCount: number, preHasGift: boolean, preGiftCount: number}>}
 */
export function venueRowsFromLaneMirror(snap, candidatesByUid) {
  const s = /** @type {any} */ (snap && typeof snap === 'object' ? snap : {});
  const byUid = candidatesByUid instanceof Map ? candidatesByUid : new Map();
  /** @type {Set<string>} */
  const seen = new Set();
  const out = [];
  const fallbackAt = Math.max(0, Number(s.capturedAt) || 0);
  for (const tier of TIERS) {
    const arr = Array.isArray(s[tier]) ? s[tier] : [];
    for (const cell of arr) {
      const uid = String(cell?.userId || '').trim();
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      const cand = /** @type {any} */ (byUid.get(uid) || null);
      const giftCount = Math.max(0, Math.floor(Number(cand?.giftCount) || 0));
      out.push({
        userId: uid,
        name: String(cell?.title || '').trim(),
        // displaySrc は http 実サムネのときだけ avatar として引き継ぐ(identicon データURL等は
        //   会場側の生成に任せる=enrich 関所とも整合)。
        avatar: isHttpUrl(cell?.displaySrc) ? String(cell.displaySrc).trim() : '',
        text: '',
        capturedAt: Math.max(0, Number(cand?._laneSortAt) || 0) || fallbackAt,
        preCount: Math.max(1, Math.floor(Number(cand?.commentCount) || 0) || 1),
        preHasGift: giftCount > 0,
        preGiftCount: giftCount
      });
    }
  }
  return out;
}

/**
 * 段割当の合成 v3(2026-07-14 会場独自受け皿の撤去): P層=鏡の順序そのままの5段【のみ】を buckets に返す。
 *   T/X層(鏡外=①のcap外+直近発言者)は会場独自の受け皿を持たず、単に描かない
 *   (①に載った瞬間、次の鏡publishで会場にも現れる)。これで「5つの段=鏡=①の実paint」が
 *   集合・順序・件数まで厳密同一になる。
 *
 * @param {{
 *   mirrorBuckets: { link: any[], gift: any[], ad: any[], konta: any[], tanu: any[] },
 *   seatIndexByUid: ReadonlyMap<string, number>
 * }} input
 *   - mirrorBuckets: restoreLaneMirrorBuckets(snap) の出力({displaySrc,title,meta,entry})。
 * @returns {{ buckets: { link: any[], gift: any[], ad: any[], konta: any[], tanu: any[] } }}
 */
export function composeVenueLaneBuckets(input) {
  const inp = /** @type {any} */ (input && typeof input === 'object' ? input : {});
  const mirror = inp.mirrorBuckets && typeof inp.mirrorBuckets === 'object' ? inp.mirrorBuckets : {};
  const seatIndexByUid = inp.seatIndexByUid instanceof Map ? inp.seatIndexByUid : new Map();

  /** @type {Record<string, any[]>} */
  const out = {};
  for (const tier of TIERS) {
    const rows = [];
    const arr = Array.isArray(mirror[tier]) ? mirror[tier] : [];
    for (let i = 0; i < arr.length; i += 1) {
      const cell = arr[i] || {};
      const uid = String(cell?.entry?.userId || '').trim();
      const seatIdxRaw = uid && seatIndexByUid.has(uid) ? Number(seatIndexByUid.get(uid)) : -1;
      rows.push({
        entryIndex: i,
        profileTier: TIER_PROFILE[tier] || 1,
        thumbScore: isHttpUrl(cell?.displaySrc) ? 2 : 0,
        displaySrc: String(cell?.displaySrc || ''),
        title: String(cell?.title || ''),
        entry: { userId: uid },
        meta: {
          idLine: String(cell?.meta?.idLine || ''),
          nameLine: String(cell?.meta?.nameLine || '')
        },
        // 席が無い(uid無し/席未割当)アイテムは -1 = wrapTileEl が素通し(席ラップしない)。
        _venueSeatIndex: Number.isInteger(seatIdxRaw) && seatIdxRaw >= 0 ? seatIdxRaw : -1,
        _venueIsVip: isHttpUrl(cell?.displaySrc),
        _venueMirror: true
      });
    }
    out[tier] = rows;
  }
  return /** @type {any} */ ({ buckets: out });
}

/**
 * visibleSeats(席エントリ)から uid→seatIndex の索引を作る。
 * @param {ReadonlyArray<{ seatIndex?: unknown, participant?: { userId?: unknown } }>} visibleSeats
 * @returns {Map<string, number>}
 */
export function venueSeatIndexByUid(visibleSeats) {
  /** @type {Map<string, number>} */
  const map = new Map();
  const list = Array.isArray(visibleSeats) ? visibleSeats : [];
  for (const entry of list) {
    const uid = String(entry?.participant?.userId || '').trim();
    if (!uid || map.has(uid)) continue;
    const idx = Math.floor(Number(entry?.seatIndex));
    if (Number.isInteger(idx) && idx >= 0) map.set(uid, idx);
  }
  return map;
}
