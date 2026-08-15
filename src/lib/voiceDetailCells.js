/**
 * voiceDetailCells.js — 読み上げの観測を【打ち手が変わる単位】に割る(純関数)。
 *
 * ★なぜ要るか
 *   `voiceDiag` は30以上のフィールドを持つが、既存の3セル
 *   (voice-timing / voice-coverage / voice-bubble-parity)が読むのは数個だけ。
 *   「読まれない」の原因は少なくとも4通りあり、**打ち手が全部違う**:
 *     合成が失敗した      → VOICEVOX側(理由別に分かれる)
 *     合成はnullで返った  → 読まれずに静かに消えた
 *     鮮度切れで捨てた    → 追いつくための間引き(正常なトレードオフ)
 *     件数上限で捨てた    → 上限設定の問題
 *   ＝ 1つの「読み上げ漏れ」セルに混ぜると原因が特定できない。
 *
 * ★掟1(防御は異常にしない)を厳守:
 *   mergeTotal(同文統合)・rateClampTotal(速度飽和)は
 *   **追いつくための正常な働き**。多くても異常にしない。
 *
 * ★掟5の左側: 読み上げを使っていない(OFF・一度も発話なし)なら
 *   セルを出さない。使っていない機能で画面を埋めない。
 *   ★既存 buildVoiceHealthCells と同じ判断基準を使う(食い違わせない)。
 *
 * @module voiceDetailCells
 */

/** @param {unknown} v @returns {number} */
function n0(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * @param {string} id @param {string} label
 * @param {'ok'|'warn'|'bad'|'na'} level @param {string} text
 * @returns {import('./healthCells.js').HealthCell}
 */
function cell(id, label, level, text) {
  return { id, label, kind: /** @type {'state'} */ ('state'), value: null, level, text };
}

/**
 * 読み上げの詳細セル。**使っていなければ空配列**(死にセルで埋めない)。
 *
 * @param {any} data buildHealthCells と同じ入力
 * @returns {Array<import('./healthCells.js').HealthCell>}
 */
export function buildVoiceDetailCells(data) {
  const snap = data?.voiceDiag;
  if (!snap || typeof snap !== 'object') return [];

  /*
   * ★既存 buildVoiceHealthCells(healthCells.js:176)と同じ判定:
   *   一度も ON にも発話にもなっていない=会場モード未使用=セルを足さない。
   *   ここを独自基準にすると、片方だけセルが出る/出ないでちぐはぐになる。
   */
  const enabled = !!snap.enabled;
  const spoken = n0(snap.spokenTotal);
  const queueMax = n0(snap.queueMax);
  if (!enabled && spoken === 0 && queueMax === 0) return [];

  /** @type {Array<import('./healthCells.js').HealthCell>} */
  const out = [];

  /* ── 合成が失敗した理由 ─────────────────────────────────
   * ★理由別の内訳を持っているのに画面に出ていなかった。
   *   「読まれない」の第一容疑者で、理由ごとに打ち手が違う。
   */
  const reasons = snap.synthFailReasons && typeof snap.synthFailReasons === 'object'
    ? snap.synthFailReasons : null;
  const failEntries = reasons
    ? Object.keys(reasons).map((k) => ({ k, n: n0(reasons[k]) })).filter((e) => e.n > 0)
    : [];
  const failTotal = failEntries.reduce((a, e) => a + e.n, 0);
  if (failTotal <= 0) {
    out.push(cell('voice-synth-fail', '声の合成の失敗', 'ok', '失敗なし'));
  } else {
    failEntries.sort((a, b) => b.n - a.n);
    const top = failEntries.slice(0, 2).map((e) => `${e.k}${e.n}件`).join(' / ');
    out.push(cell(
      'voice-synth-fail', '声の合成の失敗',
      failTotal >= 10 ? 'bad' : 'warn',
      `${failTotal}件(${top})`
    ));
  }

  /* ── 合成が空で返った(読まれずに消えた) ─────────────────
   * ★失敗ですらなく「nullが返った」ので、エラーにも出ない。
   *   静かに読まれないので、ユーザーは原因に辿り着けない。
   */
  const synthNull = n0(snap.synthNullTotal);
  const nearTimeout = n0(snap.synthNullNearTimeout);
  if (synthNull <= 0) {
    out.push(cell('voice-synth-null', '声が空で返った', 'ok', 'なし'));
  } else {
    out.push(cell(
      'voice-synth-null', '声が空で返った',
      synthNull >= 10 ? 'bad' : 'warn',
      nearTimeout > 0
        ? `${synthNull}件(うち${nearTimeout}件は時間切れ間際=VOICEVOXが重い)`
        : `${synthNull}件`
    ));
  }

  /* ── 追いつくための間引き(防御=異常にしない) ─────────────
   * ★[[discarded-pass-reason-makes-greens-unreadable]]:
   *   「なぜ静かなのか」を説明しないと、緑が正常か穴か区別できない。
   */
  const merge = n0(snap.mergeTotal);
  const clamp = n0(snap.rateClampTotal);
  const sustained = n0(snap.sustainedBoostTotal);
  const total = merge + clamp + sustained;
  out.push(cell(
    'voice-catchup', '追いつくための調整',
    'ok', // ★防御=多くても正常
    total > 0
      ? `同文まとめ${merge}件・速度上限${clamp}件・底上げ${sustained}件`
      : '調整なし(余裕があります)'
  ));

  /* ── 捨てた理由の内訳 ───────────────────────────────
   * ★voice-coverage は staleDropTotal だけを見る。
   *   実際には「件数ゲート」「先頭が古い」「掃除で古い」の3経路があり、
   *   件数ゲートだけが**設定で変えられる**=打ち手が違う。
   */
  const gate = n0(snap.dropCountGateTotal);
  const headStale = n0(snap.dropHeadStaleTotal);
  const sweepStale = n0(snap.dropSweepStaleTotal);
  const dropped = gate + headStale + sweepStale;
  if (dropped <= 0) {
    out.push(cell('voice-drop-reason', '読み飛ばしの理由', 'ok', '読み飛ばしなし'));
  } else {
    /*
     * ★件数ゲートが主因なら上限を上げれば読める(打ち手がある)。
     *   鮮度切れが主因なら合成が追いついていない(別の打ち手)。
     */
    const gateDominant = gate >= headStale + sweepStale;
    out.push(cell(
      'voice-drop-reason', '読み飛ばしの理由',
      'warn',
      gateDominant
        ? `件数上限${gate}件が主因(設定で上限を上げると読めます)`
        : `鮮度切れ${headStale + sweepStale}件が主因(合成が追いついていません)`
    ));
  }

  /* ── いま待っている件数 ─────────────────────────────── */
  const queueNow = n0(snap.queueNow);
  const effectiveMax = n0(snap.effectiveQueueMax) || queueMax;
  if (effectiveMax <= 0) {
    out.push(cell('voice-queue', '読み上げの待ち', 'na', '—'));
  } else {
    const pct = Math.round((queueNow / effectiveMax) * 100);
    out.push(cell(
      'voice-queue', '読み上げの待ち',
      pct >= 90 ? 'warn' : 'ok',
      `${queueNow}/${effectiveMax}件${pct >= 90 ? '(いっぱいです)' : ''}`
    ));
  }

  /* ── 再生の打ち切り(watchdog) ───────────────────────── */
  const pbTimeout = n0(snap.playbackTimeoutTotal);
  out.push(cell(
    'voice-playback-timeout', '再生の打ち切り',
    pbTimeout >= 5 ? 'warn' : 'ok',
    pbTimeout > 0 ? `${pbTimeout}回(安全網で復帰しました)` : 'なし'
  ));

  return out;
}
