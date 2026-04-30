/**
 * ニコ生の匿名ユーザーID（a: で始まる内部ID）向けの表示補完。
 * API・NDGR・DOM のいずれでも表示名が空のときが多いため、公式UIに合わせ「匿名」を補う。
 */

/**
 * @param {unknown} userId
 * @returns {boolean}
 */
export function isNiconicoAnonymousUserId(userId) {
  const s = String(userId ?? '').trim();
  if (!s.startsWith('a:')) return false;
  const rest = s.slice(2).trim();
  return rest.length >= 2;
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
