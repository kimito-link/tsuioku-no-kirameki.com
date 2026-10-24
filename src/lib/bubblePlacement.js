// bubblePlacement.js
// v0.1.1760: 吹き出しを「大事な表示に被らない場所」へ置く配置純関数(PC 会場・スマホ会場の共通)。
//
// ユーザー報告(2026-10-24・スクショ): 吹き出しが PICK UP 枠やギフト列の説明の上に被って読めない。
// 実ブラウザで再現した真因は2つ:
//   1. 吹き出しは常に「席の頭上」に出し、重なれば上へ逃がすだけだった(venueBubbleLayout.resolveBubbleY)。
//      頭上に PICK UP・見出し・案内文があっても、そのまま上に被せていた。
//   2. 席が一覧のスクロールの外(見えない位置)にあっても、その座標へ吹き出しを出していた。
//      一覧の下に隠れた人の吹き出しが、一覧の下の PICK UP 枠の上に「誰のものか分からず」浮いていた。
//
// 解決=置き場所の候補(上・下・右・左・他の吹き出しの上下)を並べ、
//   「被ってはいけない物(重み付き)との重なり面積 + 席から離れる罰 + 向きの好み」が最小の候補を選ぶ。
//   席が見えないときは、一覧の見えている縁(席がある側)に寄せて出す(呼び出し側が anchor を縁にする)。
//
// このファイルは座標計算だけ(DOM 非依存・テスト可能)。座標系は呼び出し側で揃えること(同じ原点の px)。

/**
 * @typedef {{ left:number, top:number, right:number, bottom:number }} Box
 * @typedef {Box & { weight:number }} Obstacle
 * @typedef {'top'|'bottom'|'left'|'right'} BubbleSide
 * @typedef {{ left:number, top:number, side:BubbleSide, tail:number, score:number }} BubblePlacement
 *   left/top=吹き出しの左上。side=席から見て吹き出しがどちら側か(尻尾は反対側の辺に付く)。
 *   tail=尻尾の位置(top/bottom なら吹き出し左端からの x、left/right なら上端からの y)。
 */

/** 向きの好み(吹き出し面積に対する割合で罰する)。頭上が自然・次に下・横は最後。 */
const SIDE_PENALTY = { top: 0, bottom: 0.12, right: 0.22, left: 0.24 };
/** 尻尾を角から離す最小距離(px)。角に尻尾があると吹き出しの形が崩れる。 */
const TAIL_INSET = 16;

/** @param {Box} a @param {Box} b */
function overlapArea(a, b) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/** @param {number} v @param {number} lo @param {number} hi */
function clamp(v, lo, hi) {
  if (hi < lo) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

/** @param {unknown} r @returns {Box|null} */
function toBox(r) {
  const o = /** @type {any} */ (r);
  if (!o) return null;
  const left = Number(o.left);
  const top = Number(o.top);
  const right = Number.isFinite(Number(o.right)) ? Number(o.right) : left + Number(o.width);
  const bottom = Number.isFinite(Number(o.bottom)) ? Number(o.bottom) : top + Number(o.height);
  if (![left, top, right, bottom].every(Number.isFinite)) return null;
  return { left, top, right: Math.max(left, right), bottom: Math.max(top, bottom) };
}

/**
 * 席(アバター)の矩形と、それを切り取っている枠(スクロール一覧)の矩形から、
 * 吹き出しを向ける「見えている基準」を決める。
 *   - 席が枠の中で半分以上見えている → 席そのもの(visible:true)
 *   - 枠の下(上)へ隠れている → 枠の下(上)の縁に置いた幅のある点(visible:false, edge)
 * @param {Box|{left:number,top:number,width:number,height:number}} seat
 * @param {Box|{left:number,top:number,width:number,height:number}|null} clip
 * @returns {{ anchor: Box, visible: boolean, edge: 'top'|'bottom'|null }}
 */
export function resolveVisibleAnchor(seat, clip) {
  const s = toBox(seat) || { left: 0, top: 0, right: 0, bottom: 0 };
  const c = toBox(clip);
  if (!c) return { anchor: s, visible: true, edge: null };
  const area = (s.right - s.left) * (s.bottom - s.top);
  const seen = overlapArea(s, c);
  if (area <= 0 || seen / area >= 0.5) return { anchor: s, visible: true, edge: null };
  const cx = clamp((s.left + s.right) / 2, c.left + 4, c.right - 4);
  const below = (s.top + s.bottom) / 2 >= (c.top + c.bottom) / 2;
  const y = below ? c.bottom - 2 : c.top + 2;
  return {
    anchor: { left: cx - 1, top: y, right: cx + 1, bottom: y },
    visible: false,
    edge: below ? 'bottom' : 'top'
  };
}

/**
 * 吹き出しの置き場所を選ぶ。
 * @param {object} p
 * @param {Box|{left:number,top:number,width:number,height:number}} p.anchor 話した人の席(アバター)の矩形
 * @param {{ w:number, h:number }} p.size 吹き出しの大きさ
 * @param {Box} p.bounds 吹き出しがはみ出してはいけない範囲(画面・会場)
 * @param {Obstacle[]} [p.obstacles] 被せたくない物(weight が大きいほど避ける)
 * @param {Box|null} [p.home] 吹き出しが居てよい場所(会場の席の帯)。外にはみ出た分は outsideWeight で罰する
 * @param {number} [p.outsideWeight=0.5]
 * @param {number} [p.gap=10] 席と吹き出しの間
 * @param {BubbleSide[]} [p.sides] 試す向き(既定は全部)。席が見えないときは縁の内側だけにする
 * @param {BubbleSide|null} [p.prefer] 直前の向き(スクロール中に向きがパタパタ変わらないよう少し優遇)
 * @returns {BubblePlacement}
 */
export function chooseBubblePlacement(p) {
  const a = toBox(p?.anchor) || { left: 0, top: 0, right: 0, bottom: 0 };
  const w = Math.max(1, Number(p?.size?.w) || 160);
  const h = Math.max(1, Number(p?.size?.h) || 40);
  const b = toBox(p?.bounds) || { left: -1e6, top: -1e6, right: 1e6, bottom: 1e6 };
  const gap = Number.isFinite(Number(p?.gap)) ? Number(p.gap) : 10;
  const home = toBox(p?.home);
  const outsideWeight = Number.isFinite(Number(p?.outsideWeight)) ? Number(p.outsideWeight) : 0.5;
  /** @type {Obstacle[]} */
  const obstacles = [];
  for (const o of Array.isArray(p?.obstacles) ? p.obstacles : []) {
    const box = toBox(o);
    const weight = Number(/** @type {any} */ (o)?.weight);
    if (box && weight > 0) obstacles.push({ ...box, weight });
  }
  /** @type {BubbleSide[]} */
  const sides = Array.isArray(p?.sides) && p.sides.length ? p.sides : ['top', 'bottom', 'right', 'left'];
  const prefer = p?.prefer || null;
  const cx = (a.left + a.right) / 2;
  const cy = (a.top + a.bottom) / 2;
  const area = w * h;

  /** @type {Array<{ left:number, top:number, side:BubbleSide, dist:number }>} */
  const cands = [];
  /** @param {BubbleSide} side @param {number} left @param {number} top @param {number} dist */
  const push = (side, left, top, dist) => {
    cands.push({
      side,
      left: clamp(left, b.left, b.right - w),
      top: clamp(top, b.top, b.bottom - h),
      dist
    });
  };
  // 横方向のずらし: 真ん中・席の左寄せ・右寄せ(尻尾が角に来ない範囲)。
  const xs = [cx - w / 2, cx - TAIL_INSET - 8, cx - w + TAIL_INSET + 8];
  for (const side of sides) {
    if (side === 'top' || side === 'bottom') {
      const y0 = side === 'top' ? a.top - gap - h : a.bottom + gap;
      for (const x of xs) push(side, x, y0, 0);
      // 同じ向きで、邪魔な物の外側(上なら上・下なら下)まで逃がした候補。離れるほど罰する。
      for (const o of obstacles) {
        if (o.right <= cx - w || o.left >= cx + w) continue;
        const y = side === 'top' ? o.top - 6 - h : o.bottom + 6;
        const dist = side === 'top' ? y0 - y : y - y0;
        if (dist > 0) for (const x of xs) push(side, x, y, dist);
      }
    } else {
      const x0 = side === 'right' ? a.right + gap : a.left - gap - w;
      push(side, x0, cy - h / 2, 0);
      push(side, x0, cy - h + TAIL_INSET + 8, 0);
      push(side, x0, cy - TAIL_INSET - 8, 0);
    }
  }

  /** @type {BubblePlacement|null} */
  let best = null;
  for (const c of cands) {
    const box = { left: c.left, top: c.top, right: c.left + w, bottom: c.top + h };
    let score = 0;
    for (const o of obstacles) score += overlapArea(box, o) * o.weight;
    // 自分の顔は必ず見せる(横に置いたとき・はみ出し補正で席に戻ってきたとき)。
    score += overlapArea(box, a) * 8;
    if (home) score += (area - overlapArea(box, home)) * outsideWeight;
    score += area * (SIDE_PENALTY[c.side] ?? 0.3);
    if (prefer && c.side !== prefer) score += area * 0.06;
    // 席から離れるほど「誰の吹き出しか」が分かりにくくなる。吹き出し1個分を超えて離すのは急に重くする
    //   (混んだときに上へ上へ積んで配信映像の上まで飛ばすより、古い吹き出しに少し重なる方が分かりやすい)。
    const far = Math.max(0, c.dist - h);
    score += c.dist * w * 0.8 + far * far * w * 0.05;
    // はみ出し補正で席との位置関係がずれた分(尻尾が届かない分)も罰する。
    const tail = c.side === 'top' || c.side === 'bottom' ? cx - c.left : cy - c.top;
    const span = c.side === 'top' || c.side === 'bottom' ? w : h;
    const reach = tail < TAIL_INSET ? TAIL_INSET - tail : tail > span - TAIL_INSET ? tail - (span - TAIL_INSET) : 0;
    score += reach * span * 2;
    if (!best || score < best.score - 0.5) {
      best = { left: Math.round(c.left), top: Math.round(c.top), side: c.side, tail: Math.round(clamp(tail, TAIL_INSET, span - TAIL_INSET)), score };
    }
  }
  return best || { left: Math.round(cx - w / 2), top: Math.round(a.top - gap - h), side: 'top', tail: Math.round(w / 2), score: 0 };
}

/**
 * 新しい吹き出しが、既にある吹き出しをどれだけ隠したか。隠れた割合が ratio 以上の相手の番号を返す。
 * 混んで置き場が無いとき、重なった古い吹き出しは読めない=静かに先に消す(新しい発言が主役)。
 * @param {Box} box 新しい吹き出し
 * @param {Array<Box|null|undefined>} others 既にある吹き出し
 * @param {number} [ratio=0.35]
 * @returns {number[]}
 */
export function coveredBubbleIndexes(box, others, ratio = 0.35) {
  const me = toBox(box);
  /** @type {number[]} */
  const out = [];
  if (!me || !Array.isArray(others)) return out;
  others.forEach((o, i) => {
    const r = toBox(o);
    if (!r) return;
    const area = (r.right - r.left) * (r.bottom - r.top);
    if (area > 0 && overlapArea(me, r) / area >= ratio) out.push(i);
  });
  return out;
}
