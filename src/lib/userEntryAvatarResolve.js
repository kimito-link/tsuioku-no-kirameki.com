/**
 * 1 ユーザーエントリーのアバター状態を組み立てる純関数レイヤ。
 *
 * このモジュールの存在意義は「表示ソース」と「tier 判定用の観測信号」を
 * 混ぜずに 1 箇所で解決することにある。
 *
 * 歴史的背景:
 *   応援レーンの tier 判定（りんく / こん太 / たぬ姉）は、過去に何度も
 *   「視認性が悪い」「匿名が混入する」「良質ユーザーがこん太に漏れる」という
 *   退行を繰り返した。主な原因は、コメント行に詰め込む `avatarUrl` フィールドが
 *   「DOM で観測した実 URL」と「userId から組み立てた合成 canonical URL」を
 *   同じ文字列型で保持し、呼び出し側が「URL があるかどうか」を観測信号として
 *   流用してしまうことだった。
 *
 *   ニコ生の個人アバターは合成 canonical URL（`usericon/s/<bucket>/<uid>.jpg`）
 *   と同じ形で配信されるので、URL の形だけでは「本当に個人サムネがあるか」は
 *   判定できない。したがって:
 *
 *     - 表示ソース（<img src>）は合成 canonical でよい（実際の配信 URL）
 *     - tier 3 に上げる根拠となる観測信号は DOM/intercept で実 URL が
 *       観測されたかだけで立てる
 *
 *   この分離を呼び出し側に正しく守らせるため、このモジュールで
 *   2 つの出力を別々のキーで返す。
 */

import { pickStrongestAvatarUrlForUser } from './supportGrowthTileSrc.js';
import { enrichmentAvatarWithCanonicalFallback } from './enrichmentAvatarFallback.js';
import { shouldAssociateAvatarWithUser } from './avatarBroadcasterGuard.js';

/**
 * @typedef {Object} UserEntryAvatarInput
 * @property {string} userId
 * @property {string} rowAv             DOM 抽出の素の avatarUrl（isHttpAvatarUrl で弾き済みを推奨）
 * @property {string} interceptEntryAv  intercept 行エントリーの avatarUrl（同）
 * @property {string} interceptMapAv    userId→avatar マップの avatarUrl（同）
 * @property {string} [broadcasterUid]      0.1.77: ガード用、現在の配信者 uid（任意）
 * @property {string} [broadcasterIconUrl]  0.1.77: ガード用、現在の配信者アイコン URL（任意）
 */

/**
 * @typedef {Object} UserEntryAvatarSignals
 * @property {string}  displayAvatarUrl  UI で <img src> に入れる URL（合成 canonical 可）
 * @property {boolean} avatarObserved    DOM / intercept で「実際の URL」が 1 つでも観測できたか
 */

/**
 * @param {UserEntryAvatarInput} input
 * @returns {UserEntryAvatarSignals}
 */
export function resolveUserEntryAvatarSignals(input) {
  const userId = String(input?.userId || '').trim();
  const rowAvRaw = String(input?.rowAv || '').trim();
  const interceptEntryAvRaw = String(input?.interceptEntryAv || '').trim();
  const interceptMapAvRaw = String(input?.interceptMapAv || '').trim();
  const broadcasterUid = String(input?.broadcasterUid || '').trim();
  const broadcasterIconUrl = String(input?.broadcasterIconUrl || '').trim();

  // 0.1.77: ギフト演出 DOM での avatar 取り違え対策。
  //   3 ソース（rowAv / interceptEntryAv / interceptMapAv）すべてに対し、
  //   broadcaster icon と一致する URL は uid が broadcaster 本人でない限り
  //   無効化する。これにより comment record に焼き込み済みの誤データや
  //   intercept キャッシュの汚染も表示時点で除外できる（defense in depth）。
  /** @param {string} av */
  const guard = (av) =>
    shouldAssociateAvatarWithUser({
      uid: userId,
      av,
      broadcasterUid,
      broadcasterIconUrl
    })
      ? av
      : '';
  const rowAv = guard(rowAvRaw);
  const interceptEntryAv = guard(interceptEntryAvRaw);
  const interceptMapAv = guard(interceptMapAvRaw);

  // 観測信号（tier 判定用）:
  //   DOM or intercept のいずれかで「実 URL」を掴めているかだけを見る。
  //   合成 canonical はこれには含めない（URL 形だけで個人か否かは判定できないため）。
  const avatarObserved = Boolean(rowAv || interceptEntryAv || interceptMapAv);

  // 表示ソース（UI 用）:
  //   観測ソースを優先、いずれも空なら canonical にフォールバックしてよい
  //   （ニコ生は大多数の個人サムネを canonical 形で配信する）。
  const canonicalFallback = enrichmentAvatarWithCanonicalFallback(
    userId,
    interceptEntryAv,
    interceptMapAv,
    rowAv
  );
  const displayAvatarUrl =
    pickStrongestAvatarUrlForUser(userId, [
      interceptEntryAv,
      interceptMapAv,
      rowAv,
      canonicalFallback
    ]) || '';

  return { displayAvatarUrl, avatarObserved };
}
