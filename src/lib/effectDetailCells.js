/**
 * effectDetailCells.js — 演出・効果音・コメント送信の観測を割る(純関数)。
 *
 * ★なぜ要るか
 *   `giftEffectDiag` は27フィールド持つが、既存 `gift-effect` セルは
 *   検知/投下/発音の3つしか読まない。到着演出(arrival*)は**丸ごと計器が無い**。
 *   `commentPostDiag` も echo/楽観描画の遅延を持っているのにセルが無い
 *   ＝「送ってから画面に出るまで」という体感直結の数字が見えない。
 *
 * ■ 掟(1〜6)は buriedInstrumentCells / silentFailureCells と同じ。
 *   ★特に掟1(防御は異常にしない): coalesced/guarded/capGuarded は
 *     「効いた回数」なので多くても正常。ここでは **異常にしない**。
 *
 * @module effectDetailCells
 */

/** @param {unknown} v @returns {number} */
function n0(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** @param {unknown} v @returns {number|null} ms として意味のある値のみ */
function msOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
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
 * 演出・送信の詳細セル。
 * @param {any} data buildHealthCells と同じ入力
 * @returns {Array<import('./healthCells.js').HealthCell>}
 */
export function buildEffectDetailCells(data) {
  /** @type {Array<import('./healthCells.js').HealthCell>} */
  const out = [];
  const g = data?.giftEffectDiag ?? null;
  const cp = data?.commentPostDiag ?? null;
  const ip = data?.instantPushDiag ?? null;

  /* ── 到着演出(丸ごと計器が無かった) ─────────────────────
   * ★arrival* は「入室・到着」の演出系。検知したのに投下されていなければ症状。
   *   ★skippedCd(クールダウンで見送り)は **防御**なので異常にしない(掟1)。
   */
  if (!g || typeof g !== 'object') {
    out.push(cell('arrival-effect', '到着の演出', 'na', '—'));
  } else {
    const detected = n0(g.arrivalDetected);
    const thrown = n0(g.arrivalThrown);
    const skippedCd = n0(g.arrivalSkippedCd);
    if (detected <= 0) {
      out.push(cell('arrival-effect', '到着の演出', 'na', '—'));
    } else {
      // 検知したのに投下も見送りもされていない=どこかで落ちている
      const unexplained = Math.max(0, detected - thrown - skippedCd);
      out.push(cell(
        'arrival-effect', '到着の演出',
        unexplained > 0 ? 'warn' : 'ok',
        unexplained > 0
          ? `${detected}件検知・${thrown}件表示(${unexplained}件が説明できません)`
          : `${detected}件検知・${thrown}件表示${skippedCd > 0 ? `(連続${skippedCd}件は間引き)` : ''}`
      ));
    }
  }

  /* ── 演出の間引き(防御が働いている量) ───────────────────
   * ★これは【多いほど守れている】数字。異常にしない(掟1)。
   *   ただし「なぜ静かなのか」を説明するために出す
   *   ([[discarded-pass-reason-makes-greens-unreadable]])。
   */
  if (!g || typeof g !== 'object') {
    out.push(cell('effect-throttle', '演出の間引き', 'na', '—'));
  } else {
    const coalesced = n0(g.giftSoundCoalesced);
    const guarded = n0(g.giftSoundGuarded);
    const capGift = n0(g.giftThrowCapGuarded);
    const capAd = n0(g.adThrowCapGuarded);
    const total = coalesced + guarded + capGift + capAd;
    out.push(cell(
      'effect-throttle', '演出の間引き',
      'ok', // ★防御=多くても正常
      total > 0
        ? `${total}件を間引きました(重なりすぎを防いでいます)`
        : '間引きなし'
    ));
  }

  /* ── 送ってから画面に出るまで ───────────────────────────
   * ★体感に直結する数字なのにセルが無かった。
   *   楽観描画(optimistic)は「先に出す」仕組みなので、
   *   **echo(本当に届いた確認)** との差が体感のもたつき。
   */
  if (!cp || typeof cp !== 'object') {
    out.push(cell('comment-echo', '送信から表示まで', 'na', '—'));
  } else {
    const avgEcho = msOrNull(cp.avgEchoMs);
    const lastEcho = msOrNull(cp.lastEchoMs);
    const attempts = n0(cp.attempts);
    if (attempts <= 0 || (avgEcho == null && lastEcho == null)) {
      out.push(cell('comment-echo', '送信から表示まで', 'na', '—'));
    } else {
      const shown = avgEcho != null ? avgEcho : /** @type {number} */ (lastEcho);
      out.push(cell(
        'comment-echo', '送信から表示まで',
        shown >= 3000 ? 'bad' : shown >= 1500 ? 'warn' : 'ok',
        `${Math.round(shown)}ms${avgEcho != null ? '(平均)' : '(直近)'}`
      ));
    }
  }

  /* ── 送信の再試行 ───────────────────────────────────
   * ★1回で通っていないなら、ネットワークかページ側が不安定。
   *   ★再試行して成功しているなら **防御が効いている**ので警告止まり。
   */
  if (!cp || typeof cp !== 'object') {
    out.push(cell('comment-retry', '送信の再試行', 'na', '—'));
  } else {
    const retries = n0(cp.totalRetryAttempts);
    const attempts = n0(cp.attempts);
    if (attempts <= 0) {
      out.push(cell('comment-retry', '送信の再試行', 'na', '—'));
    } else {
      out.push(cell(
        'comment-retry', '送信の再試行',
        retries >= attempts ? 'warn' : 'ok',
        retries > 0 ? `${retries}回 やり直しました(送信${attempts}件)` : `再試行なし(送信${attempts}件)`
      ));
    }
  }

  /* ── 即時レーンの取りこぼし ─────────────────────────────
   * ★instantPushDiag.rejectedCount は「送ったのに受け取られなかった」数。
   *   storage を迂回する経路なので、ここが詰まると画面だけ遅れる。
   */
  if (!ip || typeof ip !== 'object') {
    out.push(cell('instant-reject', '即時表示の取りこぼし', 'na', '—'));
  } else {
    const sent = n0(ip.sentCount);
    const rejected = n0(ip.rejectedCount);
    if (sent <= 0) {
      out.push(cell('instant-reject', '即時表示の取りこぼし', 'na', '—'));
    } else {
      const pct = Math.round((rejected / sent) * 100);
      out.push(cell(
        'instant-reject', '即時表示の取りこぼし',
        pct >= 50 ? 'bad' : rejected > 0 ? 'warn' : 'ok',
        rejected > 0 ? `${rejected}/${sent}件(${pct}%)が届いていません` : `取りこぼしなし(${sent}件)`
      ));
    }
  }

  return out;
}
