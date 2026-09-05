/**
 * laneDetailCells.js — 応援レーンの観測を【打ち手が変わる単位】に割る(純関数)。
 *
 * ★なぜ要るか(2026-08-15 会議・在庫の棚卸し)
 *   既存のレーン系セルは、6〜20フィールド持つ観測から2〜3個しか読んでいない。
 *   例: `lane-dropped` は droppedTotal しか見ないので
 *       「上限で入りきらなかった(正常)」と「本当に消えた(異常)」が混ざる。
 *   ＝ **同じ数字を見ても打ち手が決まらない**。割ると決まる。
 *
 * ■ 掟(既存1〜5 + 会議が足した6)
 *   1. 防御が効いた回数は異常にしない
 *   2. 仕様上そうなるものを異常にしない
 *   3. 一部見送りは正常。全部のときだけ警告
 *   4. 症状の言葉で名付ける
 *   5. 「使っていない0」と「動くはずの0」を区別する
 *   6. ★次の一手か「これは仕様です」を書けないセルは作らない
 *
 * ★ここでは `laneTickProbe.docHidden` 等の【単独では打ち手が無い】内訳は
 *   セルにしない(会議 critic/lead が一致して却下)。裏タブで描かないのは正常。
 *   代わりに「最後に描いてから何秒経ったか」のように **症状になる形**で出す。
 *
 * @module laneDetailCells
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
 * レーンの詳細セルを作る。
 *
 * ★記録中の配信があるなら「レーンは動くはず」なので、観測ゼロでも ⚪ で出す(掟5)。
 *   一番知りたい異常時にセルが消えるのを防ぐ。
 *
 * @param {any} data buildHealthCells と同じ入力
 * @returns {Array<import('./healthCells.js').HealthCell>}
 */
export function buildLaneDetailCells(data) {
  /** @type {Array<import('./healthCells.js').HealthCell>} */
  const out = [];
  const p = data?.popupDiag?.popup ?? data?.popupDiag ?? null;
  const recording = Array.isArray(data?.livesData)
    && data.livesData.some((/** @type {any} */ l) => l && l.recording);

  /** 観測が無いときのセル(記録中なら ⚪ で出し、そうでなければ出さない)。 */
  const naCell = (/** @type {string} */ id, /** @type {string} */ label) =>
    (recording ? cell(id, label, 'na', '—') : null);
  /** @param {any} c */
  const push = (c) => { if (c) out.push(c); };

  /* ── 最後にレーンを描いてから ─────────────────────────────
   * ★`docHidden` 等の内訳は単独では打ち手が無い(裏タブは正常)。
   *   しかし **記録中なのに何分も描かれていない** のは症状。
   *   会場ギフト事件(8/14)は「①tick 0回(doc-hidden)」と鏡stale の組で真因が出た。
   */
  const tick = p?.laneTickProbe;
  const lastRunAgoMs = tick ? Number(tick.lastRunAgoMs) : NaN;
  if (!tick || !Number.isFinite(lastRunAgoMs)) {
    push(naCell('lane-last-run', 'レーンの最終描画'));
  } else {
    const sec = Math.round(lastRunAgoMs / 1000);
    /*
     * ★閾値は「人が気づく」基準。3分描かれていなければ、
     *   裏タブだとしても表に戻したとき古いものが見える＝症状。
     */
    const bad = recording && lastRunAgoMs >= 180_000;
    const warn = recording && lastRunAgoMs >= 60_000;
    out.push(cell(
      'lane-last-run', 'レーンの最終描画',
      bad ? 'bad' : warn ? 'warn' : 'ok',
      bad
        ? `${sec}秒前(止まっています。①ポップアップを開き直してください)`
        : `${sec}秒前`
    ));
  }

  /* ── 上限で入りきらなかった人(正常) vs 消えた人(異常) ─────
   * ★既存 lane-dropped は droppedTotal だけを見るので両者が混ざる。
   *   cappedOutTotal は **表示上限による除外＝仕様**(掟2)なので異常にしない。
   */
  const roster = p?.laneRosterDelta;
  if (!roster || !n0(roster.everSeenMax)) {
    push(naCell('lane-capped', '上限で表示できなかった人'));
  } else {
    const capped = n0(roster.cappedOutTotal);
    out.push(cell(
      'lane-capped', '上限で表示できなかった人',
      'ok', // ★仕様上の除外=異常ではない(多くても正常)
      capped > 0 ? `${capped}人(表示上限による・仕様です)` : '全員表示できています'
    ));
  }

  /* ── 一度に何人消えたか ───────────────────────────────
   * ★累計だけでは「1人ずつ徐々に」と「一度に30人」が区別できない。
   *   後者はレーンが作り直された疑いで、原因がまったく違う。
   */
  if (!roster || !n0(roster.everSeenMax)) {
    push(naCell('lane-drop-burst', '一度に消えた最大人数'));
  } else {
    const maxAtOnce = n0(roster.maxDroppedAtOnce);
    const events = n0(roster.droppedEventCount);
    const bad = maxAtOnce >= 10;
    out.push(cell(
      'lane-drop-burst', '一度に消えた最大人数',
      bad ? 'bad' : maxAtOnce > 0 ? 'warn' : 'ok',
      maxAtOnce > 0
        ? `${maxAtOnce}人(${events}回)${bad ? ' 作り直しの疑い' : ''}`
        : 'まとめて消えたことはありません'
    ));
  }

  /* ── 増減の振れ幅(ちらつきの体感に直結) ───────────────── */
  const osc = p?.storyUserLaneRenderProbe?.laneTileOscillation;
  if (!osc || !n0(osc.samples)) {
    push(naCell('lane-amplitude', 'レーンの振れ幅'));
  } else {
    const amplitude = n0(osc.amplitude);
    const maxTiles = n0(osc.maxTiles);
    const minTiles = n0(osc.minTiles);
    const reversals = n0(osc.reversals);
    /*
     * ★振れ幅そのものより「往復した回数」が体感のちらつき。
     *   増え続けるだけなら振れ幅が大きくても正常(掟2)。
     */
    const bad = reversals >= 4;
    const warn = reversals >= 1;
    out.push(cell(
      'lane-amplitude', 'レーンの振れ幅',
      bad ? 'bad' : warn ? 'warn' : 'ok',
      reversals > 0
        ? `${minTiles}〜${maxTiles}人で${reversals}回 往復(幅${amplitude})`
        : `${minTiles}〜${maxTiles}人(増える一方=正常)`
    ));
  }

  /* ── 一番大きく減った瞬間の犯人 ───────────────────────
   * ★会議 lead が「真因を名指しする良い計器」と評価した組。
   *   どの供給元(origin)で減ったかが分かると、直す場所が決まる。
   */
  if (!osc || !n0(osc.samples)) {
    push(naCell('lane-worst-drop', '一番大きく減った瞬間'));
  } else {
    const worstDrop = n0(osc.worstDrop);
    if (worstDrop <= 0) {
      out.push(cell('lane-worst-drop', '一番大きく減った瞬間', 'ok', '減っていません'));
    } else {
      const from = n0(osc.worstDropFrom);
      const to = n0(osc.worstDropTo);
      const origin = String(osc.worstDropOrigin || '').trim();
      out.push(cell(
        'lane-worst-drop', '一番大きく減った瞬間',
        worstDrop >= 10 ? 'bad' : 'warn',
        `${from}→${to}人${origin ? `(${origin})` : ''}`
      ));
    }
  }

  /* ── 供給が止まって書き出せなかった理由 ───────────────
   * ★lanePublishSkip は「書き手が動いているのに出ない」ときの決定打。
   *   ★見送り自体は正常な防御(掟1)。理由が続いているときだけ症状。
   */
  const skip = p?.lanePublishSkip;
  if (!skip) {
    push(naCell('lane-publish-skip', 'レーンの書き出し見送り'));
  } else {
    const noEls = n0(skip.noEls);
    const empty = n0(skip.entriesEmpty);
    const reason = String(skip.lastSkipReason || '').trim();
    const lastPublishAgoSec = Number(skip.lastPublishAgoSec);
    /*
     * ★「見送りがある」だけでは異常にしない。
     *   **一度も書き出せていない**(publish が無い)ときだけ症状。
     */
    const neverPublished = !Number.isFinite(lastPublishAgoSec);
    const total = noEls + empty;
    if (neverPublished && total > 0) {
      out.push(cell(
        'lane-publish-skip', 'レーンの書き出し見送り', 'bad',
        `一度も書き出せていません(${reason || `場所なし${noEls}/中身なし${empty}`})`
      ));
    } else {
      out.push(cell(
        'lane-publish-skip', 'レーンの書き出し見送り', 'ok',
        total > 0 ? `見送り${total}回(最終書き出し${Math.round(lastPublishAgoSec)}秒前)` : '見送りなし'
      ));
    }
  }

  return out;
}
