/**
 * 会場モード(venueBar.js)の「🩺 会場の状態」診断ブロックを組み立てる純関数群。
 *
 * 会議 2026-07-01(council/venue-diag-SYNTHESIS.md)の結論:
 *   - storyAvatarDiagLine.js は popup 用の別 typedef(StoryAvatarDiagSnapshot)で、venue の
 *     participant({ key, userId, name, avatar, count, giftPoints, hasGift })とは型が合わない。
 *     直接流用せず、venue 版をここに新設(storyAvatarDiagLine の「件数のみ・PII なし・ユーザー向け
 *     lead + 折りたたみ」の流儀だけを踏襲)。
 *   - アバター/userId 解決率は participants から【1回だけ】数える純関数にし、会場側は毎フレーム
 *     でなく既存 publishVenueSeatsDiag と同じ 3秒 min-gap + sig 無変化 skip に相乗りさせる
 *     (hot path を重くしない)。
 *   - 「サムネ持ち(顔写真席になれる)」の判定は席描画と同じ participantHasEffectiveThumbnail を
 *     使う=「席ではサムネが出てるのに診断では0」の drift を出さない。
 *
 * 記録/描画/storage には一切触れない純関数のみ(vitest 単体検証用)。
 */

import { escapeHtml } from './htmlEscape.js';
import { participantHasEffectiveThumbnail } from './venueSeats.js';

/**
 * @typedef {{
 *   total: number,       // 会場参加者(実コメントした人)の総数
 *   withUid: number,     // userId(匿名 a: 含む安定識別子)を持つ人数
 *   withAvatar: number,  // stored avatar(http)を持つ人数
 *   resolvedAvatar: number // 席で実サムネ(顔写真)を出せる人数(stored http or 数値ID由来)
 * }} VenueParticipantAvatarCounts
 */

/**
 * 会場参加者の配列から、アバター/userId の件数を数える純関数(1回だけ走査)。
 * サムネ判定は席描画と同じ participantHasEffectiveThumbnail を使う(drift 防止)。
 *
 * @param {ReadonlyArray<{ userId?: string, avatar?: string }>} participants
 * @returns {VenueParticipantAvatarCounts}
 */
export function computeVenueParticipantAvatarCounts(participants) {
  const list = Array.isArray(participants) ? participants : [];
  let total = 0;
  let withUid = 0;
  let withAvatar = 0;
  let resolvedAvatar = 0;
  for (const p of list) {
    if (!p || typeof p !== 'object') continue;
    total += 1;
    if (String(p.userId || '').trim() !== '') withUid += 1;
    if (/^https?:\/\//i.test(String(p.avatar || '').trim())) withAvatar += 1;
    if (participantHasEffectiveThumbnail(p)) resolvedAvatar += 1;
  }
  return { total, withUid, withAvatar, resolvedAvatar };
}

/**
 * 診断の「無変化 skip」用シグネチャ。件数だけを連結する(capturedAt=時刻は入れない=
 * v0.1.1022 明滅の教訓)。会場側はこの文字列が前回と同じなら DOM を触らない。
 *
 * @param {VenueParticipantAvatarCounts} counts
 * @param {Partial<import('./venueSeatsDiag.js').VenueSeatsDiagState>|null|undefined} seatsDiag
 * @returns {string}
 */
export function venueDiagSig(counts, seatsDiag) {
  const c = /** @type {any} */ (counts && typeof counts === 'object' ? counts : {});
  const d = /** @type {any} */ (seatsDiag && typeof seatsDiag === 'object' ? seatsDiag : {});
  /** @param {unknown} x */
  const n = (x) => Math.max(0, Math.floor(Number(x) || 0));
  return [
    n(c.total), n(c.withUid), n(c.withAvatar), n(c.resolvedAvatar),
    n(d.seatsShown), n(d.participantCount), n(d.otherCount),
    d.broadcasterInSeats ? 1 : 0, d.broadcasterKnown ? 1 : 0
  ].join('|');
}

/**
 * 「最終更新から N 秒前」を平易な日本語に(固着検知の一般ユーザー向け表現)。
 * @param {number} agoMs
 * @returns {string}
 */
function formatUpdatedAgo(agoMs) {
  const ms = Number(agoMs);
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const sec = Math.floor(ms / 1000);
  if (sec < 5) return 'たった今';
  if (sec < 60) return `${sec}秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分前`;
  return `${Math.floor(min / 60)}時間前`;
}

/**
 * 会場の診断ブロック HTML を組み立てる純関数(件数のみ・PII なし)。
 * 常に1ブロック(0件も明示)。会場側はこれを折りたたみパネルの中身に差し込む。
 *
 * @param {{
 *   counts: VenueParticipantAvatarCounts,
 *   seatsDiag?: Partial<import('./venueSeatsDiag.js').VenueSeatsDiagState>|null,
 *   updatedAgoMs?: number
 * }} input
 * @returns {string} HTML(常に .nl-venue-diag を1つ返す)
 */
export function buildVenueDiagHtml(input) {
  const counts =
    input && input.counts && typeof input.counts === 'object'
      ? input.counts
      : { total: 0, withUid: 0, withAvatar: 0, resolvedAvatar: 0 };
  const d = /** @type {any} */ (input && input.seatsDiag && typeof input.seatsDiag === 'object' ? input.seatsDiag : {});
  /** @param {unknown} x */
  const n = (x) => Math.max(0, Math.floor(Number(x) || 0));
  const total = n(counts.total);
  const withUid = total <= 0 ? 0 : n(counts.withUid);
  const resolved = total <= 0 ? 0 : n(counts.resolvedAvatar);

  const seatsShown = n(d.seatsShown);
  const participantCount = n(d.participantCount);
  const otherCount = n(d.otherCount);

  const lead =
    `いま会場には <strong>${participantCount}</strong> 人が参加していて、` +
    `席に表示しているのは <strong>${seatsShown}</strong> 人` +
    (otherCount > 0 ? `（ほか <strong>${otherCount}</strong> 人は席に入りきりません）` : '') +
    `。`;

  // faceLine の分母 total は「席にご案内できた人(=allSeats・上限あり)」であり、lead の
  //   participantCount(全参加者・上限なし)とは母集団が違う。500人超の配信で両者が食い違って
  //   見えないよう、文言で「席にご案内できた N 人のうち…」と席ベースを明示する
  //   (レビュー指摘 2026-07-01・total<participantCount の乖離を表示矛盾にしない)。
  const faceLine =
    total > 0
      ? `席にご案内できた <strong>${total}</strong> 人のうち、顔アイコンを表示できているのは ` +
        `<strong>${resolved}</strong> 人、ユーザーIDが付いているのは <strong>${withUid}</strong> 人です。`
      : `まだ参加者がいません。`;

  // 配信者本人の混入(除外漏れ=異常)。判定できないときは触れない(恥をかかせない)。
  let broadcasterLine = '';
  if (d.broadcasterKnown) {
    broadcasterLine = d.broadcasterInSeats
      ? `<p class="nl-venue-diag__warn">⚠️ 配信者ご本人が席に混ざっています（本来は除外されます）。</p>`
      : `<p class="nl-venue-diag__ok">配信者ご本人は席に混ざっていません。</p>`;
  }

  const updated = formatUpdatedAgo(input && input.updatedAgoMs);

  return (
    `<div class="nl-venue-diag">` +
    `<p class="nl-venue-diag__lead">${lead}</p>` +
    `<p class="nl-venue-diag__face">${faceLine}</p>` +
    broadcasterLine +
    `<p class="nl-venue-diag__foot">最終更新: ${escapeHtml(updated)}</p>` +
    `</div>`
  );
}
