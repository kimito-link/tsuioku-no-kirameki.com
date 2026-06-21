/**
 * 「盛り上がり(熱量)」を判定する純関数(v0.1.871)。
 *
 * 背景(ユーザー構想 2026-06-21「リアルタイムで盛り上がってる感・Chrome 体験・将来 Web/iOS/Android」):
 *   コメントの勢い(分速)から配信の盛り上がりを段階+スコアにする。拡張APIに一切依存しない純関数=
 *   将来そのまま Web版/モバイルへ移植できる(集計と描画を拡張から切り離す方針の中核)。
 *
 * 設計(self-verifying):
 *   - 入力は数値のみ(commentsPerMinute・直近の増分など)。新規取得・副作用ゼロ。
 *   - 段階は分速の素直な閾値で機械的に決める(推測の盛り上がりを盛らない)。閾値は実配信の体感(数十/分で
 *     賑わい・100+/分で激盛り)に合わせた素直な値。後で実データで調整可能。
 *
 * @typedef {'idle'|'warm'|'hot'|'blazing'} HeatStage
 * @typedef {{
 *   stage: HeatStage,
 *   score: number,        // 0..100(バー幅 %)
 *   label: string,        // 表示ラベル(絵文字付き)
 *   commentsPerMinute: number
 * }} HeatLevel
 */

/** @param {unknown} v @returns {number} */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 分速の閾値(/分)。idle<8 / warm<30 / hot<100 / blazing>=100。 */
const T_WARM = 8;
const T_HOT = 30;
const T_BLAZE = 100;

/**
 * 分速コメントから盛り上がり段階+スコア(バー幅%)を出す純関数。
 * @param {number} commentsPerMinute 分速コメント数
 * @returns {HeatLevel}
 */
export function computeHeatLevel(commentsPerMinute) {
  const cpm = num(commentsPerMinute);
  /** @type {HeatStage} */
  let stage;
  let label;
  if (cpm < T_WARM) {
    stage = 'idle';
    label = '🌙 おだやか';
  } else if (cpm < T_HOT) {
    stage = 'warm';
    label = '🔆 あたたまってきた';
  } else if (cpm < T_BLAZE) {
    stage = 'hot';
    label = '🔥 盛り上がってる';
  } else {
    stage = 'blazing';
    label = '🔥🔥 激盛り上がり';
  }
  // スコア(バー幅%)=分速を 0..100 に対数寄りでマップ(序盤の伸びを見せ、上限で頭打ち)。
  //   200/分 で 100% に到達する素直なカーブ(min(100, cpm/2))。
  const score = Math.max(0, Math.min(100, Math.round(cpm / 2)));
  return { stage, score, label, commentsPerMinute: cpm };
}
