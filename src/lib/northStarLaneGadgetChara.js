/**
 * 北極星レーン左ガジェットのキャラ画像（拡張ルート相対）。
 * モックの「レーンごとに違う案内キャラ」を維持しつつ、取得 tier に応じて表情を差し替える。
 */

/**
 * @typedef {'wait'|'none'|'low'|'mid'|'high'|'full'} GadgetCharaTier
 */

/**
 * laneId → 担当キャラ {dir, prefix}。
 * dir は src/images/yukkuri-charactore-english/<dir>/、prefix はファイル名先頭。
 * 既存マッピング（konta=adRanking / tanu=giftHistory / rink=その他）を維持。
 *
 * @param {string} laneId
 * @returns {{ dir: 'link'|'konta'|'tanunee', prefix: 'link'|'kitsune'|'tanuki' }}
 */
function characterForLane(laneId) {
  const lid = String(laneId || '').trim();
  switch (lid) {
    case 'adRanking':
      return { dir: 'konta', prefix: 'kitsune' };
    case 'giftHistory':
      return { dir: 'tanunee', prefix: 'tanuki' };
    case 'contributionRanking':
    case 'eventRank':
    case 'eventScore':
    case 'programPoints':
    default:
      return { dir: 'link', prefix: 'link' };
  }
}

/**
 * tier → 表情ファイル suffix。
 * `wait`/`none` は目を閉じ、tier が上がるほど目が開き、最終的に口が開く。
 *
 * @param {string} tier
 * @returns {'blink-mouth-closed'|'half-eyes-mouth-closed'|'normal-mouth-closed'|'smile-mouth-closed'|'smile-mouth-open'}
 */
function expressionSuffixForTier(tier) {
  const t = String(tier || '').trim();
  switch (t) {
    case 'low':
      return 'half-eyes-mouth-closed';
    case 'mid':
      return 'normal-mouth-closed';
    case 'high':
      return 'smile-mouth-closed';
    case 'full':
      return 'smile-mouth-open';
    case 'wait':
    case 'none':
    default:
      return 'blink-mouth-closed';
  }
}

/**
 * 旧 API（marketing-html-avatars 配下の固定 1 枚を返す）。新規呼び出しでは
 * `northStarLaneGadgetCharaPathByTier` を使うこと。互換のため残置。
 *
 * @param {string} laneId
 * @returns {string}
 */
export function northStarLaneGadgetCharaRelativePath(laneId) {
  const lid = String(laneId || '').trim();
  switch (lid) {
    case 'adRanking':
      return 'images/marketing-html-avatars/konta-72.png';
    case 'giftHistory':
      return 'images/marketing-html-avatars/tanu-72.png';
    case 'contributionRanking':
    case 'eventRank':
    case 'eventScore':
    case 'programPoints':
    default:
      return 'images/marketing-html-avatars/rink-72.png';
  }
}

/**
 * 北極星レーン左ガジェットの tier 連動キャラ画像 path（拡張ルート相対）。
 * 取得率に応じて表情が変わる（寝てる→うとうと→普通→にっこり→満面の笑み）。
 *
 * @param {string} laneId
 * @param {string} tier `wait`|`none`|`low`|`mid`|`high`|`full`
 * @returns {string}
 */
export function northStarLaneGadgetCharaPathByTier(laneId, tier) {
  const { dir, prefix } = characterForLane(laneId);
  const suffix = expressionSuffixForTier(tier);
  // konta(kitsune) は normal-mouth-closed が無いので mouth-closed.png にフォールバック
  if (prefix === 'kitsune' && suffix === 'normal-mouth-closed') {
    return `images/yukkuri-charactore-english/${dir}/kitsune-yukkuri-mouth-closed.png`;
  }
  return `images/yukkuri-charactore-english/${dir}/${prefix}-yukkuri-${suffix}.png`;
}
