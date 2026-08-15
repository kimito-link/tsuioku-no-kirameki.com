/**
 * blackScreenOwnerCells.js — 黒画面の【止めている当人】をセルにする(純関数)。
 *
 * ★なぜ要るか(2026-08-15 会議 lead の逆算・引き継ぎ§4)
 *   黒画面7版が空振りした真因は「イベントループ停止」で、それを指したのは
 *   **タイマーの実発火の遅れ**という数字だった。v0.1.1398 で計測方法を
 *   iframe 内ハートビートへ直したので、次の速報から当人が出る状態にはなった。
 *
 *   しかし既存の `main-thread` セルは **worstName と worstMs しか読んでいない**。
 *   `mainThreadBlockerCensus` は
 *     byName{} (累計の多い順=いちばん止めている当人)
 *     afterResumeMs / afterResumeCount (可視復帰5秒以内=スリープ明けのまとめ描き)
 *     totalMs (合計)
 *   まで持っているのに、**速報の本文にしか出ていない**(formatBlockerLine)。
 *
 * ■ 引き継ぎ§4が定めた「次の速報で読む3分岐」をそのままセルにする
 *   1. 区間名が出る            → その処理を短くすれば黒が消える
 *   2. 「(拡張の外)」と出る    → ニコ生ページ側が止めている(拡張では直せない可能性)
 *   3. 可視復帰5秒以内に偏る   → スリープからのまとめ描きが主因
 *
 * ★閾値と文言は **formatBlockerLine(mainThreadBlockerCensus.js:122) が正本**。
 *   ここで独自の閾値を作ると、同じ観測に対して
 *   速報とセルが違うことを言う([[shared-knowledge-is-not-shared-judgment]])。
 *
 * ★幕/シェードには触れない。速報が「幕/シェードは【下流】」と明言しており、
 *   7版かけて空振りした経路なので、この計器も下流を指さない。
 *
 * @module blackScreenOwnerCells
 */

/** formatBlockerLine と同じ閾値(🔴/🟡の境界)。 */
const WORST_BAD_MS = 500;
const WORST_WARN_MS = 200;

/** 可視復帰直後の停止が全体のこれ以上を占めたら「まとめ描きが主因」。 */
const RESUME_DOMINANT_PCT = 50;

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
 * 累計の多い順に「いちばん止めている当人」を返す。
 * @param {Record<string, { ms?: number, count?: number, worstMs?: number }>|null|undefined} byName
 * @returns {{ name: string, ms: number, count: number }|null}
 */
function topOwner(byName) {
  if (!byName || typeof byName !== 'object') return null;
  const list = Object.keys(byName).map((k) => ({
    name: k,
    ms: n0(byName[k]?.ms),
    count: n0(byName[k]?.count)
  }));
  if (list.length === 0) return null;
  list.sort((a, b) => b.ms - a.ms);
  return list[0].ms > 0 ? list[0] : null;
}

/**
 * 黒画面の当人セルを作る。
 *
 * ★観測が無くても消さない(掟5)。黒くなっているのにセルが消えるのが最悪。
 *
 * @param {any} data buildHealthCells と同じ入力
 * @returns {Array<import('./healthCells.js').HealthCell>}
 */
export function buildBlackScreenOwnerCells(data) {
  /** @type {Array<import('./healthCells.js').HealthCell>} */
  const out = [];
  const mt = data?.mainThreadBlocker ?? null;
  const has = mt && typeof mt === 'object' && n0(mt.count) > 0;

  /* ── 1. いちばん止めている当人(累計) ─────────────────────
   * ★既存 main-thread は「最悪の1件」しか出さない。1回の外れ値に騙されるので
   *   **累計の多い順**を別セルで出す(どこを短くすれば効くかが変わる)。
   */
  if (!has) {
    out.push(cell('mt-owner', '止めている当人', 'na', '—'));
  } else {
    const owner = topOwner(mt.byName);
    if (!owner) {
      /*
       * ★count>0 なのに名前が無い = 拡張が包んだ区間の外で止まっている。
       *   引き継ぎ§4の第2分岐「(拡張の外)」がこれ。打ち手が変わる(拡張では直せない)ので
       *   「不明」で濁さず、そう名指しする。
       */
      out.push(cell(
        'mt-owner', '止めている当人', 'warn',
        '(拡張の外) ニコ生ページ側が止めています。タブの再読込で軽くなることがあります'
      ));
    } else {
      const worst = Math.round(n0(mt.worstMs));
      out.push(cell(
        'mt-owner', '止めている当人',
        worst >= WORST_BAD_MS ? 'bad' : worst >= WORST_WARN_MS ? 'warn' : 'ok',
        `${owner.name} 累計${Math.round(owner.ms)}ms(${owner.count}回)`
      ));
    }
  }

  /* ── 2. 合計でどれだけ止まったか ─────────────────────────
   * ★最悪1件が小さくても、細かい停止の積み上げで黒くなることがある
   *   ([[serial-bounded-reads-sum-to-unbounded]] と同じ型=個別は正常・合計が異常)。
   */
  if (!has) {
    out.push(cell('mt-total', '止まった合計時間', 'na', '—'));
  } else {
    const totalMs = Math.round(n0(mt.totalMs));
    const count = n0(mt.count);
    out.push(cell(
      'mt-total', '止まった合計時間',
      totalMs >= 3000 ? 'bad' : totalMs >= 1000 ? 'warn' : 'ok',
      `${totalMs}ms(${count}回)`
    ));
  }

  /* ── 3. スリープ明けのまとめ描きか ───────────────────────
   * ★ユーザーの観測「しばらく見ないとスリープっぽい」「しばらくすると戻る」が根拠。
   *   全体の半分以上が可視復帰5秒以内なら、それが主因と名指しする。
   */
  if (!has) {
    out.push(cell('mt-resume', 'スリープ明けの詰まり', 'na', '—'));
  } else {
    const arCount = n0(mt.afterResumeCount);
    const arMs = Math.round(n0(mt.afterResumeMs));
    const totalMs = Math.round(n0(mt.totalMs));
    if (arCount <= 0) {
      out.push(cell('mt-resume', 'スリープ明けの詰まり', 'ok', '復帰直後の詰まりなし'));
    } else {
      const pct = totalMs > 0 ? Math.round((arMs / totalMs) * 100) : 0;
      const dominant = pct >= RESUME_DOMINANT_PCT;
      out.push(cell(
        'mt-resume', 'スリープ明けの詰まり',
        dominant ? 'bad' : 'warn',
        dominant
          ? `${arCount}回 ${arMs}ms(全体の${pct}%) 復帰時のまとめ描きが主因です`
          : `${arCount}回 ${arMs}ms(全体の${pct}%)`
      ));
    }
  }

  return out;
}
