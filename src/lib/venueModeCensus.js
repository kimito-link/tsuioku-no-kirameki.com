/**
 * venueModeCensus.js — 会場モード専用の計器(純関数)。
 *
 * ★なぜ要るか(2026-08-14 ユーザー要望「会場モード専用の計器も」)
 *
 * ■ 会場は【鏡ごしにしか見えない】のが特殊
 *   会場(venue.html)は①POPが publish した鏡(laneMirror)を描く。
 *   だから会場の症状は「会場のコード」ではなく**鏡の鮮度**で決まることが多い。
 *   実機(2026-08-14)で実際に起きていたのがこれ:
 *       会場一致 ⚪鏡stale(656s) link7 gift0 ad4 konta0 tanu332
 *   ＝656秒前の鏡を描き続けていた。ユーザーがギフトを投げても会場に出ないのは当然だった
 *     ([[venue-has-no-gift-tier-builder-2026-08-14]])。
 *   ★ところが速報は `⚪`(灰色)で出していた=**異常に見えない**。
 *
 * ■ 二段窓(会場だけの仕組み・知らないと誤読する)
 *   SOFT(180秒)以内 = 鏡を使う / SOFT超〜HARD(15分) = **stale でも使い続ける**
 *   / HARD超 = fallback へ降格。
 *   ＝**中間帯は「古い鏡で描き続ける」のが仕様**。ちらつき防止のためだが、
 *     ユーザーには「更新されない」と映る。だから**残り時間を出す**。
 *
 * ■ この計器が出すもの(症状の言葉で)
 *   ① 鏡は新しいか(古いなら、あと何分で降格するか)
 *   ② 段ごとに誰が居るか(gift0 のような欠けを名指し)
 *   ③ 会場が開いているか(開いていないなら判定しない=直せない赤を作らない)
 *
 * @module venueModeCensus
 */

/** 鏡の SOFT 窓[ms](これ以内なら新鮮)。venueLaneParity.js と同値を保つこと。 */
export const MIRROR_SOFT_MS = 180_000;
/** 鏡の HARD 窓[ms](超えたら fallback へ降格)。 */
export const MIRROR_HARD_MS = 15 * 60 * 1000;

/** @param {unknown} v @returns {number} */
function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/**
 * @typedef {{
 *   open: boolean,
 *   mirrorAgeMs: number,
 *   mirrorState: 'fresh'|'stale'|'staleHard'|'absent',
 *   tiers: Record<string, number>,
 *   emptyTiers: string[],
 *   level: 'ok'|'warn'|'bad'|'na',
 *   line: string
 * }} VenueModeCensus
 */

/**
 * @param {object} input
 * @param {boolean} [input.venueOpen] 会場モードが開いているか
 * @param {number} [input.mirrorAgeMs] 鏡の古さ[ms]
 * @param {{link?:number,gift?:number,ad?:number,konta?:number,tanu?:number}} [input.tiers] 段ごとの人数
 * @param {boolean} [input.hasGiftData] この配信でギフトが実際に来ているか
 * @returns {VenueModeCensus}
 */
export function buildVenueModeCensus(input) {
  const open = input?.venueOpen === true;
  const ageMs = n(input?.mirrorAgeMs);
  const t = input?.tiers && typeof input.tiers === 'object' ? input.tiers : {};
  const tiers = {
    link: n(t.link), gift: n(t.gift), ad: n(t.ad), konta: n(t.konta), tanu: n(t.tanu)
  };
  const total = tiers.link + tiers.gift + tiers.ad + tiers.konta + tiers.tanu;

  if (!open) {
    return {
      open: false, mirrorAgeMs: ageMs, mirrorState: 'absent', tiers, emptyTiers: [],
      level: 'na',
      line: '会場モード ⚪ 開いていません(動画右下の桜色ボタンで開くと判定します)'
    };
  }

  /** @type {'fresh'|'stale'|'staleHard'|'absent'} */
  let mirrorState = 'fresh';
  if (ageMs > MIRROR_HARD_MS) mirrorState = 'staleHard';
  else if (ageMs > MIRROR_SOFT_MS) mirrorState = 'stale';

  const lines = [];
  let level = /** @type {'ok'|'warn'|'bad'} */ ('ok');

  if (mirrorState === 'stale') {
    // ★仕様(中間帯は古い鏡で描き続ける)を明記し、降格までの残りを出す。
    const leftMin = Math.max(0, Math.round((MIRROR_HARD_MS - ageMs) / 60000));
    level = 'warn';
    lines.push(
      `会場モード 🟡 ${Math.round(ageMs / 1000)}秒前の情報を表示中です`,
      '  → 会場は①ポップアップが書いた情報を映しています。その情報が更新されていません',
      `  → この状態はあと約${leftMin}分続き、その後は自動で最新側に切り替わります`,
      '  → すぐ直すには: ポップアップ(応援レーン)を一度開き直してください'
    );
  } else if (mirrorState === 'staleHard') {
    level = 'bad';
    lines.push(
      `会場モード 🔴 情報が${Math.round(ageMs / 60000)}分前から更新されていません`,
      '  → ポップアップ(応援レーン)を開き直してください'
    );
  } else {
    lines.push(`会場モード ✅ 最新の情報です(${Math.round(ageMs / 1000)}秒前)`);
  }

  lines.push(
    `  → 段別: りんく${tiers.link} / ギフト${tiers.gift} / 広告${tiers.ad} / こん太${tiers.konta} / たぬ姉${tiers.tanu}(計${total})`
  );

  /*
   * ★ギフト段が空なのに、この配信でギフトが来ている場合だけ名指しする。
   *   ギフトが1件も無い配信で「ギフト段が空」と言うのはノイズ(仕様どおり)。
   */
  const emptyTiers = [];
  if (tiers.gift === 0 && input?.hasGiftData === true) {
    emptyTiers.push('gift');
    if (level === 'ok') level = 'warn';
    lines.push(
      '  → ★ギフトは届いているのに、会場のギフト段が空です(会場にだけ出ない=既知の不具合)'
    );
  }

  return { open: true, mirrorAgeMs: ageMs, mirrorState, tiers, emptyTiers, level, line: lines.join('\n') };
}
