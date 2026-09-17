/**
 * コメント記録 × NDGR インターセプトキャッシュのマージ（純粋関数）。
 *
 * popup-entry.js から Track A（refactor Phase 4）で切り出した。元は同ファイルの
 * `mergeCommentsWithInterceptCache`（挙動不変・呼び出し元 1 箇所: 応援レーン描画前の
 * コメント補正）。DOM/fetch/chrome/module-level 状態に依存しないため lib へ移せる。
 *
 * 依存はすべて既存 lib（`userIdPreference` / `supportGrowthTileSrc`）から import する。
 */

import { pickStrongerUserId } from './userIdPreference.js';
import { commentEnrichmentAvatarScore, isHttpOrHttpsUrl } from './supportGrowthTileSrc.js';

/**
 * @typedef {object} PopupCommentEntry
 * @property {string} [commentNo]
 * @property {string} [userId]
 * @property {string} [nickname]
 * @property {string} [avatarUrl]
 */

/**
 * インターセプトキャッシュ（no→uid/name/av）を使って記録コメントの
 * userId / nickname / avatarUrl を補正する。既存挙動そのまま。
 *
 * @param {PopupCommentEntry[]} entries
 * @param {{ no: string, uid: string, name: string, av: string }[]} items
 * @param {{ preferInterceptUidSet?: Set<string> }} [opts]
 * @returns {{ next: PopupCommentEntry[], patched: number, uidReplaced: number }}
 */
export function mergeCommentsWithInterceptCache(entries, items, opts = {}) {
  if (!Array.isArray(entries) || entries.length === 0 || items.length === 0) {
    return {
      next: Array.isArray(entries) ? entries : [],
      patched: 0,
      uidReplaced: 0
    };
  }

  /** @type {Map<string, { no: string, uid: string, name: string, av: string }>} */
  const byNo = new Map();
  for (const it of items) {
    const prev = byNo.get(it.no);
    if (!prev) {
      byNo.set(it.no, it);
      continue;
    }
    byNo.set(it.no, {
      no: it.no,
      uid: it.uid || prev.uid,
      name: it.name || prev.name,
      av: it.av || prev.av
    });
  }

  /** @type {Map<string, { total: number, mismatch: number, hitUids: Set<string> }>} */
  const mismatchByCurrentUid = new Map();
  for (const e of entries) {
    const no = String(e?.commentNo || '').trim();
    if (!no) continue;
    const hit = byNo.get(no);
    if (!hit?.uid) continue;
    const curUid = String(e?.userId || '').trim();
    if (!curUid) continue;
    const st =
      mismatchByCurrentUid.get(curUid) || {
        total: 0,
        mismatch: 0,
        hitUids: new Set()
      };
    st.total += 1;
    if (curUid !== hit.uid) {
      st.mismatch += 1;
      st.hitUids.add(hit.uid);
    }
    mismatchByCurrentUid.set(curUid, st);
  }
  const preferInterceptUidSet =
    opts.preferInterceptUidSet instanceof Set ? opts.preferInterceptUidSet : new Set();
  /** @param {string} curUid */
  const shouldReplaceUid = (curUid) => {
    if (!curUid) return false;
    if (preferInterceptUidSet.has(curUid)) return true;
    const st = mismatchByCurrentUid.get(curUid);
    if (!st || st.total < 4) return false;
    if (st.hitUids.size < 3) return false;
    return st.mismatch >= Math.ceil(st.total * 0.6);
  };

  let patched = 0;
  let uidReplaced = 0;
  const next = entries.map((e) => {
    const no = String(e?.commentNo || '').trim();
    if (!no) return e;
    const hit = byNo.get(no);
    if (!hit) return e;

    const curUid = String(e?.userId || '').trim();
    const curName = String(e?.nickname || '').trim();
    const curAv = String(e?.avatarUrl || '').trim();
    let changed = false;
    /** @type {PopupCommentEntry} */
    let out = e;

    if (hit.uid) {
      const tie = shouldReplaceUid(curUid) ? 'incoming' : 'existing';
      const chosen = pickStrongerUserId(curUid, hit.uid, tie);
      if (chosen && chosen !== curUid) {
        if (curUid) uidReplaced += 1;
        out = { ...out, userId: chosen };
        changed = true;
      }
    }
    if (hit.name && !curName) {
      out = { ...out, nickname: hit.name };
      changed = true;
    }
    const uidForAv = String(out.userId || '').trim();
    const hitAv = String(hit.av || '').trim();
    if (hitAv && isHttpOrHttpsUrl(hitAv)) {
      const curSc = commentEnrichmentAvatarScore(uidForAv, curAv);
      const hitSc = commentEnrichmentAvatarScore(uidForAv, hitAv);
      if (hitSc > curSc) {
        out = { ...out, avatarUrl: hitAv };
        changed = true;
      }
    }

    if (changed) patched += 1;
    return out;
  });

  return { next, patched, uidReplaced };
}

/**
 * インターセプト結果の生配列を { no, uid, name, av } 形へ正規化する（純粋関数）。
 * popup-entry.js から Track A で切り出し（挙動不変・呼び出し元 1 箇所）。
 * no が空、または uid/name/av がすべて空の要素は捨てる。av は http(s) のみ採用。
 *
 * @param {unknown} raw
 * @returns {{ no: string, uid: string, name: string, av: string }[]}
 */
export function normalizeInterceptCacheItems(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const v of raw) {
    if (!v || typeof v !== 'object') continue;
    const item = /** @type {{ no?: unknown, uid?: unknown, name?: unknown, av?: unknown }} */ (
      v
    );
    const no = String(item.no || '').trim();
    const uid = String(item.uid || '').trim();
    if (!no) continue;
    const name = String(item.name || '').trim();
    const av = isHttpOrHttpsUrl(item.av) ? String(item.av || '').trim() : '';
    if (!uid && !name && !av) continue;
    out.push({ no, uid, name, av });
  }
  return out;
}

/**
 * 同一 commentNo の intercept 情報をマージする（純粋関数）。
 * popup-entry.js から Track A で切り出し（挙動不変・呼び出し元 1 箇所）。
 * 空でない値が勝つ後勝ち補完。av は http(s) のみ採用。
 *
 * @param {{ no: string, uid: string, name: string, av: string }[]} items
 * @returns {{ no: string, uid: string, name: string, av: string }[]}
 */
export function mergeInterceptCacheItems(items) {
  if (!Array.isArray(items) || items.length === 0) return [];
  /** @type {Map<string, { no: string, uid: string, name: string, av: string }>} */
  const byNo = new Map();
  for (const it of items) {
    const no = String(it?.no || '').trim();
    if (!no) continue;
    const prev = byNo.get(no);
    if (!prev) {
      byNo.set(no, {
        no,
        uid: String(it?.uid || '').trim(),
        name: String(it?.name || '').trim(),
        av: isHttpOrHttpsUrl(it?.av) ? String(it.av || '').trim() : ''
      });
      continue;
    }
    byNo.set(no, {
      no,
      uid: String(it?.uid || '').trim() || prev.uid,
      name: String(it?.name || '').trim() || prev.name,
      av: (isHttpOrHttpsUrl(it?.av) ? String(it.av || '').trim() : '') || prev.av
    });
  }
  return [...byNo.values()];
}
