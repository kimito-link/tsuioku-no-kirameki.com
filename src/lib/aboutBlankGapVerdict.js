/**
 * ★about:blank の隙間(残り32ms)に対する【確定した判定】。
 *
 * ■ この関数が存在する理由(2026-08-19・会議で決着)
 *   サイドパネルの「一瞬の黒」を、2026-08-05 以降だけで **84版** 直そうとした
 *   (`git log --all --grep=黒` は92件)。そのうち色/幕/透明を触った版は
 *   **一度もユーザーの体感を変えなかった**。
 *
 *   2026-08-19 に主因(更新履歴1MB=バンドルの43%)を実測で特定して分割し、
 *   親スレッドの停止は **1,373ms → 106ms(92%減)** になった。
 *   ★残った32ms(1〜3フレーム)は【別物】＝iframe が initial about:blank の間に
 *   UA が敷くキャンバスで、**CSSWG が2024-02に「作者には制御できない」と決議**している
 *   (Chromium issue 40190899)。
 *
 * ■ ★なぜ「判定」をコードにするのか(文書にしないのか)
 *   同じ結論は既に `docs/handoff/HANDOFF-2026-08-17-sidepanel-black-NEXT.md` に
 *   「直せない。追わない」と書かれていた。**それでも版は積まれ続けた**。
 *   知識を文書化しても誤読は止まらない。止まるのは判定を共有したときだけ
 *   ([[shared-knowledge-is-not-shared-judgment-2026-08-10]])。
 *
 *   ★そして「サボると赤くなるか」だけが仕掛けの生死を決める
 *   ([[changelog-1mb-was-the-black-and-gates-decide-survival-2026-08-19]])。
 *   → この関数を `aboutBlankGapVerdict.test.js` が機械照合し、
 *     **85版目を試そうとした人の手が赤で止まる**。
 *
 * ■ ★この関数は「諦め」ではない(重要)
 *   `residualMs` が跳ね上がったときは **`investigate` を返す**。
 *   32ms は仕様由来だが、**300ms は仕様由来ではない**＝主因が再発した合図
 *   (更新履歴がまた膨らんだ等)。**黙って見逃す装置にはしない。**
 */

/** UA が about:blank にキャンバスを敷く隙間の実測上限(ms)。5回測定で平均32ms。 */
export const ABOUT_BLANK_GAP_TYPICAL_MS = 32;

/**
 * ここを超えたら「仕様由来の隙間」では説明がつかない＝主因の再発を疑う。
 * ★96ms = 実測32msの3倍。1〜3フレームが9フレームに増えたら別の原因がある。
 */
export const ABOUT_BLANK_GAP_REGRESSION_MS = 96;

/**
 * ★色/幕/透明で直そうとする手口の一覧(84版ぶんの空振り記録)。
 * これらは「about:blank にキャンバスを敷くのはUA」である以上、原理的に効かない。
 */
export const EXHAUSTED_APPROACHES = Object.freeze([
  'declare-color',   // color-scheme / background を宣言する (v1289/1294/1316/1369…)
  'curtain',         // 幕(cloak)・シェードで隠す (v1279〜1299・v1381〜1423)
  'transparent',     // iframe を透明にする ★実測で【真っ黒】になった (v1279〜1283)
  'hide-and-restore' // JSで隠して後で戻す ★止まる場所では戻せない (v1436→1437)
]);

/**
 * @typedef {object} AboutBlankGapInput
 * @property {number} residualMs 中身が読めるまでの実測(ms)。
 * @property {string} [approach] これから試そうとしている手口。
 */

/**
 * @typedef {object} AboutBlankGapVerdict
 * @property {'accept'|'reject'|'investigate'|'unknown'} action
 *   accept=仕様として受け入れる / reject=その手口は空振り確定 /
 *   investigate=仕様では説明できない＝主因の再発を疑う / unknown=判定不能。
 * @property {string} reason 人が読む理由(1行)。
 * @property {boolean} specDefined 仕様(UA)由来として説明がつく範囲か。
 */

/**
 * about:blank の隙間をどう扱うかを【構造で】返す純関数。
 *
 * ★判定不能は判定不能と返す(推測で断定しない)。
 *
 * @param {AboutBlankGapInput} input
 * @returns {AboutBlankGapVerdict}
 */
export function judgeAboutBlankGap(input) {
  /*
   * ★`Number(null)` は 0、`Number('')` も 0 になる＝**測っていないのに「0ms」として
   *   accept を返してしまう**。これは「観測ゼロなら出さない」と同じ型の事故
   *   ([[unobserved-must-not-hide-the-cell-2026-08-15]])。
   *   実測で数値が入ったときだけ通す(テストが実際にこの穴で赤くなった)。
   */
  const raw = input?.residualMs;
  const residualMs = typeof raw === 'number' ? raw : Number.NaN;

  if (!Number.isFinite(residualMs) || residualMs < 0) {
    return {
      action: 'unknown',
      reason: '実測値が無い。測ってから判断する(推測で直さない)。',
      specDefined: false
    };
  }

  // ★仕様では説明がつかない大きさ＝主因の再発。ここは【追う】。
  if (residualMs > ABOUT_BLANK_GAP_REGRESSION_MS) {
    return {
      action: 'investigate',
      reason:
        `${Math.round(residualMs)}ms は仕様由来の隙間(実測${ABOUT_BLANK_GAP_TYPICAL_MS}ms)では説明がつかない。` +
        'バンドルが再び膨らんだ等の主因を疑う(changelogBundleBudget.test.js を先に見る)。',
      specDefined: false
    };
  }

  const approach = typeof input?.approach === 'string' ? input.approach : '';

  // ★84版ぶん空振りした手口は、仕様上効かないので着手前に止める。
  if (approach && EXHAUSTED_APPROACHES.includes(approach)) {
    return {
      action: 'reject',
      reason:
        `「${approach}」は2026-08-05以降84版で空振り済み。` +
        'about:blank にキャンバスを敷くのはUAであり、作者側のCSS/JSでは届かない(CSSWG 2024-02決議)。',
      specDefined: true
    };
  }

  return {
    action: 'accept',
    reason:
      `${Math.round(residualMs)}ms(1〜3フレーム)は about:blank の仕様由来。` +
      '知覚的現在(約100ms)より短く、構造(iframe廃止)以外に手が無いため受け入れる。',
    specDefined: true
  };
}
