/**
 * ニコ生の匿名ユーザーID（a: で始まる内部ID）向けの表示補完。
 * API・NDGR・DOM のいずれでも表示名が空のときが多いため、公式UIに合わせ「匿名」を補う。
 */

/**
 * タイムシフト等で `a:` 接頭辞を持たない NDGR 匿名 hashedUserId の形（v0.1.1558）。
 *
 * 実測（lv342383970・2023-09-18 のタイムシフト・2026-10-05）: 匿名コメント 417 件の userId は
 * `sIEHqCaHKR_Pe1v1ZU61TnVABv8` のような 27 文字 base64url で `a:` が付かず、`is184` も false。
 * 従来の判定（`a:` 始まりだけ）を素通りして `formatNicknameWithUidFallback` の `u/<uid先頭20文字>`
 * に落ち、画面に `u/hlTkweodfOQ4gP…` のような内部 ID 断片が出ていた（AGENTS §3.5 違反）。
 *
 * 境界 16〜40: 実測は 20（断片）と 27、`a:` 形の本体は 16 文字。下限 16 で `ch2640322` のような
 * 短い識別子やニックネーム風の文字列を弾き、上限 40 で既存の `u/` フォールバック契約
 * （giftDisplayNickname.test.js の 50 文字ケース）を壊さない。
 */
export const NICO_HASHED_ANON_USER_ID_RE = /^[A-Za-z0-9_-]{16,40}$/;

/**
 * `a:` 無しの hashed 匿名 ID か。数値 uid・内部キー（`__anon_ad_2` 等の `__` 始まり）・空は false。
 * @param {unknown} userId
 * @returns {boolean}
 */
export function isNiconicoHashedAnonymousUserId(userId) {
  const s = String(userId ?? '').trim();
  if (!s) return false;
  if (s.startsWith('__')) return false;
  if (/^\d+$/.test(s)) return false;
  return NICO_HASHED_ANON_USER_ID_RE.test(s);
}

/**
 * 匿名ユーザー ID か（★匿名判定の正本・v0.1.1558 で hashed 形へ広げた）。
 *   - `a:` 始まり（大小無視・本体 2 文字以上）= 生放送の匿名(184)
 *   - 上記 `NICO_HASHED_ANON_USER_ID_RE` の hashed 形 = タイムシフトの匿名
 * 各画面（会場=応援レーン=別窓・コメビュ・レポート）はこの関数を呼び、`a:` を直書きしない。
 * @param {unknown} userId
 * @returns {boolean}
 */
export function isNiconicoAnonymousUserId(userId) {
  const s = String(userId ?? '').trim();
  if (/^a:/i.test(s)) {
    const rest = s.slice(2).trim();
    return rest.length >= 2;
  }
  return isNiconicoHashedAnonymousUserId(s);
}

/**
 * ニコ生が匿名コメントに付けることがある「user + 英数字」形式の自動表示名。
 * 実質プロフィールではないので応援段の「強い表示名」には使わない。
 * @param {unknown} nickname
 */
export function isNiconicoAutoUserPlaceholderNickname(nickname) {
  const n = String(nickname ?? '').trim();
  return /^user\s+[A-Za-z0-9]+$/i.test(n);
}

/**
 * 数値 ID ユーザーがハンドル名を未設定のとき、ニコ既定で表示される「ゲスト」。
 * これも実質プロフィールではないので、レポートでハンドルがあるかのように
 * 「ゲスト（123456）」と表示すると誤解を招く。完全一致のみ placeholder 判定し、
 * 「ゲスト123」「ゲストさん」のような派生は本人がカスタム設定した名前として尊重する。
 * @param {unknown} nickname
 */
export function isNiconicoGuestPlaceholderNickname(nickname) {
  const n = String(nickname ?? '').trim();
  return n === 'ゲスト';
}

/**
 * 既にニックネームがあるときはそのまま。無ければ匿名IDなら「匿名」。
 *
 * 0.1.13 (I): ニコ既定 placeholder（「ゲスト」「user XXXX」）は無いものとして扱う。
 *   - 数値 ID + nickname=ゲスト → 空文字（呼び出し側で「ID のみ」表示）
 *   - 数値 ID + nickname=「user 0539Z74OJ13」→ 同上
 *   - 匿名 a: + nickname=ゲスト → 「匿名」（フォールバック）
 *
 * @param {unknown} userId
 * @param {unknown} nickname
 * @returns {string} 空文字可（非匿名かつ名無し or 既定 placeholder）
 */
export function anonymousNicknameFallback(userId, nickname) {
  const nick = String(nickname ?? '').trim();
  // 既定 placeholder は「ハンドル無し」として扱う（実名と区別する）
  const isPlaceholder =
    isNiconicoGuestPlaceholderNickname(nick) ||
    isNiconicoAutoUserPlaceholderNickname(nick);
  if (nick && !isPlaceholder) return nick;
  return isNiconicoAnonymousUserId(userId) ? '匿名' : '';
}

/**
 * 応援アイコン列など狭い幅用の ID 表示。完全な ID は title 属性などで別途示す。
 * @param {unknown} userId
 * @returns {string}
 */
export function compactNicoLaneUserId(userId) {
  const s = String(userId ?? '').trim();
  if (!s) return '';
  if (/^\d{5,14}$/.test(s)) {
    return s.length <= 18 ? s : `${s.slice(0, 8)}…${s.slice(-6)}`;
  }
  if (/^a:/i.test(s)) {
    const rest = s.slice(2).trim();
    const head = rest.slice(0, 4);
    if (rest.length <= 5) return `a:${rest}`;
    return `a:${head}…`;
  }
  if (s.length <= 12) return s;
  return `${s.slice(0, 5)}…${s.slice(-3)}`;
}
