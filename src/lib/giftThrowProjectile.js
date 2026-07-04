/**
 * giftThrowProjectile.js
 *
 * 会場モードの「ギフト/広告を投げ主のサムネから中央映像へ投げる」演出の純関数群。
 * 会議(reference_gift_throw_meeting_2026-06-16.md)の収束案を実装する土台。
 *
 * 設計(裏取り済み):
 *   - ギフトには公式サムネ画像がある(v0.1.783・わんコメ OneComme 9.0.2 解析で確定):
 *       https://secure-dcdn.cdn.nimg.jp/nicoad/res/nage/thumbnail/{item_id}.png
 *     item_id が取れれば投げ物を【実画像】にする(取れない時は従来の絵文字+アイテム名テキスト)。
 *     ※ item_id は NDGR 構造化ギフトevent(StoredGiftEvent)経路でのみ取れる。コメント本文パース
 *       経路は item_id を持たないので従来どおり絵文字+テキスト。
 *   - 点火はギフト/広告の【コメント本文パース】 + NDGR event + DOMスキャンの3経路(venueBar 側)。
 *   - 軌道は CSS アニメ(GPU)。JS は起点/着弾の差分を --dx/--dy で渡すだけ=毎フレーム計算しない。
 *   - 性能最優先: 同時表示数の上限を超えたら投げを捨てる(プール/上限は venueBar 側が DOM 管理)。
 */

/** 投げ物の同時表示上限(性能=会場を重くしない。直近の O(N²) 送信18s事故の精神)。 */
export const GIFT_THROW_MAX_CONCURRENT = 8;
/** 着弾アーチの高さ(px・放物線の頂点オフセット)。 */
export const GIFT_THROW_ARC_LIFT_PX = 90;
/**
 * ポイント帯ごとの飛行時間(ms)。大きいギフトは少しゆっくり見せる。
 * v0.1.783: 「一瞬で見えない」改善で全帯を延長(着弾バーストの余韻ぶん含む)。
 */
export const GIFT_THROW_DURATION_MS = Object.freeze({ small: 1500, medium: 1750, large: 2050, mega: 2400 });
/** ニコ生ギフトサムネ画像 CDN ベース(v0.1.783・わんコメ解析で確定)。 */
export const GIFT_THUMBNAIL_BASE = 'https://secure-dcdn.cdn.nimg.jp/nicoad/res/nage/thumbnail/';

/**
 * @typedef {{
 *   kind: 'gift'|'ad',
 *   emoji: string,
 *   label: string,
 *   point: number,
 *   tier: 'small'|'medium'|'large'|'mega',
 *   durationMs: number,
 *   imageUrl: string
 * }} GiftThrowProjectile
 */

/**
 * ギフト item_id から公式サムネ画像 URL を組む純関数(v0.1.783)。
 * item_id は ASCII 英数 + `_` `-` の slug 形式(ndgrDecode の looksLikeValidGiftItemId と同基準)。
 * URL に乗せて安全な形だけ許容し、不正値は ''(=画像なし=絵文字フォールバック)を返す。
 * @param {unknown} itemId
 * @returns {string} 画像 URL または ''
 */
export function resolveGiftImageUrl(itemId) {
  const s = String(itemId ?? '').trim();
  if (!s) return '';
  // 先頭英字・英数 _ - のみ・3〜80文字(ndgrDecode の looksLikeValidGiftItemId と同基準)。
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{2,79}$/.test(s)) return '';
  return `${GIFT_THUMBNAIL_BASE}${s}.png`;
}

/** ポイント→帯(giftBahamut と同じ閾値で揃える)。 @param {unknown} point */
function tierFromPoints(point) {
  const pt = Number(point) || 0;
  if (pt >= 5000) return 'mega';
  if (pt >= 500) return 'large';
  if (pt >= 50) return 'medium';
  return 'small';
}

/** ラベルを短く(長いアイテム名で投げ物が巨大化しないよう省略)。 @param {unknown} s @param {number} [max] */
function clampLabel(s, max = 14) {
  const str = String(s || '').trim();
  const chars = Array.from(str);
  return chars.length <= max ? str : `${chars.slice(0, max).join('')}…`;
}

/**
 * パース済みギフト/広告から投げ物の見た目モデルを作る純関数。
 *
 * @param {{ sender?: string, item?: string, point?: number, itemId?: string }} parsed
 *   itemId(任意・NDGR event 経路のみ)があれば実画像 URL を imageUrl に乗せる。
 * @param {'gift'|'ad'} kind
 * @returns {GiftThrowProjectile|null} 無効(item空のギフト/point<=0)なら null。
 */
export function resolveGiftProjectile(parsed, kind) {
  if (!parsed || typeof parsed !== 'object') return null;
  const point = Number(parsed.point) || 0;
  const tier = tierFromPoints(point);
  const durationMs = GIFT_THROW_DURATION_MS[tier];
  if (kind === 'ad') {
    if (point <= 0) return null;
    return {
      kind: 'ad',
      emoji: '📣',
      label: `${point.toLocaleString('ja-JP')}pt`,
      point,
      tier,
      durationMs,
      imageUrl: '' // 広告は投げ物画像なし(絵文字+ptで見せる)
    };
  }
  // gift
  // v0.1.1058: NDGR構造化イベントは itemName が実測約50%欠落する(ワイヤーレベルの部分欠落・
  //   ndgrDecode.js の実機診断コメント参照)。itemName が空でも「反応した」ことが太鼓の達人的な
  //   応答性の核であるため、汎用ラベル「ギフト」で投げる(検知と演出の一致率を優先・Fable推奨)。
  const item = String(parsed.item || '').trim();
  return {
    kind: 'gift',
    emoji: '🎁',
    label: item ? clampLabel(item) : 'ギフト',
    point,
    tier,
    durationMs,
    imageUrl: resolveGiftImageUrl(parsed.itemId) // item_id があれば実画像・無ければ ''
  };
}

/**
 * 起点(投げ主サムネ)→着弾(中央映像)の軌道を CSS 変数の形で返す純関数。
 * 座標は同一レイヤー(bubbleLayer)ローカル。JS はこれを inline style/CSS変数で要素へ注入する。
 *
 * @param {{ x: number, y: number }} start  起点中心(レイヤーローカル px)
 * @param {{ x: number, y: number }} target 着弾中心(レイヤーローカル px)
 * @param {number} [lift] アーチ頂点の持ち上げ px(既定 GIFT_THROW_ARC_LIFT_PX)
 * @returns {{ startX:number, startY:number, dx:number, dy:number, midX:number, midY:number }}
 */
export function resolveGiftThrowPath(start, target, lift = GIFT_THROW_ARC_LIFT_PX) {
  const sx = Number(start?.x) || 0;
  const sy = Number(start?.y) || 0;
  const tx = Number(target?.x) || 0;
  const ty = Number(target?.y) || 0;
  const dx = tx - sx;
  const dy = ty - sy;
  // 放物線の中間点: 直線の60%地点を、上方向に lift だけ持ち上げる(アーチ感)。
  const midX = dx * 0.6;
  const midY = dy * 0.6 - (Number(lift) || 0);
  return { startX: sx, startY: sy, dx, dy, midX, midY };
}

/**
 * いま投げてよいか(同時上限の判定・純関数)。venueBar 側の active 数を渡す。
 * @param {number} activeCount 現在アニメ中の投げ物数
 * @param {number} [max] 上限(既定 GIFT_THROW_MAX_CONCURRENT)
 * @returns {boolean} true=投げてよい / false=上限超過で捨てる
 */
export function canLaunchGiftThrow(activeCount, max = GIFT_THROW_MAX_CONCURRENT) {
  const n = Number(activeCount) || 0;
  const cap = Number(max) || 0;
  return n < cap;
}
