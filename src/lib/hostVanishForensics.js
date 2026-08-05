/**
 * 消えた瞬間の「直前に何が起きたか」を記録する計器(純関数)。
 *
 * ★v0.1.1265 の動機(2026-08-05・ユーザー「リアルタイム実測して」):
 *   犯人を推測で追って外し続けている。実測できる形にする。
 *
 * ■ ここまでに【判明したこと】(実測)
 *   - v0.1.1264 で host_created は 0回になった(パネル3個生成は直った)
 *   - しかし消失は継続: 3回・4.0秒ちょうど・変動係数 0.001
 *   - autoshow_off は【無罪】(v0.1.1263 の二分実験で確定。止めても消えた)
 *   - hostFlipCensus は 0回(=setInlineHostDisplay を通っていない)
 *   - hostStyleTrace は 0回(=MutationObserver は非同期でスタックが取れない・配線も未到達)
 *
 * ■ ★まだ測れていないこと
 *   「消えた瞬間の直前1秒間に、拡張のどの処理が走ったか」。
 *   犯人は 4秒タイマー(livePollMs: 4000 → syncLiveIdFromLocation)の可能性が高いが、
 *   そこにはゲートを入れた(v0.1.1250/1254)。にもかかわらず消える。
 *   = ゲートの内側で何かが起きているか、別の処理が同じ周期で走っている。
 *
 * ■ この計器の方針: 「足跡」を残す
 *   各処理の入口で「いま自分が走った」という印だけを置く(軽い・O(1))。
 *   消えた瞬間(rAF実測で検知)に、直前1秒の足跡を並べて速報に出す。
 *   → 誰が犯人かではなく【消える直前に何が走っていたか】が分かる。
 *
 * ■ 設計の掟
 *   - 足跡は固定長リングで持つ(メモリを増やさない)
 *   - 記録は文字列1つと時刻のみ(重い処理を足さない)
 *   - 0 の意味を区別する(観測回数を必ず併記)
 */

/** 足跡リングの長さ。4秒周期×数回分を覆える程度。 */
export const TRAIL_MAX = 64;
/** 消失の直前として遡る時間(ms)。 */
export const LOOKBACK_MS = 1200;

/**
 * @returns {{
 *   trail: Array<{t:number,tag:string}>,
 *   vanishCount: number,
 *   samples: Array<object>,
 *   pollDeltas: number[]
 * }}
 */
export function createVanishForensics() {
  return { trail: [], vanishCount: 0, samples: [], pollDeltas: [] };
}

/** 位相判定に使う Δ の保持上限。速報を膨らませない。 */
export const POLL_DELTA_MAX = 6;

/**
 * 処理の入口で「走った」印を置く。★軽さが最優先(文字列と数値だけ)。
 * @param {ReturnType<typeof createVanishForensics>} f
 * @param {string} tag 処理名
 * @param {number} nowMs
 */
export function markTrail(f, tag, nowMs) {
  if (!f || typeof f !== 'object') return;
  f.trail.push({ t: Number(nowMs) || 0, tag: String(tag || '') });
  if (f.trail.length > TRAIL_MAX) f.trail.shift();
}

/**
 * 直前 LOOKBACK_MS 以内の足跡を、古い順に返す。
 * @param {Array<{t:number,tag:string}>} trail
 * @param {number} atMs
 * @returns {string[]} "tag(-NNNms)" の配列
 */
export function recentTrail(trail, atMs) {
  const at = Number(atMs) || 0;
  const list = Array.isArray(trail) ? trail : [];
  return list
    .filter((e) => e && at - e.t >= 0 && at - e.t <= LOOKBACK_MS)
    .map((e) => `${e.tag}(-${at - e.t}ms)`);
}

/**
 * 消えた瞬間を記録する。直前の足跡を切り出して残す。
 *
 * ★v0.1.1267: hint(なぜ消えたかの分類)・snapshot(属性/style/祖先)・
 *   pollDeltaMs(拡張4秒tickとの位相差)を追加。
 *   ★Δ は samples 上限(4件)と【別に】貯める。位相判定には件数が要るため、
 *     サンプル打ち切りに巻き込むと永久に insufficient になる。
 *
 * @param {ReturnType<typeof createVanishForensics>} f
 * @param {{
 *   nowMs:number, w?:number, h?:number, display?:string,
 *   hint?:string, detail?:string, snapshot?:object, pollDeltaMs?:number
 * }} obs
 */
export function noteVanishWithTrail(f, obs) {
  if (!f || typeof f !== 'object') return;
  f.vanishCount = (Number(f.vanishCount) || 0) + 1;
  // ★Δ は samples の上限より先に積む(上限で打ち切ると位相が永久に判定不能になる)。
  if (!Array.isArray(f.pollDeltas)) f.pollDeltas = [];
  if (typeof obs?.pollDeltaMs === 'number' && Number.isFinite(obs.pollDeltaMs)) {
    f.pollDeltas.push(Math.round(obs.pollDeltaMs));
    if (f.pollDeltas.length > POLL_DELTA_MAX) f.pollDeltas.shift();
  }
  if (f.samples.length >= 4) return; // 速報を膨らませない
  const at = Number(obs?.nowMs) || 0;
  f.samples.push({
    atMs: at,
    w: Math.round(Number(obs?.w) || 0),
    h: Math.round(Number(obs?.h) || 0),
    display: String(obs?.display || ''),
    hint: String(obs?.hint || ''),
    detail: String(obs?.detail || ''),
    snapshot: obs?.snapshot && typeof obs.snapshot === 'object' ? obs.snapshot : null,
    pollDeltaMs:
      typeof obs?.pollDeltaMs === 'number' && Number.isFinite(obs.pollDeltaMs)
        ? Math.round(obs.pollDeltaMs)
        : null,
    before: recentTrail(f.trail, at)
  });
}

/**
 * 速報用スナップショット。
 * @param {ReturnType<typeof createVanishForensics>} f
 */
export function snapshotVanishForensics(f) {
  const s = f && typeof f === 'object' ? f : null;
  if (!s) return null;
  return {
    trailLen: Array.isArray(s.trail) ? s.trail.length : 0,
    vanishCount: Number(s.vanishCount) || 0,
    samples: Array.isArray(s.samples) ? s.samples.slice(0, 4) : [],
    pollDeltas: Array.isArray(s.pollDeltas) ? s.pollDeltas.slice(0, POLL_DELTA_MAX) : []
  };
}

/**
 * 状態速報の行。★0 の意味を区別する。
 * @param {{ trailLen?:number, vanishCount?:number, samples?:Array<any> }|null|undefined} snap
 * @returns {string}
 */
export function formatVanishForensicsLine(snap) {
  const s = snap && typeof snap === 'object' ? snap : null;
  if (!s) return '';
  const trailLen = Number(s.trailLen) || 0;
  if (trailLen <= 0) {
    return '消える直前の足跡 ⚪ 未計測(足跡0件=まだ何も記録していません)';
  }
  const v = Number(s.vanishCount) || 0;
  if (v <= 0) {
    return `消える直前の足跡 ✅ 消失なし(足跡${trailLen}件を記録中=判定済み)`;
  }
  const lines = [`消える直前の足跡 ⚠ ${v}回消失(足跡${trailLen}件)`];
  const list = Array.isArray(s.samples) ? s.samples : [];
  list.forEach((x, i) => {
    // ★hint(なぜ消えたか)を1行目に出す。ユーザーに読んでもらうのはこの行。
    const hint = x.hint ? ` hint:${x.hint}` : ' hint:(未分類)';
    const dp = typeof x.pollDeltaMs === 'number' ? ` Δpoll:+${x.pollDeltaMs}ms` : '';
    lines.push(`  [${i + 1}] ${x.w}x${x.h} display:${x.display || '-'}${hint}${dp}`);
    if (x.detail) lines.push(`      理由: ${x.detail}`);
    const snap = x.snapshot && typeof x.snapshot === 'object' ? x.snapshot : null;
    if (snap) {
      if (typeof snap.styleAttr === 'string') {
        lines.push(`      style属性: "${snap.styleAttr}"`);
      }
      const anc = Array.isArray(snap.ancestors) ? snap.ancestors : [];
      if (anc.length) {
        lines.push(
          `      祖先: ${anc
            .map(
              /** @param {{tag?:string,w?:number,h?:number,display?:string}} a */
              (a) => `${a?.tag || '?'}(${a?.w}x${a?.h} ${a?.display || '-'})`
            )
            .join(' > ')}`
        );
      }
    }
    const before = Array.isArray(x.before) ? x.before : [];
    if (before.length) {
      lines.push(`      直前に走った処理: ${before.join(' / ')}`);
    } else {
      lines.push('      ★直前1.2秒に拡張の処理は走っていません(=外部要因の可能性)');
    }
  });
  return lines.join('\n');
}
