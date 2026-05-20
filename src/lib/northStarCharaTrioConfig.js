/**
 * 北極星 3 キャラ trio（りんく / こん太 / たぬ姉）の slot 構成と tier 連動 src 解決。
 *
 * 設計意図（v0.1.290, Antigravity §6.4 下準備＝「3 年後楽」設計の継続）:
 *
 *   1) 純関数のみ＝I/O / DOM 操作ゼロ。本実装（v0.1.291 予定）で HTML / CSS / JS
 *      の trio 描画を加える前に、slot ↔ laneId ↔ chara dir/prefix のマッピングと
 *      tier → 画像 src 解決を構造的に固定する。
 *
 *   2) 既存 src/lib/northStarLaneGadgetChara.js（laneId 1 つ → キャラ 1 つの解決）
 *      とは独立。互換性破壊リスクをゼロにするため、表情 suffix テーブル等も
 *      同じ概念だが**独立に**所有する（既存ファイルの export を再利用しない）。
 *
 *   3) slot ↔ laneId 割り振りは既存 northStarLaneGadgetChara.js の `characterForLane`
 *      と整合させる:
 *        rink  ← contributionRanking
 *        konta ← adRanking
 *        tanu  ← giftHistory
 *      これにより「既存 lane gadget の主キャラ」と「trio の対応 slot」が同じ
 *      キャラに揃う＝3 年後にコードを読む人が「なぜ trio の konta は ad なのか」
 *      と混乱しない。
 *
 *   4) trio 本実装で「3 キャラを並列パネルに表示」する際、各 slot は対応 laneId
 *      の取得率 tier をそのまま使う＝既存の `syncNorthStarLaneGadgetFromBodyState`
 *      の tier 計算を再利用するだけで実装可能になる。
 *
 * 本ファイル単体ではユーザー視点の変化ゼロ。本実装と組み合わせて初めて意味を持つ
 * 下準備（テスト ガード付き）。
 */

/**
 * @typedef {{
 *   slotId: 'rink'|'konta'|'tanu',
 *   laneId: 'contributionRanking'|'adRanking'|'giftHistory',
 *   charaDir: 'link'|'konta'|'tanunee',
 *   charaPrefix: 'link'|'kitsune'|'tanuki',
 *   displayName: string,
 *   laneJaName: string
 * }} NorthStarCharaTrioSlot
 */

/** @type {readonly NorthStarCharaTrioSlot[]} */
export const NORTH_STAR_CHARA_TRIO_SLOTS = Object.freeze([
  Object.freeze({
    slotId: 'rink',
    laneId: 'contributionRanking',
    charaDir: 'link',
    charaPrefix: 'link',
    displayName: 'りんく',
    laneJaName: '貢献度ランキング'
  }),
  Object.freeze({
    slotId: 'konta',
    laneId: 'adRanking',
    charaDir: 'konta',
    charaPrefix: 'kitsune',
    displayName: 'こん太',
    laneJaName: '広告ランキング'
  }),
  Object.freeze({
    slotId: 'tanu',
    laneId: 'giftHistory',
    charaDir: 'tanunee',
    charaPrefix: 'tanuki',
    displayName: 'たぬ姉',
    laneJaName: 'この番組のギフト履歴'
  })
]);

/**
 * tier → 日本語ラベル（title / aria-label / SR 読み上げで使う）。
 *
 * 表情 suffix とは別軸の「ユーザーに伝える意味」を表す。3 年後に文言を変える時、
 * 本マップ 1 箇所修正で全 trio slot に伝播する。
 *
 * @type {Readonly<Record<string, string>>}
 */
const TRIO_TIER_JA_LABEL_BY_TIER = Object.freeze({
  wait: '取得待ち',
  none: '未取得',
  low: '取得率 低',
  mid: '取得率 中',
  high: '取得率 高',
  full: '完全取得'
});

/**
 * tier → 日本語ラベル。未知の tier は 'wait' と同じ '取得待ち' に倒れる。
 *
 * @param {string} tier
 * @returns {string}
 */
export function describeCharaTrioTier(tier) {
  const key = String(tier || '').trim();
  return TRIO_TIER_JA_LABEL_BY_TIER[key] || TRIO_TIER_JA_LABEL_BY_TIER.wait;
}

/**
 * trio slot の title / aria-label に使う文字列を組み立てる。
 *
 * 形式: `りんく（貢献度ランキング） · 取得率 78% · 取得率 中`
 *
 * - pct=null の時は「取得待ち」を pct 位置に出す（数値で言いたいなら数値、無いなら言葉）。
 * - tier ラベルは末尾に補足として常に付ける（SR ユーザー向けの状態説明）。
 * - 句読点は `·` (middle dot) で軽い区切りに。
 *
 * @param {{ displayName: string, laneJaName: string }} slot
 * @param {string} tier
 * @param {number|null} pct
 * @returns {string}
 */
export function buildCharaTrioSlotTitle(slot, tier, pct) {
  const name = String(slot?.displayName || '').trim() || 'キャラ';
  const lane = String(slot?.laneJaName || '').trim() || 'レーン';
  const tierLabel = describeCharaTrioTier(tier);
  const pctText =
    typeof pct === 'number' && Number.isFinite(pct)
      ? `取得率 ${Math.round(pct)}%`
      : '取得待ち';
  return `${name}（${lane}） · ${pctText} · ${tierLabel}`;
}

/**
 * laneId から trio slot を逆引き。対応する slot が無いレーン
 * （eventRank / eventScore / programPoints）は null。
 *
 * @param {string} laneId
 * @returns {NorthStarCharaTrioSlot|null}
 */
export function findCharaTrioSlotByLaneId(laneId) {
  const lid = String(laneId || '').trim();
  if (!lid) return null;
  return NORTH_STAR_CHARA_TRIO_SLOTS.find((s) => s.laneId === lid) || null;
}

/**
 * slotId から slot を引く。
 *
 * @param {string} slotId
 * @returns {NorthStarCharaTrioSlot|null}
 */
export function findCharaTrioSlotById(slotId) {
  const sid = String(slotId || '').trim();
  if (!sid) return null;
  return NORTH_STAR_CHARA_TRIO_SLOTS.find((s) => s.slotId === sid) || null;
}

/**
 * tier → 表情ファイル suffix。
 *
 * `northStarLaneGadgetChara.js` の `expressionSuffixForTier` と同型だが、本ファイル
 * 単独完結のため再宣言（互換性破壊リスクゼロ）。
 *
 * @type {Readonly<Record<string, string>>}
 */
const TRIO_EXPRESSION_SUFFIX_BY_TIER = Object.freeze({
  wait: 'blink-mouth-closed',
  none: 'blink-mouth-closed',
  low: 'half-eyes-mouth-closed',
  mid: 'normal-mouth-closed',
  high: 'smile-mouth-closed',
  full: 'smile-mouth-open'
});

/**
 * trio slot 単位の tier 連動キャラ画像 path（拡張ルート相対）。
 *
 * 既存 `northStarLaneGadgetCharaPathByTier(laneId, tier)` と同等の出力を slot から
 * 直接得る。本実装（trio 描画）で `<img src>` に流す。
 *
 * konta(kitsune) は `normal-mouth-closed` の画像アセットが存在しないため、共通の
 * フォールバック `kitsune-yukkuri-mouth-closed.png` を返す（既存挙動と整合）。
 *
 * @param {string} slotId 'rink'|'konta'|'tanu'
 * @param {string} tier 'wait'|'none'|'low'|'mid'|'high'|'full'
 * @returns {string|null} 拡張ルート相対の path、slot 未知なら null
 */
export function tierToTrioCharaSrc(slotId, tier) {
  const slot = findCharaTrioSlotById(slotId);
  if (!slot) return null;
  const key = String(tier || '').trim();
  const suffix = TRIO_EXPRESSION_SUFFIX_BY_TIER[key] || 'blink-mouth-closed';
  if (slot.charaPrefix === 'kitsune' && suffix === 'normal-mouth-closed') {
    return `images/yukkuri-charactore-english/${slot.charaDir}/kitsune-yukkuri-mouth-closed.png`;
  }
  return `images/yukkuri-charactore-english/${slot.charaDir}/${slot.charaPrefix}-yukkuri-${suffix}.png`;
}

/**
 * trio slot click 時に scroll する対象 laneId を解決する純関数。
 *
 * 本実装では trio パネル自体は北極星パネル最上部にあり、対応 laneId のレーンは
 * その下にある＝slot click で smooth scroll させると「気になるキャラを押せば
 * 詳細レーンへ飛ぶ」自然な操作になる。
 *
 * @param {string} slotId
 * @returns {string|null} 対応 laneId、未知 slot は null
 */
export function resolveCharaTrioSlotScrollTargetLaneId(slotId) {
  const slot = findCharaTrioSlotById(slotId);
  return slot ? slot.laneId : null;
}

/**
 * trio 全 slot を tier の Map から一括で展開して、描画モデル配列に正規化する。
 *
 * 本実装での render は「3 slot を for-each」する想定。本関数は「どの slot に
 * どの tier を当てるか」を 1 箇所に集中させる＝3 年後に slot 追加 / 並び替えを
 * したくなった時の差分が本関数 + slots 配列にだけ収まる。
 *
 * @param {Record<string, string>} laneTierMap 例: { contributionRanking: 'full', adRanking: 'low', giftHistory: 'mid' }
 * @returns {{ slot: NorthStarCharaTrioSlot, tier: string, charaSrc: string|null }[]}
 */
export function buildCharaTrioRenderModel(laneTierMap) {
  const map = laneTierMap && typeof laneTierMap === 'object' ? laneTierMap : {};
  return NORTH_STAR_CHARA_TRIO_SLOTS.map((slot) => {
    const t = String(map[slot.laneId] || '').trim() || 'wait';
    return {
      slot,
      tier: t,
      charaSrc: tierToTrioCharaSrc(slot.slotId, t)
    };
  });
}
