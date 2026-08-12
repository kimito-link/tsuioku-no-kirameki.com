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

/**
 * CSS フェイルセーフ(popup.html の nl-popup-primary-cloak-auto-reveal)の遅延。
 * ★v0.1.1352: 1500 → 400。実機で「JS解除1507ms / CSS保険1500ms」= 0〜1500ms のあいだ
 *   誰も中身を見せておらず、パネルを開いた瞬間が真っ黒だったため。
 *   ★popup.html の animation-delay と**必ず同じ値**にすること(片方だけ変えると
 *   計器が嘘をつく)。下の contract テストが両者の一致を機械で断言する。
 */
export const CLOAK_CSS_FAILSAFE_MS = 400;

/**
 * 幕の fade にかかる時間(popup.html の animation-duration)。
 * ★「解除が始まった時刻」と「中身が完全に見える時刻」は別物。
 *   ユーザーが黒を見る長さは failsafe + duration で決まる。
 */
export const CLOAK_CSS_FADE_MS = 260;

/**
 * 人が「黒い画面」として認識する目安(ms)。これ未満は瞬きに紛れて気づかない。
 * ★出典は本リポの実績: [[sidepanel-white-flash-is-unfixable-2026-08-10]] で
 *   白0.2秒は「見えるが直せない」と結論した=0.2秒は見える長さ、という基準に揃える。
 */
export const HUMAN_PERCEPTIBLE_MS = 200;

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
 *   visibleBlackMs: number,
 *   humanVisible: boolean,
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
      // 未観測=黒を見ていない。0 と false で「測っていない」を素直に表す。
      visibleBlackMs: 0,
      humanVisible: false,
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

  /*
   * ★v0.1.1352: 「ユーザーが黒を見ていた長さ」を計器が自分で言う。
   *
   * ■ なぜ要るか(2026-08-12 ユーザー指摘「全部質問しなくても分かるようにならないと困る」)
   *   従来の行は「t+1507ms で解除」としか言わず、CSS保険(1500ms)と突き合わせて
   *   初めて「0〜1500ms は誰も見せていない=そこが黒」と分かる形だった。
   *   ★読み手に引き算をさせる計器は、原因を名指ししていないのと同じ。
   *   人が黒として認識する目安(200ms)を超えたかどうかまで、この行で断定する。
   */
  const visibleBlackMs = everCloaked
    ? stillCloaked
      ? lastObservedAtMs
      : Math.min(clearedAtMs ?? 0, CLOAK_CSS_FAILSAFE_MS + CLOAK_CSS_FADE_MS)
    : 0;
  const humanVisible = visibleBlackMs >= HUMAN_PERCEPTIBLE_MS;
  const blackNote = everCloaked
    ? ` / ★この間パネルは黒く見えていた=${visibleBlackMs}ms${
        humanVisible ? '(人が気づく長さ)' : '(一瞬=気づかない)'
      }`
    : '';

  let line;
  if (!everCloaked) {
    line = `幕(cloak) ✅ 一度も残っていない(観測${observed}点)`;
  } else if (stillCloaked) {
    line =
      `幕(cloak) 🔴 まだ残っている(最後の観測 t+${lastObservedAtMs}ms)` +
      (outlivedCssFailsafe
        ? ` ★CSSの自動解除(${CLOAK_CSS_FAILSAFE_MS}ms)を越えて残存=JSの解除が届いていない`
        : ' (まだCSS自動解除の前=この時点では異常と断定できない)') +
      blackNote;
  } else {
    line =
      `幕(cloak) ✅ t+${clearedAtMs}ms で解除(観測${observed}点)` +
      (outlivedCssFailsafe ? ` ★CSS自動解除(${CLOAK_CSS_FAILSAFE_MS}ms)より後=JS解除が遅い` : '') +
      blackNote;
  }

  return {
    observed,
    everCloaked,
    stillCloaked,
    firstCloakedAtMs: firstCloaked ? firstCloaked.t : null,
    clearedAtMs,
    lastObservedAtMs,
    outlivedCssFailsafe,
    // ★v0.1.1352: ユーザーが実際に黒を見ていた長さ(ms)と、それが人に見える長さか。
    visibleBlackMs,
    humanVisible,
    line
  };
}
