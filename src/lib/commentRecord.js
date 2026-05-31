/**
 * コメント1件の形・重複排除・マージ（純関数）
 */

import {
  isHttpOrHttpsUrl,
  isNiconicoSyntheticDefaultUserIconUrl,
  isWeakNiconicoUserIconHttpUrl,
  looksLikeNiconicoUserIconHttpUrl
} from './supportGrowthTileSrc.js';
import { pickStrongerUserId } from './userIdPreference.js';
import { anonymousNicknameFallback } from './nicoAnonymousDisplay.js';
import { clampAvatarUrl } from '../shared/avatar/clampAvatarUrl.js';

/** コメント本文の上限（storage肥大化を抑制） */
export const COMMENT_TEXT_MAX_CHARS = 1000;

/**
 * 保存済み・取り込み済みの usericon URL から数字 userId を復元（DOM 側で ID 欠けのみの救済）
 * @param {string} url
 * @returns {string}
 */
function userIdFromNicoUserIconHttpUrl(url) {
  const s = String(url || '');
  if (!isHttpOrHttpsUrl(s)) return '';
  let m = s.match(/\/usericon\/(?:s\/)?(\d+)\/(\d+)\./i);
  if (m?.[2]) return m[2];
  m = s.match(/nicoaccount\/usericon\/(\d+)/i);
  if (m?.[1] && m[1].length >= 5) return m[1];
  return '';
}

/**
 * @typedef {{
 *   id?: string,
 *   liveId?: string,
 *   commentNo?: string,
 *   text?: string,
 *   userId?: string|null,
 *   nickname?: string,
 *   avatarUrl?: string,
 *   avatarObserved?: boolean,
 *   selfPosted?: boolean,
 *   capturedAt?: number,
 *   vpos?: number|null,
 *   accountStatus?: number|null,
 *   is184?: boolean
 * }} StoredComment
 */

/**
 * @param {unknown} value
 */
export function normalizeCommentText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim()
    .slice(0, COMMENT_TEXT_MAX_CHARS);
}

/**
 * @param {string} liveId
 * @param {{ commentNo?: string, text?: string, capturedAt?: number, userId?: string|null }} rec
 *
 * 0.1.46 (AB): commentNo 欠落時の dedupe key に userId を含める。
 *   旧コードは `${liveId}||${text}|${sec}` で、複数ユーザーが同じ 1 秒内に
 *   同じ短文（"8888" / "草" 等）を打つと最初の 1 件だけ採用され残りは patch
 *   扱いになり、コメ被り検出（L1 / L5）が「N 人の被り」を N=1 と記録してしまい
 *   `detectCommentSyncBursts` の minDistinctUsers=3 を満たさなくなる問題があった。
 *   userId を key に含めることで同秒・同テキスト・別ユーザーが別行として扱われる。
 */
export function buildDedupeKey(liveId, rec) {
  const text = normalizeCommentText(rec.text);
  const no = String(rec.commentNo ?? '').trim();
  if (no) {
    return `${liveId}|${no}|${text}`;
  }
  const sec = Math.floor(Number(rec.capturedAt || 0) / 1000);
  const uid = String(rec.userId ?? '').trim();
  return `${liveId}||${text}|${sec}|${uid}`;
}

function randomId() {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {{ liveId: string, commentNo?: string, text: string, userId?: string|null, nickname?: string, avatarUrl?: string|null, avatarObserved?: boolean, vpos?: number|null, accountStatus?: number|null, is184?: boolean }} p
 */
export function createCommentEntry(p) {
  const capturedAt = Date.now();
  const text = normalizeCommentText(p.text);
  const commentNo = String(p.commentNo ?? '').trim();
  const liveId = String(p.liveId || '').trim().toLowerCase();
  // avatar URL の長さ上限を共通 helper（src/shared/avatar/clampAvatarUrl.js）に
  // 一元化（H2 / D-5）。createCommentEntry / patchExistingComment / merge /
  // userCommentProfileCache すべてが同じ閾値（既定 2000 字）を参照する。
  const av = clampAvatarUrl(p.avatarUrl);
  const avatarUrl = isHttpOrHttpsUrl(av) ? av : '';
  let uid = p.userId ? String(p.userId).trim() : '';
  if (!uid && avatarUrl) {
    const fromAv = userIdFromNicoUserIconHttpUrl(avatarUrl);
    if (fromAv) uid = fromAv;
  }
  const nickname = anonymousNicknameFallback(uid, p.nickname);
  const storedAvatar = avatarUrl;
  const entry = {
    id: randomId(),
    liveId,
    commentNo,
    text,
    userId: uid || null,
    ...(nickname ? { nickname } : {}),
    ...(storedAvatar ? { avatarUrl: storedAvatar } : {}),
    ...(p.avatarObserved ? { avatarObserved: true } : {}),
    ...(p.vpos != null ? { vpos: p.vpos } : {}),
    ...(p.accountStatus != null ? { accountStatus: p.accountStatus } : {}),
    ...(p.is184 ? { is184: true } : {}),
    capturedAt
  };
  return entry;
}

/**
 * @param {string} lid
 * @param {StoredComment} ex
 */
function storedCommentDedupeKey(lid, ex) {
  return buildDedupeKey(lid, {
    commentNo: ex.commentNo,
    text: ex.text,
    capturedAt: ex.capturedAt,
    // 0.1.360: userId を渡す。buildDedupeKey は commentNo 欠落時のみ uid を key に
    //   含める（0.1.46 AB）が、この seed 側で uid を渡し忘れていたため、既存行の
    //   key が常に空 uid で組まれ、incoming 側に uid を足しても seed と一致せず
    //   コメ被り検出が機能しないままだった。incoming 側（mergeNewComments）と
    //   必ず同時に揃える。
    userId: ex.userId
  });
}

/**
 * commentNo 欠落行の dedupe-capturedAt 推定用 index のキー（`text \u0001 uid`）。
 * @param {string} text 正規化済みテキスト
 * @param {string} uid trim 済み userId
 */
function loneDedupeIndexKey(text, uid) {
  return `${text}\u0001${uid}`;
}

/**
 * @param {unknown} v
 * @returns {number|null} 正の有限数なら数値、それ以外は null
 */
function validCapturedAt(v) {
  const n = Number(v);
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * commentNo 欠落の「同一 `{text,uid}` がストレージに 1 件だけか」を O(1) で参照するための
 * index を作る／更新するヘルパ群。旧 `deriveIncomingDedupeCapturedAt` が incoming ごとに
 * `next` 全件を走査（O(N×I)）していたのを置き換え、mergeNewComments の add/patch で
 * インクリメンタルに保つことで O(N+I) にする。
 *
 * 値は `{ count, cap }`。`cap` は count===1 のときの行の capturedAt（無効なら null）で、
 * count>1 では意味を持たない（null）。これは旧実装の「ちょうど1件一致かつ有効 cap なら
 * それを使い、そうでなければ fallback」という挙動と一致する。
 * @returns {{
 *   add: (text: string, uid: string, capRaw: unknown) => void,
 *   remove: (text: string, uid: string) => void,
 *   lookup: (row: { capturedAt?: number, commentNo?: string, text: string, userId?: string|null }, fallbackMs: number) => number
 * }}
 */
function createLoneDedupeIndex() {
  /** @type {Map<string, { count: number, cap: number|null }>} */
  const map = new Map();
  /**
   * @param {string} text
   * @param {string} uid
   * @param {unknown} capRaw
   */
  const add = (text, uid, capRaw) => {
    const k = loneDedupeIndexKey(text, uid);
    const rec = map.get(k);
    if (!rec) {
      map.set(k, { count: 1, cap: validCapturedAt(capRaw) });
    } else {
      rec.count += 1;
      rec.cap = null;
    }
  };
  /**
   * @param {string} text
   * @param {string} uid
   */
  const remove = (text, uid) => {
    const k = loneDedupeIndexKey(text, uid);
    const rec = map.get(k);
    if (!rec) return;
    rec.count -= 1;
    if (rec.count <= 0) {
      map.delete(k);
    } else {
      // count が 1 に戻っても残った行の cap は不明なので null（=fallback）。
      //   patch で uid が付け替わった極めて稀な経路でのみ到達し、安全側に倒れる。
      rec.cap = null;
    }
  };
  /**
   * incoming が dedupe キー計算で使う capturedAt を決める（旧 deriveIncomingDedupeCapturedAt と同義）。
   * - `row.capturedAt` が有効ならそれを最優先。
   * - commentNo があれば fallback（番号が一意キー）。
   * - commentNo 欠落時、同一 `{text,uid}` がちょうど 1 件・有効 cap ならその cap、なければ fallback。
   * @param {{ capturedAt?: number, commentNo?: string, text: string, userId?: string|null }} row
   * @param {number} fallbackMs
   */
  const lookup = (row, fallbackMs) => {
    const cap = validCapturedAt(row.capturedAt);
    if (cap != null) return cap;
    const commentNo = String(row.commentNo ?? '').trim();
    if (commentNo) return fallbackMs;
    const text = normalizeCommentText(row.text);
    const uid = String(row.userId ?? '').trim();
    const rec = map.get(loneDedupeIndexKey(text, uid));
    return rec && rec.count === 1 && rec.cap != null ? rec.cap : fallbackMs;
  };
  return { add, remove, lookup };
}

/**
 * 既存コメントに incoming の情報をパッチ適用（純関数）。
 * avatarUrl / userId / nickname / avatarObserved を「強い方優先」で更新する。
 *
 * @param {StoredComment} existing
 * @param {{ userId?: string|null, nickname?: string, avatarUrl?: string|null, avatarObserved?: boolean }} incoming
 * @returns {{ entry: StoredComment, touched: boolean }}
 */
export function patchExistingComment(existing, incoming) {
  // incoming の avatarUrl も clampAvatarUrl で揃える（H2 / D-5）。
  // 既存行の avatarUrl が 2000 字超の場合、後続の equality 比較で「短いものに
  // 上書き済み」と認識されるよう、必要なら同じ slice を当てる。
  const rawAv = clampAvatarUrl(incoming.avatarUrl);
  const validAvatar = isHttpOrHttpsUrl(rawAv) ? rawAv : '';
  let incUid = incoming.userId ? String(incoming.userId).trim() : '';
  if (!incUid && validAvatar) {
    const fromAv = userIdFromNicoUserIconHttpUrl(validAvatar);
    if (fromAv) incUid = fromAv;
  }

  let entry = /** @type {StoredComment} */ (existing);
  let touched = false;

  if (validAvatar) {
    // 既存 avatarUrl が 0.1.9 以前で書かれた巨大 URL（2KB 超）の場合があるので、
    // 比較・upgrade 経路に入る前に clampAvatarUrl で揃える（D-5）。
    const exAv = clampAvatarUrl(entry.avatarUrl);
    const hasAv = Boolean(exAv && isHttpOrHttpsUrl(exAv));
    let uidForSynthetic = String(entry.userId || incUid || '').trim();
    if (!uidForSynthetic && exAv) {
      uidForSynthetic = userIdFromNicoUserIconHttpUrl(exAv);
    }
    const canUpgradeSynthetic =
      hasAv &&
      looksLikeNiconicoUserIconHttpUrl(validAvatar) &&
      validAvatar !== exAv &&
      isNiconicoSyntheticDefaultUserIconUrl(exAv, uidForSynthetic);
    const canUpgradeWeakPlaceholder =
      hasAv &&
      isWeakNiconicoUserIconHttpUrl(exAv) &&
      looksLikeNiconicoUserIconHttpUrl(validAvatar) &&
      !isWeakNiconicoUserIconHttpUrl(validAvatar) &&
      validAvatar !== exAv;

    if (!hasAv) {
      entry = { ...entry, avatarUrl: validAvatar };
      touched = true;
    } else if (canUpgradeSynthetic) {
      entry = { ...entry, avatarUrl: validAvatar };
      touched = true;
    } else if (canUpgradeWeakPlaceholder) {
      entry = { ...entry, avatarUrl: validAvatar };
      touched = true;
    }
  }

  const exUid = String(entry.userId || '').trim();
  const chosenUid = pickStrongerUserId(exUid, incUid);
  if (incUid && chosenUid !== exUid) {
    entry = { ...entry, userId: chosenUid ? chosenUid : null };
    touched = true;
  }

  const incNickRaw = String(incoming.nickname || '').trim();
  const incNick =
    incNickRaw ||
    anonymousNicknameFallback(String(entry.userId || incUid || ''), '');
  const exNick = String(entry.nickname || '').trim();
  if (incNick && (!exNick || incNick.length > exNick.length)) {
    entry = { ...entry, nickname: incNick };
    touched = true;
  }

  if (!String(entry.userId || '').trim()) {
    const avHeal = String(entry.avatarUrl || '').trim();
    if (isHttpOrHttpsUrl(avHeal)) {
      const h = userIdFromNicoUserIconHttpUrl(avHeal);
      if (h) {
        entry = { ...entry, userId: h };
        touched = true;
      }
    }
  }

  if (incoming.avatarObserved && !entry.avatarObserved) {
    entry = { ...entry, avatarObserved: true };
    touched = true;
  }

  return { entry, touched };
}

/**
 * @param {string} liveId
 * @param {StoredComment[]} existing
 * @param {{ commentNo?: string, text: string, userId?: string|null, nickname?: string, avatarUrl?: string|null, avatarObserved?: boolean, vpos?: number|null, accountStatus?: number|null, is184?: boolean, capturedAt?: number }[]} incoming
 * @returns {{ next: StoredComment[], added: StoredComment[], storageTouched: boolean }}
 */
export function mergeNewComments(liveId, existing, incoming) {
  const lid = String(liveId || '').trim().toLowerCase();
  /** @type {Map<string, number>} */
  const keyToIndex = new Map();
  // commentNo 欠落行の dedupe-capturedAt 推定を O(1) 参照にする index（keyToIndex と同じ
  //   1 パスで構築。以降 add/patch でインクリメンタルに保つ）。
  const loneDedupe = createLoneDedupeIndex();
  for (let i = 0; i < existing.length; i += 1) {
    const e = existing[i];
    const ex = /** @type {StoredComment} */ (e);
    const key = storedCommentDedupeKey(lid, ex);
    if (!keyToIndex.has(key)) keyToIndex.set(key, i);
    if (!String(ex.commentNo ?? '').trim()) {
      loneDedupe.add(
        normalizeCommentText(ex.text),
        String(ex.userId ?? '').trim(),
        ex.capturedAt
      );
    }
  }
  const added = [];
  const next = /** @type {StoredComment[]} */ ([...existing]);
  let storageTouched = false;
  for (const row of incoming) {
    const text = normalizeCommentText(row.text);
    if (!text) continue;
    const commentNo = String(row.commentNo ?? '').trim();
    const capForDedupe = loneDedupe.lookup(row, Date.now());
    const key = buildDedupeKey(lid, {
      commentNo,
      text,
      capturedAt: capForDedupe,
      // 0.1.360: userId を渡す。これが無いと commentNo 欠落の同秒・同本文・別ユーザー
      //   が空 uid の同一 key に潰れ、1 件にマージ（しかも別ユーザーの nickname を
      //   後付けする属性取り違え）が起きていた。buildDedupeKey は commentNo がある
      //   行では uid を無視する（番号が一意）ので NDGR/DOM 経路は不変。seed 側
      //   storedCommentDedupeKey と必ず同時に揃える。
      userId: row.userId
    });

    const idx = keyToIndex.get(key);
    if (idx != null && idx >= 0 && idx < next.length) {
      const before = /** @type {StoredComment} */ (next[idx]);
      const result = patchExistingComment(before, row);
      if (result.touched) {
        next[idx] = result.entry;
        storageTouched = true;
        // commentNo 欠落行の uid（avatar 由来で後付けされる場合がある）が変わったら
        //   loneDedupe index を付け替える。text/commentNo は patch で不変だが念のため確認。
        const wasLone = !String(before.commentNo ?? '').trim();
        const isLone = !String(result.entry.commentNo ?? '').trim();
        if (wasLone || isLone) {
          const oText = normalizeCommentText(before.text);
          const oUid = String(before.userId ?? '').trim();
          const nText = normalizeCommentText(result.entry.text);
          const nUid = String(result.entry.userId ?? '').trim();
          if (oText !== nText || oUid !== nUid || wasLone !== isLone) {
            if (wasLone) loneDedupe.remove(oText, oUid);
            if (isLone) {
              loneDedupe.add(nText, nUid, result.entry.capturedAt);
            }
          }
        }
      }
      continue;
    }
    keyToIndex.set(key, next.length);
    const rawAv = String(row.avatarUrl || '').trim();
    const validAvatar = isHttpOrHttpsUrl(rawAv) ? rawAv : '';
    const entry = createCommentEntry({
      liveId: lid,
      commentNo,
      text,
      userId: row.userId ?? null,
      nickname: row.nickname || '',
      avatarUrl: validAvatar || undefined,
      avatarObserved: row.avatarObserved || false,
      vpos: row.vpos,
      accountStatus: row.accountStatus,
      is184: row.is184
    });
    added.push(entry);
    next.push(entry);
    // 同一バッチ内の後続 incoming が「直近で追加された同一 {text,uid}」を参照できるよう、
    //   commentNo 欠落の新規行は index にも反映（旧実装が next 全件を走査していたのと同義）。
    if (!commentNo) {
      loneDedupe.add(
        normalizeCommentText(entry.text),
        String(entry.userId ?? '').trim(),
        entry.capturedAt
      );
    }
  }
  if (added.length) storageTouched = true;
  return { next, added, storageTouched };
}

/**
 * v0.1.513: チャンクモード保存の「毎フラッシュ全件 read+merge（O(N)）」を O(追加分) に置き換える
 *   ためのインクリメンタル dedupe 状態を、既存行から **1 回だけ** 構築する純関数。
 *
 *   `mergeNewComments` の seed ループ（keyToIndex / loneDedupe 構築）と **同一のキー関数**を使う。
 *   ただしチャンクモードでは過去行への patch を永続化しない設計（content-entry の追記専用チャンク）
 *   なので、行インデックス（patch 用）は持たず、重複判定に必要な **キー集合 Set** と
 *   commentNo 欠落行の capturedAt 推定 index（loneDedupe）だけを保持する。
 *
 * @param {string} liveId
 * @param {StoredComment[]} existing 既存の保存済みコメント（全チャンク連結 or main 配列）
 * @returns {{ keySet: Set<string>, loneDedupe: ReturnType<typeof createLoneDedupeIndex> }}
 */
export function buildCommentDedupeState(liveId, existing) {
  const lid = String(liveId || '').trim().toLowerCase();
  /** @type {Set<string>} */
  const keySet = new Set();
  const loneDedupe = createLoneDedupeIndex();
  const rows = Array.isArray(existing) ? existing : [];
  for (let i = 0; i < rows.length; i += 1) {
    const ex = /** @type {StoredComment} */ (rows[i]);
    if (!ex) continue;
    keySet.add(storedCommentDedupeKey(lid, ex));
    if (!String(ex.commentNo ?? '').trim()) {
      loneDedupe.add(
        normalizeCommentText(ex.text),
        String(ex.userId ?? '').trim(),
        ex.capturedAt
      );
    }
  }
  return { keySet, loneDedupe };
}

/**
 * v0.1.513: `mergeNewComments` の「新規追加」分岐だけをインクリメンタルに行う純関数。
 *   `state`（buildCommentDedupeState の戻り値）を **その場で更新**しながら、incoming のうち
 *   本当に新規だった行だけを `added` として返す。全件配列 `next` は作らない（O(追加分)）。
 *
 *   ⚠️ `mergeNewComments` との差分は「既存一致行への patch を行わない」点のみ。チャンクモードでは
 *   その patch は元々永続化されない（追記専用・表示時 enrich で代替）ため、保存結果は同一。
 *   dedupe の採否（どの incoming を added にするか）は `mergeNewComments` と完全一致する
 *   （同じ buildDedupeKey / loneDedupe.lookup を同じ順序で使う）。
 *
 * 戻り値の `undo()` は、この呼び出しが state に加えた変更（keySet への追加・loneDedupe の add）を
 *   巻き戻す。チャンク write が timeout 等で失敗して同じ rows を再投入（requeue）する場合に呼ぶと、
 *   state が「もう追加済み」と誤認して再投入分を dedupe で握り潰す＝記録欠落を防げる。
 *
 * @param {string} liveId
 * @param {{ keySet: Set<string>, loneDedupe: ReturnType<typeof createLoneDedupeIndex> }} state
 * @param {Array<{ commentNo?: string, text?: string, userId?: string|null, nickname?: string, avatarUrl?: string|null, avatarObserved?: boolean, vpos?: number|null, accountStatus?: number|null, is184?: boolean, capturedAt?: number }>} incoming
 * @returns {{ added: StoredComment[], undo: () => void }}
 */
export function mergeNewCommentsIncremental(liveId, state, incoming) {
  const lid = String(liveId || '').trim().toLowerCase();
  const keySet = state && state.keySet instanceof Set ? state.keySet : new Set();
  const loneDedupe =
    state && state.loneDedupe ? state.loneDedupe : createLoneDedupeIndex();
  /** @type {StoredComment[]} */
  const added = [];
  // undo 用に「この呼び出しで keySet に足したキー」「loneDedupe に add した {text,uid}」を記録。
  /** @type {string[]} */
  const addedKeys = [];
  /** @type {Array<{ text: string, uid: string }>} */
  const addedLone = [];
  const rows = Array.isArray(incoming) ? incoming : [];
  for (const row of rows) {
    const text = normalizeCommentText(row.text);
    if (!text) continue;
    const commentNo = String(row.commentNo ?? '').trim();
    const capForDedupe = loneDedupe.lookup(
      { capturedAt: row.capturedAt, commentNo, text, userId: row.userId },
      Date.now()
    );
    const key = buildDedupeKey(lid, {
      commentNo,
      text,
      capturedAt: capForDedupe,
      userId: row.userId
    });
    if (keySet.has(key)) continue; // 既出（patch はチャンクモードでは永続化しないので skip）
    keySet.add(key);
    addedKeys.push(key);
    const rawAv = String(row.avatarUrl || '').trim();
    const validAvatar = isHttpOrHttpsUrl(rawAv) ? rawAv : '';
    const entry = createCommentEntry({
      liveId: lid,
      commentNo,
      text,
      userId: row.userId ?? null,
      nickname: row.nickname || '',
      avatarUrl: validAvatar || undefined,
      avatarObserved: row.avatarObserved || false,
      vpos: row.vpos,
      accountStatus: row.accountStatus,
      is184: row.is184
    });
    added.push(entry);
    if (!commentNo) {
      const lt = normalizeCommentText(entry.text);
      const lu = String(entry.userId ?? '').trim();
      loneDedupe.add(lt, lu, entry.capturedAt);
      addedLone.push({ text: lt, uid: lu });
    }
  }
  const undo = () => {
    for (const k of addedKeys) keySet.delete(k);
    for (const { text, uid } of addedLone) loneDedupe.remove(text, uid);
  };
  return { added, undo };
}

/**
 * ストレージ上のコメントから合成 canonical URL を除去（ティア判定の誤昇格を防ぐ）。
 * 合成 URL = `niconicoDefaultUserIconUrl(userId)` と完全一致する URL。
 * DOM/intercept で実際に観測された URL は残す（合成 URL とは URL 形式が同じだが、
 * 過去の backfill で書き込まれたものだけ除去対象）。
 * @param {unknown[]} entries
 * @returns {{ next: unknown[], patched: number }}
 */
export function backfillNumericSyntheticAvatarsOnStoredComments(entries) {
  if (!Array.isArray(entries) || !entries.length) {
    return { next: entries, patched: 0 };
  }
  let patched = 0;
  const next = entries.map((e) => {
    const av = String(/** @type {{ avatarUrl?: unknown }} */ (e)?.avatarUrl || '').trim();
    if (!av || !isHttpOrHttpsUrl(av)) return e;
    const uid = String(/** @type {{ userId?: unknown }} */ (e)?.userId || '').trim();
    if (/^\d{5,14}$/.test(uid) && isNiconicoSyntheticDefaultUserIconUrl(av, uid)) {
      patched += 1;
      const copy = { .../** @type {object} */ (e) };
      delete /** @type {Record<string,unknown>} */ (copy).avatarUrl;
      return copy;
    }
    return e;
  });
  return { next, patched };
}
