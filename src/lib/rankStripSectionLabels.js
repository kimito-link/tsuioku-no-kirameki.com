/**
 * ポップアップ内「応援コメントランキング帯」と「ギフトランキング帯」の見出し・注記の正本。
 * 本家の「応援サポーター」とは別データ源であることを短く示す。
 */

/** 帯先頭の主ラベル（コメント側） */
export const RANK_STRIP_COMMENT_HEADING = '応援コメント';

/** 帯先頭の補助バッジ（コメント側） */
export const RANK_STRIP_COMMENT_BADGE = 'このPCの記録';

/** コメント帯の説明（ギフト帯と別集計であることを明示） */
export const RANK_STRIP_COMMENT_NOTE =
  'ユーザー別の応援件数が多い順です。下の「ギフト・投げ」とは別集計です。2位以降は当ストリップの1位（最多件）との差を表示します（本家の貢献度ランキングとは別です）。';

/** コメントゼロ・配信者タイルのみのとき */
export const RANK_STRIP_COMMENT_EMPTY_NOTE =
  'まだ応援コメントがありません。下の「ギフト・投げ」とは別です。まずは配信者のフォローから。';

/** 帯先頭の主ラベル（ギフト側） */
export const RANK_STRIP_GIFT_HEADING = 'ギフト・投げ';

/** 帯先頭の補助バッジ（ギフト側） */
export const RANK_STRIP_GIFT_BADGE = 'NDGR 検知';

/** ギフト帯の説明（コメント帯・本家貢献度と別であることを明示。数字は検知回数のみ） */
export const RANK_STRIP_GIFT_NOTE =
  'ユーザー別の投げ／ギフト検知回数の多い順です（表示は回数のみ。本家の「貢」とは別指標）。上の「応援コメント」とは別集計です。本家の「貢献度ランキング」とも別です。2位以降は当ストリップ内の最多回との差を表示します（貢ポイントではありません）。';

/**
 * 帯上部のピラー行（見出し＋バッジ）の HTML。中身は定数のみ（XSS なし）。
 *
 * @param {'comments'|'gifts'} kind
 * @returns {string}
 */
export function buildRankStripPillarRowHtml(kind) {
  const isGift = kind === 'gifts';
  const heading = isGift ? RANK_STRIP_GIFT_HEADING : RANK_STRIP_COMMENT_HEADING;
  const badge = isGift ? RANK_STRIP_GIFT_BADGE : RANK_STRIP_COMMENT_BADGE;
  const mod = isGift ? 'gifts' : 'comments';
  return (
    `<div class="nl-rank-strip-pillar nl-rank-strip-pillar--${mod}" role="group" ` +
    `aria-label="${heading}（${badge}）">` +
    `<span class="nl-rank-strip-pillar__heading">${heading}</span>` +
    `<span class="nl-rank-strip-pillar__badge">${badge}</span>` +
    `</div>`
  );
}
