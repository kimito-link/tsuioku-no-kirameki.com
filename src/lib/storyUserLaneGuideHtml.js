/**
 * 応援ユーザーレーンの案内 HTML（ポップアップ・E2E と共有）
 */

import { escapeAttr, escapeHtml } from './htmlEscape.js';
import { SUPPORT_VISUAL_DEV_MONITOR_SUMMARY_LABEL } from './supportVisualStoryCopy.js';

/** @param {string} src @param {string} textEscaped 既に escapeHtml 済みの本文 */
function storyUserLaneGuideLine(src, textEscaped) {
  return (
    `<div class="nl-story-userlane-guide__line">` +
    `<img class="nl-story-userlane-guide__face" src="${escapeAttr(src)}" alt="" width="24" height="24" decoding="async" />` +
    `<span class="nl-story-userlane-guide__text">${textEscaped}</span>` +
    `</div>`
  );
}

/** @param {string} faceLink 案内アイコン URL */
export function buildStoryUserLaneGuideTopHtml(faceLink) {
  return storyUserLaneGuideLine(
    faceLink,
    escapeHtml(
      'りんく: 数値ユーザーID＋個人サムネが揃った応援だけ、この列に載せるよ。匿名（a:）はカスタム表示名やサムネが見えていても上には出さず、下の段に流す設計だよ。'
    )
  );
}

/** @param {string} faceGift 案内アイコン（ギフト投げ主列） */
export function buildStoryUserLaneGuideGiftHtml(faceGift) {
  return storyUserLaneGuideLine(
    faceGift,
    escapeHtml(
      'ギフト列: この放送でギフトを投げた人を、数値ユーザーIDで記録できた順に並べるよ。個人サムネが取れている人はその画像、まだの人はゆっくり画像で表示するよ。'
    )
  );
}

/** @param {string} faceAd 案内アイコン（広告投稿者列） */
export function buildStoryUserLaneGuideAdHtml(faceAd) {
  return storyUserLaneGuideLine(
    faceAd,
    escapeHtml(
      '広告列: 公式のニコニ広告ランキング（この放送の貢献度順）から広告主を並べるよ。数値ユーザーIDが取れた人は個人サムネ（無ければゆっくり画像）で、ID無しの匿名広告も広告主名で表示するよ。'
    )
  );
}

/** @param {string} faceKonta */
export function buildStoryUserLaneGuideKontaHtml(faceKonta) {
  return storyUserLaneGuideLine(
    faceKonta,
    escapeHtml(
      'こん太: 2番目の優先として、数値IDのアカウントで表示名か個人サムネのどちらかまで取れた人は、その次の段として並びやすいよ。ニコの匿名ID（a: 形式）はここには載せず、りんく条件を満たすときだけりんく、それ以外はたぬ姉側だよ。'
    )
  );
}

/** @param {string} faceTanu */
export function buildStoryUserLaneGuideTanuHtml(faceTanu) {
  return storyUserLaneGuideLine(
    faceTanu,
    escapeHtml(
      `たぬ姉: 匿名（a:）の応援、表示名やサムネが揃わない応援、ID 不明はぜんぶこの段に集めるよ。下の「${SUPPORT_VISUAL_DEV_MONITOR_SUMMARY_LABEL}」を開くと、どこの情報が欠けているか確認してね。`
    )
  );
}

/**
 * @param {number} displayCount レーンに並べた件数(cap 後)
 * @param {number} [totalCandidates] 素性が取れた候補の総数。displayCount より多ければ「ほか M人」を併記。
 *   2026-06-22(council/lane-show-all-active): popup レーンは limit 48 で打ち切るため、48 を超える配信で
 *   「素性が取れた人が他にもいるのに黙って切る」不誠実が起きていた(実機522人中48人しか出ず)。
 *   2026-07-14(会場独自受け皿の撤去): 会場は①と完全に同じ顔ぶれだけを表示するため
 *   「会場モードで全員見られます」の約束は撤回。何人いるかを正直に出すだけにする。
 */
export function buildStoryUserLaneGuideFootHtml(displayCount, totalCandidates) {
  const n = Math.max(0, Math.floor(Number(displayCount) || 0));
  const total = Math.max(0, Math.floor(Number(totalCandidates) || 0));
  const others = total > n ? total - n : 0;
  const text =
    others > 0
      ? `いま ${n} 件を表示中（ほか ${others}人・直近アクティブ順）`
      : `いま ${n} 件を表示中`;
  return `<p class="nl-story-userlane-guide__foot" aria-live="polite">${escapeHtml(text)}</p>`;
}

/**
 * レーン直下の「表示枠」と「記録コメント総数」をつなぐ（診断ブロックの total と同じ数を渡すこと）。
 * @param {number} laneDisplayedSlots 三段レーンに並べた合計枠数（dedupe+cap 後）
 * @param {number|undefined|null} recordedCommentRowsTotal 当放送の記録コメント行数。未指定・非有限・0 以下なら第2文なし。
 * @param {number} [totalCandidates] 素性が取れた候補の総数（cap 前）。表示枠より多ければ「ほか M人」を併記。
 * @returns {string}
 */
export function buildStoryUserLaneGuideFootAndRecordedHtml(
  laneDisplayedSlots,
  recordedCommentRowsTotal,
  totalCandidates
) {
  const foot = buildStoryUserLaneGuideFootHtml(laneDisplayedSlots, totalCandidates);
  if (
    recordedCommentRowsTotal == null ||
    !Number.isFinite(Number(recordedCommentRowsTotal))
  ) {
    return foot;
  }
  const total = Math.max(0, Math.floor(Number(recordedCommentRowsTotal)));
  if (total <= 0) {
    return foot;
  }
  return (
    foot +
    `<p class="nl-story-userlane-guide__recorded" aria-live="polite">` +
    `この放送で記録している応援コメントは <strong>${total}</strong> 件です。` +
    `上の件数はレーンに並べた人数の合計であり、コメント件数とは数え方が異なります。` +
    `</p>`
  );
}

/** @param {string} line1 @param {string} line2 */
function storyUserLaneEmptyNoteTwoLines(line1, line2) {
  return (
    `<p class="nl-story-userlane__empty-note-p">${escapeHtml(line1)}</p>` +
    `<p class="nl-story-userlane__empty-note-p">${escapeHtml(line2)}</p>`
  );
}

/** りんく段・件数 0 のとき（案内文の条件は buildStoryUserLaneGuideTopHtml に揃える） */
export function buildStoryUserLaneEmptyNoteLinkHtml() {
  return storyUserLaneEmptyNoteTwoLines(
    'この段は「数値ユーザーID＋個人サムネがそろった応援」だけが並ぶよ。いまの記録では該当者がいません。',
    '条件を満たす応援が届くと自動で増えます。'
  );
}

/** ギフト投げ主段・件数 0 */
export function buildStoryUserLaneEmptyNoteGiftHtml() {
  return storyUserLaneEmptyNoteTwoLines(
    'この段は「ギフトを投げた人」だけが並ぶよ。いまの記録では該当者がいません。',
    'ギフトが届くと、送り主の数値IDが取れた人から自動で増えます。'
  );
}

/**
 * ★v0.1.1280: 会場が fallback 経路(①パネルの鏡が無い/古すぎる)のときの gift 段。
 *
 *   会場の fallback は【席から】段を組むが、①の gift/ad 段は tier 判定を通さない
 *   後付け(popup-entry.js の buckets.gift = giftPicks)なので、席からは導出できない。
 *   = fallback は構造上ギフト段を作れない。
 *   それを「いまの記録では該当者がいません」と断定するのは【知らないことの断定】＝嘘。
 *   → 「分からない」と正直に言い、どうすれば見えるかを示す。
 */
export function buildVenueFallbackGiftEmptyNoteHtml() {
  return storyUserLaneEmptyNoteTwoLines(
    'ギフト段は①パネル（こん太のパネル）から受け取っています。いまは受け取れていないので、居るかどうか分かりません。',
    '①パネルを開いたままにすると、数十秒で反映されます。'
  );
}

/** こん太段・件数 0 */
export function buildStoryUserLaneEmptyNoteKontaHtml() {
  return storyUserLaneEmptyNoteTwoLines(
    'この段は「数値IDで、表示名か個人サムネのどちらかまで取れた応援」だけが並ぶよ。いまの記録では該当者がいません。',
    '条件を満たす応援が届くと自動で増えます。'
  );
}

/** たぬ姉段・件数 0 */
export function buildStoryUserLaneEmptyNoteTanuHtml() {
  return storyUserLaneEmptyNoteTwoLines(
    'この段は「匿名（a:）や表示名・サムネが揃わない応援、ID 不明」だけが並ぶよ。いまの記録では該当者がいません。',
    '条件を満たす応援が届くと自動で増えます。'
  );
}
