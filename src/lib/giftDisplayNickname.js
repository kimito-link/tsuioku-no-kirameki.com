/**
 * NDGR ギフト protobuf から拾いがちな「内部用ラベル」を表示名から除外する。
 * 実例: nicolive_audition_lightgreen 等（本家の表示名ではない）
 */

import { supportGridStrongNickname } from './supportGridDisplayTier.js';

/**
 * @param {unknown} s
 * @returns {boolean}
 */
export function isLikelyInternalNdgGiftOrCampaignLabel(s) {
  const t = String(s || '').trim();
  if (!t) return false;
  if (/^nicolive_/i.test(t)) return true;
  // ニコ生クライアントがコメント／ギフト行に載せる内部系プレフィックス（本家プロフィール名ではない）
  if (/^stamp_[a-z0-9_]{2,}$/i.test(t)) return true;
  // 長い ASCII のみ snake_case（人間のニックに稀なパターン）
  const hasNonAscii = [...t].some((ch) => (ch.codePointAt(0) ?? 0) > 127);
  if (/^[a-z][a-z0-9_]{22,}$/i.test(t) && !hasNonAscii) return true;
  return false;
}

/**
 * 応援グリッド用途で「本家 UI に近い表示名」として信頼できるか
 * （{@link supportGridStrongNickname} かつ内部ラベルではない）
 * @param {string} nick
 * @param {string} userId
 * @returns {boolean}
 */
export function isTrustworthySupportGridDisplayNickname(nick, userId) {
  const uid = String(userId || '').trim();
  const n = String(nick || '').trim();
  if (!n) return false;
  if (isLikelyInternalNdgGiftOrCampaignLabel(n)) return false;
  return supportGridStrongNickname(n, uid);
}

/**
 * ストレージ上のニックを、より信頼できる新ニックで置き換えるか
 * @param {string} prev
 * @param {string} next
 * @param {string} userId
 */
export function nicknameShouldReplaceExisting(prev, next, userId) {
  const p = String(prev || '').trim();
  const n = String(next || '').trim();
  const uid = String(userId || '').trim();
  if (!n) return false;
  if (!p) return !isLikelyInternalNdgGiftOrCampaignLabel(n) || isTrustworthySupportGridDisplayNickname(n, uid);
  if (isLikelyInternalNdgGiftOrCampaignLabel(p) && !isLikelyInternalNdgGiftOrCampaignLabel(n)) {
    return true;
  }
  if (
    isTrustworthySupportGridDisplayNickname(n, uid) &&
    !isTrustworthySupportGridDisplayNickname(p, uid)
  ) {
    return true;
  }
  return false;
}

/**
 * ニコ公式プロフィール風の表示（和文・全角＠等）か。
 * 英字のみの長いハンドルより優先したいときに使う。
 * @param {string} s
 */
function containsJapaneseScriptOrFullwidthDisplayChars(s) {
  return /[\u3040-\u30FF\u4E00-\u9FFF\u3000-\u303F\uFF00-\uFFEF]/.test(String(s || ''));
}

/**
 * コメント欄・ギフト由来の英字ハンドルっぽい文字列（正式プロフィール名より短く紛れやすい）
 * @param {string} s
 */
function isLikelyPlainAsciiHandleNickname(s) {
  const t = String(s || '').trim();
  if (t.length < 8) return false;
  return /^[a-z0-9_]+$/i.test(t);
}

/**
 * アンダースコア付きの長い ASCII（ギフト等で紛れやすい内部ハンドル）
 * @param {string} s
 */
function isLikelySnakeCaseAsciiHandleNickname(s) {
  const t = String(s || '').trim();
  if (t.length < 8) return false;
  if (!t.includes('_')) return false;
  return /^[a-z0-9_]+$/i.test(t);
}

/**
 * 短い英字のみのコメント表示（プロフィールの短い固有名など）
 * @param {string} s
 */
function isShortLatinLettersOnlyNickname(s) {
  const t = String(s || '').trim();
  if (t.length < 2 || t.length > 20) return false;
  return /^[A-Za-z]+$/.test(t);
}

/**
 * content script の `interceptedNicknames` 等で、同一 userId に複数ソースから
 * 名前が届くときのマージ（盲 `Map.set` による短い／古い表示への退行を防ぐ）。
 * {@link mergeIntoMap}（プロフィールキャッシュ）と同優先度。
 *
 * @param {string} userId
 * @param {string} prevNick 既存（空可）
 * @param {string} incomingNick 新規
 * @returns {string}
 */
export function pickBetterInterceptNickname(userId, prevNick, incomingNick) {
  const uid = String(userId || '').trim();
  const prev = String(prevNick || '').trim();
  const next = String(incomingNick || '').trim();
  if (!next) return prev;
  if (!prev) return next;

  const prevInternal = isLikelyInternalNdgGiftOrCampaignLabel(prev);
  const nextInternal = isLikelyInternalNdgGiftOrCampaignLabel(next);
  const prevTrust = isTrustworthySupportGridDisplayNickname(prev, uid);
  const nextTrust = isTrustworthySupportGridDisplayNickname(next, uid);

  /** @type {boolean} */
  let preferNext = false;
  if (prevInternal && !nextInternal) preferNext = true;
  else if (!prevInternal && nextInternal) preferNext = false;
  else if (prevTrust && !nextTrust) preferNext = false;
  else if (!prevTrust && nextTrust) preferNext = true;
  else if (
    !prevInternal &&
    !nextInternal &&
    prevTrust &&
    nextTrust &&
    containsJapaneseScriptOrFullwidthDisplayChars(next) &&
    isLikelyPlainAsciiHandleNickname(prev)
  ) {
    preferNext = true;
  } else if (
    !prevInternal &&
    !nextInternal &&
    prevTrust &&
    nextTrust &&
    containsJapaneseScriptOrFullwidthDisplayChars(prev) &&
    isLikelyPlainAsciiHandleNickname(next)
  ) {
    preferNext = false;
  } else if (
    !prevInternal &&
    !nextInternal &&
    prevTrust &&
    nextTrust &&
    isShortLatinLettersOnlyNickname(next) &&
    isLikelySnakeCaseAsciiHandleNickname(prev)
  ) {
    preferNext = true;
  } else if (
    !prevInternal &&
    !nextInternal &&
    prevTrust &&
    nextTrust &&
    isShortLatinLettersOnlyNickname(prev) &&
    isLikelySnakeCaseAsciiHandleNickname(next)
  ) {
    preferNext = false;
  } else if (next.length > prev.length) preferNext = true;

  return preferNext ? next : prev;
}

/**
 * ギフト帯・応援ランク用の最終表示名（ストレージ優先だが内部ラベルはコメント側へ譲る）
 * @param {string} userId
 * @param {string} storedNick
 * @param {string} commentCachedNick
 * @param {string} [interceptNick] 視聴ページ intercept で観測した表示名（本家コメ UI 由来）
 * @returns {string}
 */
export function pickGiftRankDisplayNickname(
  userId,
  storedNick,
  commentCachedNick,
  interceptNick = ''
) {
  const uid = String(userId || '').trim();
  let n = String(storedNick || '').trim();
  const b = String(commentCachedNick || '').trim();
  const c = String(interceptNick || '').trim();
  n = pickBetterInterceptNickname(uid, n, b);
  n = pickBetterInterceptNickname(uid, n, c);
  return n;
}

/**
 * 0.1.182: pickGiftRankDisplayNickname の戻り値で nickname が空のときに
 * `formatNicknameWithUidFallback` を適用するラッパ。「サムネあり匿名」事象の
 * 表示側対処。各 UI 表示箇所で順次切り替えていく予定。
 *
 * 既存の pickGiftRankDisplayNickname は変えない（戻り値が「空文字 = 匿名」を
 * 期待する呼び出し側を壊さないため）。fallback が要る箇所だけこの関数を使う。
 *
 * @param {string} userId
 * @param {string} storedNick
 * @param {string} commentCachedNick
 * @param {string} [interceptNick]
 * @returns {string}
 */
export function pickGiftRankDisplayNicknameWithUidFallback(
  userId,
  storedNick,
  commentCachedNick,
  interceptNick = ''
) {
  const resolved = pickGiftRankDisplayNickname(
    userId,
    storedNick,
    commentCachedNick,
    interceptNick
  );
  return formatNicknameWithUidFallback(userId, resolved);
}

/**
 * ギフト系 UI 用の表示名解決ラッパ。
 * popup 側のクイック一覧・ストリップ・レポートで同じコール形に寄せる。
 *
 * @param {unknown} userId
 * @param {unknown} storedNick
 * @param {{
 *   rememberedNicknameForUserId?: (uid: string) => unknown,
 *   interceptNicknameForUserId?: (uid: string) => unknown
 * }} [opts]
 * @returns {string}
 */
export function resolveGiftRankDisplayNickname(userId, storedNick, opts = {}) {
  const uid = String(userId || '').trim();
  const remembered =
    uid && typeof opts?.rememberedNicknameForUserId === 'function'
      ? opts.rememberedNicknameForUserId(uid)
      : '';
  const intercept =
    uid && typeof opts?.interceptNicknameForUserId === 'function'
      ? opts.interceptNicknameForUserId(uid)
      : '';
  return pickGiftRankDisplayNickname(
    uid,
    String(storedNick ?? ''),
    String(remembered ?? ''),
    String(intercept ?? '')
  );
}

/**
 * 0.1.181: nickname が空の uid に対して、匿名表示ではなく **uid フォールバック表示**を返す。
 *
 * 真因（v0.1.180 診断 JSON で確定）：
 * - niconico の NDGR chat row は「uid あり / nickname 空」で来るケースが多い
 *   （ユーザーが nickname を設定していない、184 でない通常コメントの一部 等）
 * - avatar URL は `nicoaccount/usericon/s/<head4>/<uid>.jpg` 形式で uid から
 *   自動合成可能なため avatar map には保存される
 * - 結果：「サムネあり / nickname 空 / popup で『匿名』表示」になっていた
 *
 * 解決：nickname が空でも、uid そのものを `u/<uid>` 形式で表示することで「匿名」表示を回避。
 * 外部 fetch なしで完結する。元の nickname 解決が成功する経路があれば、それが優先される
 * （`pickGiftRankDisplayNickname` の戻り値が空のときだけこのフォールバックを使う）。
 *
 * @param {string} userId
 * @param {string} resolvedNickname pickGiftRankDisplayNickname / resolveGiftRankDisplayNickname の戻り値
 * @returns {string} resolved があればそのまま、なければ `u/<uid>` 形式
 */
export function formatNicknameWithUidFallback(userId, resolvedNickname) {
  const nick = String(resolvedNickname || '').trim();
  if (nick) return nick;
  const uid = String(userId || '').trim();
  if (!uid) return '';
  // 匿名形式（a:xxx）はそのまま返す（既存の匿名表示ロジックを壊さない）
  if (/^a:/i.test(uid)) return '';
  // 数値 uid なら `u/4814023` 形式（ニコ生の URL 形式に合わせる）
  if (/^\d+$/.test(uid)) return `u/${uid}`;
  // それ以外（予期しない形式）は uid をそのまま slice
  return `u/${uid.slice(0, 20)}`;
}

/**
 * NDGR ギフト着信行の nickname を、intercept マップで上書きできるなら上書きする（merge 直前）。
 * @param {{ userId?: unknown, nickname?: unknown }[]} incoming
 * @param {(uid: string) => string} getInterceptNick
 * @returns {{ userId?: unknown, nickname?: unknown }[]}
 */
export function enrichIncomingGiftThrowUsersWithInterceptNicknames(incoming, getInterceptNick) {
  if (!Array.isArray(incoming) || !incoming.length) return incoming;
  const get = typeof getInterceptNick === 'function' ? getInterceptNick : () => '';
  return incoming.map((u) => {
    const uid = String(u?.userId ?? '').trim();
    if (!uid) return u;
    const ndgr = String(u?.nickname ?? '').trim();
    const intercept = String(get(uid) || '').trim();
    if (!intercept) return u;
    const merged = pickBetterInterceptNickname(uid, ndgr, intercept);
    if (merged !== ndgr) return { ...u, nickname: merged };
    return u;
  });
}

/**
 * ストレージ済みギフト行の nickname を intercept で後追い補正する。
 * @param {Array<Record<string, unknown>>} rows
 * @param {(uid: string) => string} getInterceptNick
 * @returns {{ next: Array<Record<string, unknown>>, storageTouched: boolean }}
 */
export function upgradeGiftUserRowsWithInterceptNicknames(rows, getInterceptNick) {
  if (!Array.isArray(rows) || !rows.length) {
    return { next: Array.isArray(rows) ? rows : [], storageTouched: false };
  }
  const get = typeof getInterceptNick === 'function' ? getInterceptNick : () => '';
  let storageTouched = false;
  const next = rows.map((row) => {
    const uid = String(row?.userId ?? '').trim();
    if (!uid) return row;
    const nick = String(row?.nickname ?? '').trim();
    const intercept = String(get(uid) || '').trim();
    if (intercept) {
      const merged = pickBetterInterceptNickname(uid, nick, intercept);
      if (merged !== nick) {
        storageTouched = true;
        return { ...row, nickname: merged };
      }
    }
    return row;
  });
  return { next, storageTouched };
}
