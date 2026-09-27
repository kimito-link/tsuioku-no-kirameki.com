import {
  supporterRows, identifiedSupporters, identifiedSupportersByName, commentRows, isBlankIcon
} from './liveRankingView.js';
import { anonymousIdenticonDataUrl } from './anonymousIdenticon.js';
import { formatNumberJa as fmt } from './htmlText.js';

/** 段の並び(拡張の会場と同じ順: venueLaneMirrorSupply.js:21 から ad を除いた4段)。 */
export const LANES = /** @type {const} */ (['link', 'konta', 'gift', 'tanu']);

/**
 * @typedef {{ uid: string, name: string, avatar: string, url: string, pts: string, point: number,
 *   identicon: boolean, hover: boolean }} LaneTile
 *   - identicon: true なら <img class="tava-identicon">(bindImgFallback 対象外)。false なら <img class="tava">。
 *   - hover: true ならコメント集計に居る人(li に data-uid/data-lv を付けてホバーカードの対象にする)。
 * @typedef {{ link: LaneTile[], konta: LaneTile[], gift: LaneTile[], tanu: LaneTile[],
 *   counts: { link: number, konta: number, gift: number, giftNameless: number,
 *             tanu: number, tanuTiles: number, commenters: number, partial: boolean } }} LaneBuckets
 */

/** @param {unknown} giftPt @param {unknown} adPt @param {unknown} commentCount */
function ptsText(giftPt, adPt, commentCount) {
  const gift = Number(giftPt) || 0;
  const ad = Number(adPt) || 0;
  const comments = Number(commentCount) || 0;
  return (gift ? `🎁${fmt(gift)}` : '')
    + (gift && ad ? ' ' : '') + (ad ? `📣${fmt(ad)}` : '')
    + ((gift || ad) && comments ? ' ' : '') + (comments ? `💬${fmt(comments)}` : '');
}

/**
 * 1 配信 → 4 段。★純関数: 同じ payload(と同じ probe)からは deep-equal な結果が出る。
 * @param {any} live
 * @param {{ avatarProbe?: ReadonlyMap<string, 'ok'|'missing'> }} [opts] Phase 2 で使う(MVP は渡さない)
 * @returns {LaneBuckets}
 */
export function laneBuckets(live, opts = {}) {
  void opts;
  const c = live && live.comment && typeof live.comment === 'object' ? live.comment : null;
  const commentUids = new Set(commentRows(live).map((r) => r.uid));

  // りんく: 既存の第1段そのまま(gift/ad の確定サムネ)。
  const link = identifiedSupporters(live).map((p) => ({
    uid: p.uid, name: p.name, avatar: p.avatar, url: p.url, point: p.total,
    pts: ptsText(p.giftPt, p.adPt, 0), identicon: false, hover: commentUids.has(p.uid)
  }));
  // こん太: 既存の第2段そのまま(識別絵・点線枠)。
  const konta = identifiedSupportersByName(live).map((p) => ({
    uid: p.uid, name: p.name, avatar: p.avatar, url: p.url, point: p.count,
    pts: ptsText(p.giftPt, p.adPt, p.commentCount), identicon: true, hover: p.commentCount > 0
  }));
  // ギフト: koken 上位10のうち uid がある人(りんく/こん太との両在籍を許す=拡張と同じ)。
  const giftRows = supporterRows(live).gift;
  const gift = giftRows.filter((r) => r.uid).map((r) => {
    const real = !!r.avatar && !isBlankIcon(r.avatar);
    return {
      uid: r.uid, name: r.name, url: r.url, point: r.point,
      avatar: real ? r.avatar : anonymousIdenticonDataUrl(r.uid, 64), identicon: !real,
      pts: `🎁${fmt(r.point)}`, hover: commentUids.has(r.uid)
    };
  });
  const giftNameless = giftRows.length - gift.length;
  // たぬ姉: コメント集計の匿名行(commentRows が既に「匿名NNN(·断片)」と識別絵を付けている)。
  const tanu = commentRows(live).filter((r) => r.anon).map((r) => ({
    uid: r.uid, name: r.name, avatar: r.avatar, url: '', point: r.point,
    pts: `💬${fmt(r.point)}`, identicon: true, hover: true
  }));

  return {
    link, konta, gift, tanu,
    counts: {
      link: link.length, konta: konta.length, gift: gift.length, giftNameless,
      tanu: c ? Number(c.anonCommenters) || 0 : 0, tanuTiles: tanu.length,
      commenters: c ? Number(c.commenters) || 0 : 0, partial: !!(c && c.partial)
    }
  };
}

/**
 * タイルの追跡キー(段×uid)。匿名 uid(a:…)はその番組の中で一定なので鍵に使える。
 * @param {string} liveId
 * @param {string} lane
 * @param {{ uid: string }} tile
 * @returns {string}
 */
export function laneTileKey(liveId, lane, tile) {
  return `${liveId}|${lane}|${tile.uid}`;
}

/**
 * 「匿名 42人・上位10人を表示」/「名無し 3人」の文言。
 * @param {string} lane
 * @param {LaneBuckets['counts']} counts
 * @returns {string}
 */
export function laneMoreText(lane, counts) {
  const c = counts || /** @type {LaneBuckets['counts']} */ ({});
  if (lane === 'tanu') {
    const total = Math.max(0, Number(c.tanu) || 0);
    const tiles = Math.max(0, Number(c.tanuTiles) || 0);
    const more = Math.max(0, total - tiles);
    return more > 0 ? `ほか ${fmt(more)}人` : '';
  }
  if (lane === 'gift') {
    const nameless = Math.max(0, Number(c.giftNameless) || 0);
    return nameless > 0 ? `名無し ${fmt(nameless)}人` : '';
  }
  return '';
}
