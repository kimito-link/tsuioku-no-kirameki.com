/**
 * ニコニコ／ボカロ MV 風 — 文字が飛び交う演出の文言生成（純関数）。
 */

/** @typedef {'scroll'|'burst'} CelebrationFlyTextMotion */

/**
 * @typedef {Object} CelebrationFlyTextLine
 * @property {string} text
 * @property {CelebrationFlyTextMotion} motion
 * @property {string} [color]
 * @property {number} [sizePx]
 * @property {number} [lanePct] 0–100（scroll 用）
 */

/** @type {readonly string[]} */
export const NICO_FLY_COLORS = Object.freeze([
  '#ffffff',
  '#fff56a',
  '#6ee8ff',
  '#ff8ec8',
  '#b8ff8a',
  '#ffb84d',
  '#c8a0ff'
]);

/** @type {readonly string[]} */
export const NICO_FLY_PHRASES = Object.freeze([
  '888888888',
  '88888',
  '尊い',
  '草',
  'ｗｗｗ',
  'ナイス！',
  '来たー！',
  'てぇてぇ',
  '応援してる',
  'いいニコ生',
  'ヾ(＾∇＾)',
  '(*´∀`)',
  'うp主神',
  '神回'
]);

/**
 * @param {number} durationMs
 * @returns {number}
 */
export function flyTextCountForDuration(durationMs) {
  const ms = Number(durationMs) || 3000;
  if (ms >= 6000) return 28;
  if (ms >= 4800) return 22;
  if (ms >= 3600) return 16;
  if (ms >= 2400) return 12;
  return 8;
}

/**
 * @param {number} index
 * @returns {string}
 */
export function nicoFlyColorAt(index) {
  return NICO_FLY_COLORS[Math.abs(index) % NICO_FLY_COLORS.length];
}

/**
 * @param {number} index
 * @returns {string}
 */
export function nicoFlyPhraseAt(index) {
  return NICO_FLY_PHRASES[Math.abs(index) % NICO_FLY_PHRASES.length];
}

/**
 * @param {import('./supportCelebration.js').SupportCelebrationSpec} spec
 * @returns {CelebrationFlyTextLine[]}
 */
export function flyTextLinesForSupportCelebration(spec) {
  if (!spec) return [];
  const count = flyTextCountForDuration(spec.durationMs);
  /** @type {CelebrationFlyTextLine[]} */
  const lines = [];

  if (spec.kind === 'ad_points_milestone') {
    const pt = Number(String(spec.dedupeKey || '').replace('ad_pts_', '')) || 0;
    if (pt === 1) {
      lines.push({ text: '初ニコニ広告！', motion: 'burst', color: '#fff56a', sizePx: 34 });
    } else {
      lines.push(
        { text: `${pt.toLocaleString('ja-JP')}pt`, motion: 'burst', color: '#fff56a', sizePx: 44 },
        { text: '達成！', motion: 'burst', color: '#6ee8ff', sizePx: 36 },
        { text: 'ニコニ広告', motion: 'scroll', color: '#ffb84d', sizePx: 28, lanePct: 24 }
      );
    }
  } else if (
    spec.kind === 'ad_points_increase' ||
    spec.kind === 'ad_throw' ||
    spec.kind === 'ad_advertiser_milestone'
  ) {
    lines.push({ text: spec.message, motion: 'burst', color: '#fff56a', sizePx: 28 });
  } else {
    lines.push({
      text: spec.message,
      motion: 'burst',
      color: '#fff56a',
      sizePx: 34
    });
  }

  if (spec.kind === 'comment_milestone') {
    const m = spec.dedupeKey.replace('comment_', '');
    lines.push(
      { text: `${m}！`, motion: 'burst', color: '#6ee8ff', sizePx: 42 },
      { text: 'コメント爆発', motion: 'scroll', color: '#ff8ec8', sizePx: 26 },
      { text: '888888888', motion: 'scroll', color: '#ffffff', sizePx: 30 }
    );
  } else if (spec.kind === 'gift_milestone') {
    lines.push(
      { text: 'ギフト来た！', motion: 'burst', color: '#ffb84d', sizePx: 30 },
      { text: '888888888', motion: 'scroll', color: '#fff56a', sizePx: 28 }
    );
  } else if (spec.kind === 'event_rank_up') {
    lines.push(
      { text: '順位UP！', motion: 'burst', color: '#c8a0ff', sizePx: 36 },
      { text: '神', motion: 'scroll', color: '#6ee8ff', sizePx: 38 }
    );
  } else if (
    spec.kind === 'ad_points_increase' ||
    spec.kind === 'ad_throw'
  ) {
    lines.push(
      { text: '広告来た！', motion: 'burst', color: '#ffb84d', sizePx: 28 },
      { text: '888888888', motion: 'scroll', color: '#fff56a', sizePx: 26 }
    );
  } else if (spec.kind === 'ad_advertiser_milestone') {
    lines.push(
      { text: '広告主登場！', motion: 'burst', color: '#ffb84d', sizePx: 28 },
      { text: '888888888', motion: 'scroll', color: '#fff56a', sizePx: 26 }
    );
  } else if (spec.kind === 'ad_points_milestone') {
    lines.push(
      { text: '888888888', motion: 'scroll', color: '#fff56a', sizePx: 30 },
      { text: '尊い', motion: 'scroll', color: '#ff8ec8', sizePx: 26, lanePct: 42 }
    );
  } else if (
    spec.kind === 'broadcaster_follower_milestone' ||
    spec.kind === 'broadcaster_follower_increase'
  ) {
    lines.push(
      { text: 'フォロー来た！', motion: 'burst', color: '#ffb84d', sizePx: 28 },
      { text: '888888888', motion: 'scroll', color: '#fff56a', sizePx: 26 }
    );
  }

  for (let i = lines.length; i < count; i++) {
    const scroll = i % 3 !== 1;
    lines.push({
      text: nicoFlyPhraseAt(i),
      motion: scroll ? 'scroll' : 'burst',
      color: nicoFlyColorAt(i),
      sizePx: scroll ? 18 + (i % 5) * 4 : 24 + (i % 4) * 6,
      lanePct: 8 + ((i * 17) % 78)
    });
  }

  return lines.slice(0, count);
}

/**
 * @param {import('./giftBahamutCelebration.js').GiftBahamutSpec} spec
 * @returns {CelebrationFlyTextLine[]}
 */
export function flyTextLinesForGiftBahamut(spec) {
  if (!spec) return [];
  const count = flyTextCountForDuration(spec.durationMs);
  /** @type {CelebrationFlyTextLine[]} */
  const lines = [
    { text: spec.message, motion: 'burst', color: '#fff56a', sizePx: 30 },
    { text: `${spec.point.toLocaleString('ja-JP')}pt`, motion: 'burst', color: '#6ee8ff', sizePx: 38 },
    { text: spec.item, motion: 'scroll', color: '#ff8ec8', sizePx: 26 },
    { text: `${spec.sender}さん`, motion: 'scroll', color: '#ffffff', sizePx: 24 },
    { text: '888888888', motion: 'scroll', color: '#fff56a', sizePx: 32 },
    { text: 'ありがとう！', motion: 'burst', color: '#b8ff8a', sizePx: 28 },
    { text: 'ギフト！', motion: 'burst', color: '#ffb84d', sizePx: 34 }
  ];

  if (spec.tier === 'mega' || spec.tier === 'large') {
    lines.push(
      { text: '神ギフト', motion: 'burst', color: '#c8a0ff', sizePx: 40 },
      { text: '尊い', motion: 'scroll', color: '#ff8ec8', sizePx: 36 }
    );
  }

  for (let i = lines.length; i < count; i++) {
    lines.push({
      text: nicoFlyPhraseAt(i + 3),
      motion: i % 2 === 0 ? 'scroll' : 'burst',
      color: nicoFlyColorAt(i),
      sizePx: 20 + (i % 6) * 4,
      lanePct: 10 + ((i * 13) % 75)
    });
  }

  return lines.slice(0, count);
}
