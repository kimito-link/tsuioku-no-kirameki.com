/**
 * bandScale.js — 「大きく見せる枠(PICK UP 帯)」の倍率(純関数)。
 *
 * ★なぜ要るか(2026-08-14 ユーザー要望)
 *   「どの画面サイズでみても めっちゃおおきいほうがいいとおもう
 *     会場モードも通常POPモードも」
 *   「みんな画面に顔をちかづけてみないとみれないらしい」
 *   「特にスマホしか対応していない配信など、わざわざ顔を近づけるという手間があってつらい」
 *
 * ■ 実測(2026-08-14 時点の出荷物)
 *     popup.html   : font-size 指定 161 箇所中 158 が 14px 未満(最小 7px)
 *     comeview.html:  32 箇所中 20 が 14px 未満
 *     venueBar.js  : 11px/10px が中心
 *   ＝**92% が 14px 未満**。読みやすさの下限(概ね 14〜16px)を大きく下回っていた。
 *
 * ★方針は会議(design 系4体・2026-08-14)で確定:
 *   ユーザーの「**ぜんたいじゃなくて** BSPみたいに大きくする枠をつければいい」に従い、
 *   **全体 zoom は却下**。全部大きくすると情報量が減り、この拡張の価値
 *   (たくさん見える)を壊すため。**帯だけ**を大きくする。
 *
 *   ★会議の批判役「文字だけ上げると overflow で切れる」は正しい
 *     → **高さと文字を同じ倍率**で上げる(CSS 変数 --nl-band-scale を1つ動かす)。
 *   ★同批判役の「translateY で位置決め」は**実コードで否定**(translateX=横流れ)。
 *     縦に伸ばしてもアニメーションは壊れない。会議の指摘も裏取りしてから採る。
 *
 * ■ なぜ font-size を1つずつ直さないか
 *   161 箇所を個別に上げると、段の高さ・タイル幅・grid の列数が総崩れになる
 *   (レーンは perRow/段数/幅で見た目が決まる=ちらつき対策の diff-skip にも波及する)。
 *   ★**倍率で丸ごと拡大する**なら、文字と余白と枠が同じ比で大きくなるので
 *     レイアウト崩れが原理的に起きない。既存の CSS を1行も書き換えずに済む。
 *
 * ■ 方式: CSS の `zoom`
 *   - Chrome では `zoom` がレイアウトごと拡大する(transform と違い場所を食う=正しい)
 *   - 拡張のページは Chrome 限定なので互換性の問題が無い
 *   - ★`transform: scale()` は**見た目だけ**拡大して当たり判定とスクロール量がズレる
 *     ([[content-visibility-kills-hit-testing-2026-08-08]] と同種の事故を作る)ので使わない
 *
 * @module uiScale
 */

/** storage キー(全画面で共有=①POPで変えたら会場にも効く)。 */
export const KEY_BAND_SCALE = 'nls_band_scale_v1';

/**
 * 既定倍率。★1.0 ではなく **1.25** にする。
 *   ユーザーは「設定を探して上げたい」のではなく「最初から大きく見たい」。
 *   既定を等倍にすると、設定に気づかない人には何も変わらない
 *   ([[symptom-owner-must-be-told-2026-08-12]]: 当人に届かない改善は無いのと同じ)。
 */
export const DEFAULT_BAND_SCALE = 1.6;

/** 選べる倍率(段階式。自由入力にしない=壊れた値を作らせない)。 */
export const BAND_SCALE_STEPS = Object.freeze([1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.4]);

/** 下限・上限(storage が壊れていても画面を壊さない)。 */
export const MIN_BAND_SCALE = 1.0;
export const MAX_BAND_SCALE = 2.4;

/**
 * 保存値 → 実際に使う倍率。壊れた値・範囲外は既定へ倒す(fail-safe)。
 *
 * ★1.0 未満は許さない。「小さくしたい」需要より
 *   「小さすぎて読めない」実害の方が圧倒的に大きい(ユーザー実機の訴え)。
 *
 * @param {unknown} raw storage から読んだ値
 * @returns {number} MIN〜MAX に収まる倍率
 */
export function normalizeBandScale(raw) {
  /*
   * ★null/undefined は「未設定」= 既定へ。
   *   `Number(null) === 0` なので素通しすると 0 → MIN(1.0) に丸められ、
   *   **未設定の人が等倍のまま**になる(＝この機能が誰にも効かない)。
   *   同じ罠を同日 symptomVerdicts でも踏んだので明示的に弾く。
   */
  if (raw == null || raw === '') return DEFAULT_BAND_SCALE;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_BAND_SCALE;
  if (n < MIN_BAND_SCALE) return MIN_BAND_SCALE;
  if (n > MAX_BAND_SCALE) return MAX_BAND_SCALE;
  // 段階に丸める(中途半端な値で保存されても最寄りの段へ)。
  let best = BAND_SCALE_STEPS[0];
  let bestDiff = Infinity;
  for (const s of BAND_SCALE_STEPS) {
    const d = Math.abs(s - n);
    if (d < bestDiff) { bestDiff = d; best = s; }
  }
  return best;
}

/**
 * 次の段階へ(＋/− ボタン用)。端では止まる。
 * @param {number} current
 * @param {1|-1} dir
 * @returns {number}
 */
export function stepBandScale(current, dir) {
  const cur = normalizeBandScale(current);
  const i = BAND_SCALE_STEPS.indexOf(cur);
  const next = i < 0 ? DEFAULT_BAND_SCALE : BAND_SCALE_STEPS[Math.min(BAND_SCALE_STEPS.length - 1, Math.max(0, i + (dir === -1 ? -1 : 1)))];
  return next;
}

/**
 * 画面に適用する。★CSS 変数を1つ書くだけ(zoom は使わない)。
 *
 * ★全体に zoom / transform:scale を掛けない理由:
 *   - zoom: 情報量が減る(ユーザーが明確に却下)
 *   - transform: 当たり判定とスクロール量がズレる
 *   ここでは **帯の高さと文字だけ** が変数経由で連動する。
 *
 * @param {{ documentElement?: any }|null|undefined} doc
 * @param {unknown} rawScale
 * @returns {number} 実際に適用した倍率
 */
export function applyBandScale(doc, rawScale) {
  const scale = normalizeBandScale(rawScale);
  try {
    const el = doc && doc.documentElement;
    if (el && el.style && typeof el.style.setProperty === 'function') {
      el.style.setProperty('--nl-band-scale', String(scale));
    }
  } catch {
    /* 適用に失敗しても画面は出す */
  }
  return scale;
}

/**
 * 表示用のラベル(「125%」)。
 * @param {unknown} rawScale
 * @returns {string}
 */
export function formatBandScale(rawScale) {
  return `${Math.round(normalizeBandScale(rawScale) * 100)}%`;
}
