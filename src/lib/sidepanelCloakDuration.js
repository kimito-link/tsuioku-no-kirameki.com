/**
 * sidepanelCloakDuration.js — 幕(cloak)が「いつ外れたか / まだ残っているか」を要約する純関数。
 *
 * ★なぜ要るか(2026-08-10 実機で確定):
 *   ユーザー実機のスクリーンショットは【配信5時間45分経過】の時点で真っ黒だった。
 *   つまり黒は「起動直後の一瞬」ではなく【居座っている】。
 *   ところが計器の観測窓は SAMPLE_AT_MS の最後=3500ms で打ち切られており、
 *   3.5秒より後に居座る黒を【構造的に観測できない】。そのため速報はいつも
 *   「★出た直後だけ黒い」としか言えず、5セッション追っても決着しなかった。
 *   ([[zero-count-may-mean-unmeasured]] と同じ型=観測窓が症状の姿を決めてしまっていた)
 *
 *   さらに cloak は popup.html の <html> に【静的に】書かれており、外すのは
 *   revealPopupPrimaryOnce()(JS)だけ。CSS のフェイルセーフ(1500ms 自動 reveal)は
 *   opacity しか戻さない。よって「1.5秒で解除されたのか、永久に残ったのか」の区別が
 *   次の一手を決めるのに、速報にはその情報が【1つも無かった】。
 *
 * 本モジュールは観測列(t, cloak)から次の3つだけを言う:
 *   - まだ残っているか(stillCloaked)
 *   - 外れたなら何ms時点か(clearedAtMs)
 *   - 1500ms の CSS フェイルセーフを越えて残っていたか(outlivedCssFailsafe)
 *
 * 掟: 数えるだけ・DOM を触らない・時刻は呼び出し側が渡す(テスト可能性)。
 *
 * @module sidepanelCloakDuration
 */

/** CSS フェイルセーフ(popup.html の nl-popup-primary-cloak-auto-reveal)の遅延。 */
export const CLOAK_CSS_FAILSAFE_MS = 1500;

/**
 * @typedef {{ t: number, cloak: string }} CloakSample
 */

/**
 * 観測列から幕の継続を要約する。
 *
 * @param {ReadonlyArray<CloakSample>|null|undefined} series 観測列(t=起動からのms・昇順でなくてよい)
 * @returns {{
 *   observed: number,
 *   everCloaked: boolean,
 *   stillCloaked: boolean,
 *   firstCloakedAtMs: number|null,
 *   clearedAtMs: number|null,
 *   lastObservedAtMs: number|null,
 *   outlivedCssFailsafe: boolean,
 *   line: string
 * }}
 */
export function summarizeCloakDuration(series) {
  const list = Array.isArray(series) ? series : [];
  /** @type {CloakSample[]} */
  const rows = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const t = Number(raw.t);
    if (!Number.isFinite(t) || t < 0) continue;
    rows.push({ t: Math.round(t), cloak: String(raw.cloak == null ? '' : raw.cloak) });
  }
  rows.sort((a, b) => a.t - b.t);

  const observed = rows.length;
  if (observed === 0) {
    return {
      observed: 0,
      everCloaked: false,
      stillCloaked: false,
      firstCloakedAtMs: null,
      clearedAtMs: null,
      lastObservedAtMs: null,
      outlivedCssFailsafe: false,
      line: '幕(cloak) ⚪ 未観測'
    };
  }

  const isOn = (/** @type {CloakSample} */ r) => r.cloak === '1';
  const firstCloaked = rows.find(isOn) || null;
  const everCloaked = firstCloaked != null;
  const last = rows[rows.length - 1];
  const stillCloaked = isOn(last);
  const lastObservedAtMs = last.t;

  /*
   * 「外れた時刻」= 幕が立っていた後、初めて外れて【以後ずっと外れている】最初の時点。
   *   途中で戻る(再び '1')なら、それは外れていないのと同じ扱い=最後の解除点を採る。
   */
  let clearedAtMs = null;
  if (everCloaked && !stillCloaked) {
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (isOn(rows[i])) {
        clearedAtMs = rows[i + 1] ? rows[i + 1].t : null;
        break;
      }
    }
  }

  // CSS フェイルセーフを越えて残っていたか(=CSS では救えていない証拠)。
  const outlivedCssFailsafe =
    everCloaked &&
    (stillCloaked
      ? lastObservedAtMs > CLOAK_CSS_FAILSAFE_MS
      : clearedAtMs != null && clearedAtMs > CLOAK_CSS_FAILSAFE_MS);

  let line;
  if (!everCloaked) {
    line = `幕(cloak) ✅ 一度も残っていない(観測${observed}点)`;
  } else if (stillCloaked) {
    line =
      `幕(cloak) 🔴 まだ残っている(最後の観測 t+${lastObservedAtMs}ms)` +
      (outlivedCssFailsafe
        ? ` ★CSSの自動解除(${CLOAK_CSS_FAILSAFE_MS}ms)を越えて残存=JSの解除が届いていない`
        : ' (まだCSS自動解除の前=この時点では異常と断定できない)');
  } else {
    line =
      `幕(cloak) ✅ t+${clearedAtMs}ms で解除(観測${observed}点)` +
      (outlivedCssFailsafe ? ` ★CSS自動解除(${CLOAK_CSS_FAILSAFE_MS}ms)より後=JS解除が遅い` : '');
  }

  return {
    observed,
    everCloaked,
    stillCloaked,
    firstCloakedAtMs: firstCloaked ? firstCloaked.t : null,
    clearedAtMs,
    lastObservedAtMs,
    outlivedCssFailsafe,
    line
  };
}
