/**
 * 「なぜ消えたか」を消失時のスナップショットから分類する純関数。DOM は触らない。
 *
 * ★v0.1.1267 の動機(2026-08-05・会議4体→Fable設計):
 *   3日15版追って直らなかった。原因は「証拠だと思っていた 0 が壊れた計器の 0 だった」こと。
 *   計器 hostStyleTrace は ①host自身しか見ておらず親を観測していない
 *   ②状態変数を rAF ループと共有していて判定が成立しない
 *   ③idempotent ガードで初代 host に固着し、再生成後は死んだノードを見張る
 *   —— の3つが重なり、2日間「誰も書いていない」という誤った証拠を出し続けていた。
 *
 * ■ この関数の役目
 *   消えた瞬間の事実(属性・style文字列・祖先の幾何・CSS生存)から、
 *   【症状ではなく原因】を1つの短いタグ(hint)で名指しする。
 *   ([[instrument-must-name-the-cause-2026-08-01]])
 *
 * ■ なぜ純関数に切り出すか
 *   判定順序をテストで固定できる。実 DOM が要らないので変異テストが書ける。
 *   分類が曖昧なまま速報に出ると、また開発者が誤読する(5回やった)。
 *
 * ■ ★「判定不能」を必ず持つ
 *   入力が欠けているときに既定値で断定すると、また「0=異常なし」型の誤診になる。
 *   分からないときは 'unknown' と言い、理由を detail に残す。
 */

/** 消失の分類タグ。速報にそのまま出る。 */
export const VANISH_HINTS = Object.freeze({
  EXT_ATTR_HIDE: 'ext-attr-hide',
  CSS_REMOVED: 'css-removed',
  ANCESTOR_COLLAPSED: 'ancestor-collapsed',
  STYLE_WIPED: 'style-wiped',
  GEOMETRY_ONLY: 'geometry-only',
  UNKNOWN: 'unknown'
});

/**
 * 消えた瞬間のスナップショットを分類する。
 *
 * ★判定順序は固定(上から順に当てる)。順序自体が仕様なのでテストで固定する:
 *   1. 拡張が意図して消した(属性が付いている)     → ext-attr-hide
 *   2. 拡張の <style> が消えた(ルールごと消滅)    → css-removed
 *   3. 祖先が潰れている(親ごと巻き添え)           → ancestor-collapsed
 *   4. host の style から display が消えた         → style-wiped
 *   5. display は生きているのに 0x0               → geometry-only
 *   6. それ以外/入力欠損                          → unknown
 *
 * 1 を最優先にする理由: 属性が付いているなら「拡張が消した」が確定で、
 * 他の状況(親も潰れている等)は結果に過ぎない。犯人の名指しを誤らせない。
 *
 * @param {{
 *   hiddenAttr?: unknown,
 *   styleAttr?: unknown,
 *   hostDisplay?: unknown,
 *   ancestors?: unknown,
 *   cssAlive?: unknown
 * }} snap
 * @returns {{ hint: string, detail: string }}
 */
export function classifyVanishSnapshot(snap) {
  if (!snap || typeof snap !== 'object') {
    return { hint: VANISH_HINTS.UNKNOWN, detail: 'no-snapshot' };
  }

  // 1. 拡張が意図して消した(v0.1.1266 の属性が正本)。
  if (String(snap.hiddenAttr) === '1') {
    return { hint: VANISH_HINTS.EXT_ATTR_HIDE, detail: 'data-nls-hidden=1' };
  }

  // 2. 拡張の <style> ごと消えた= [data-nls-hidden] ルールも死んでいる。
  //    ★false のときだけ。未取得(undefined)を「消えた」と誤判定しない。
  if (snap.cssAlive === false) {
    return { hint: VANISH_HINTS.CSS_REMOVED, detail: 'extension <style> missing' };
  }

  // 3. 祖先が潰れている=親ごと巻き添え。何段目かまで名指しする。
  const ancestors = Array.isArray(snap.ancestors) ? snap.ancestors : null;
  if (ancestors && ancestors.length) {
    for (let i = 0; i < ancestors.length; i += 1) {
      const a = ancestors[i];
      if (!a || typeof a !== 'object') continue;
      const collapsed =
        String(a.display) === 'none' ||
        (Number(a.w) === 0 && Number(a.h) === 0);
      if (collapsed) {
        const tag = String(a.tag || '?');
        const why = String(a.display) === 'none' ? 'display:none' : '0x0';
        return {
          hint: VANISH_HINTS.ANCESTOR_COLLAPSED,
          detail: `ancestor[${i}] ${tag} ${why}`
        };
      }
    }
  }

  const hostDisplay = String(snap.hostDisplay || '');
  const styleAttr = typeof snap.styleAttr === 'string' ? snap.styleAttr : null;

  // 4. computed が none なのに、host の style 文字列に display が無い
  //    = インラインの上書きが外から失われた(誰かが style を書き換えた/消した)。
  if (hostDisplay === 'none') {
    if (styleAttr === null) {
      return { hint: VANISH_HINTS.UNKNOWN, detail: 'style-attr-unavailable' };
    }
    if (!styleAttr.includes('display')) {
      return { hint: VANISH_HINTS.STYLE_WIPED, detail: 'inline display lost' };
    }
    // display が inline に有るのに none = 拡張以外の誰かが none を書いた。
    return { hint: VANISH_HINTS.UNKNOWN, detail: 'inline display:none by unknown writer' };
  }

  // 5. 表示指定は生きているのに 0x0 = 幾何だけが潰れている。
  if (hostDisplay) {
    return { hint: VANISH_HINTS.GEOMETRY_ONLY, detail: `display:${hostDisplay} but 0x0` };
  }

  return { hint: VANISH_HINTS.UNKNOWN, detail: 'insufficient-input' };
}

/** 位相判定に要る最小サンプル数。これ未満は必ず insufficient。 */
export const PHASE_MIN_SAMPLES = 3;
/** locked と見なす Δ のばらつき上限(ms)。 */
export const PHASE_LOCK_TOLERANCE_MS = 120;

/**
 * 「消失を駆動している時計」が拡張側か外部かを、位相のばらつきで二分する。
 *
 * Δ = 消失時刻 − 直近の拡張4秒tick時刻。
 *   - 拡張の時計が上流なら Δ はほぼ一定 → 'locked'
 *   - 外部の独立した4秒タイマーならレート差で Δ が歩く → 'walking'
 *
 * ★これが「復帰ゲートを止めずに二分する」中核。
 *   ゲートを止める案は v0.1.1250 の地雷(唯一の復帰経路を塞ぐ)なので採れない。
 *
 * @param {unknown} deltas Δ の配列(ms)
 * @returns {{ phase: 'locked'|'walking'|'insufficient', spreadMs: number, n: number }}
 */
export function assessVanishPhase(deltas) {
  // ★null/'' は Number() が 0 を返すので、数値型だけを先に選ぶ。
  //   これを怠ると欠損値が「Δ=0ms」として位相に混ざり、locked へ誤判定する。
  const list = (Array.isArray(deltas) ? deltas : [])
    .filter((d) => typeof d === 'number' && Number.isFinite(d));
  const n = list.length;
  if (n < PHASE_MIN_SAMPLES) {
    return { phase: 'insufficient', spreadMs: 0, n };
  }
  const spreadMs = Math.max(...list) - Math.min(...list);
  return {
    phase: spreadMs < PHASE_LOCK_TOLERANCE_MS ? 'locked' : 'walking',
    spreadMs,
    n
  };
}

/**
 * 速報用の1行。★phase の意味を日本語で言い切る(開発者が誤読しないように)。
 * @param {ReturnType<typeof assessVanishPhase>} a
 * @param {number[]} [deltas]
 * @returns {string}
 */
export function formatVanishPhaseLine(a, deltas) {
  if (!a || typeof a !== 'object') return '';
  const list = Array.isArray(deltas) ? deltas.slice(0, 6) : [];
  const head = `位相: pollDeltas [${list.join(',')}]`;
  if (a.phase === 'insufficient') {
    return `${head} → insufficient(サンプル${a.n}件・${PHASE_MIN_SAMPLES}件で判定可能)`;
  }
  if (a.phase === 'locked') {
    return `${head} → locked(ばらつき${a.spreadMs}ms=拡張の4秒時計と同位相=内部が上流)`;
  }
  return `${head} → walking(ばらつき${a.spreadMs}ms=別の時計=外部要因)`;
}
