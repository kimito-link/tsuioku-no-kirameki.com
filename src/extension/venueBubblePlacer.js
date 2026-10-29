// venueBubblePlacer.js — 会場(PC)の吹き出しを DOM の実寸から置く薄い層。
// v0.1.1760: 判定(どこに置くか)は src/lib/bubblePlacement.js の純関数。ここは測って・書くだけ。
//   ★被せたくない物=PICK UP 枠・会場の見出し・一覧の案内文・他の吹き出し。会場の帯の外(配信映像)は軽く避ける。
//   ★席が一覧のスクロールの外にあるときは、一覧の見えている縁に寄せ、誰の発言かを名前で添える(.nlsb-bubble--away)。

import { chooseBubblePlacement, resolveVisibleAnchor } from '../lib/bubblePlacement.js';

/** 被せたくない物の重み。数字が大きいほど避ける。 */
export const VENUE_BUBBLE_OBSTACLE_WEIGHTS = { bubble: 5, pickup: 3, header: 3, guide: 2 };

/**
 * 席を切り取っている枠(overflow が visible でない祖先)の見えている範囲。無ければ null。
 * @param {Element} el @param {Element} stopAt
 * @returns {DOMRect|{left:number,top:number,right:number,bottom:number}|null}
 */
function visibleClipRect(el, stopAt) {
  /** @type {{left:number,top:number,right:number,bottom:number}|null} */
  let clip = null;
  /** @type {DOMRect|null} 一番外側のスクロール枠(会場の一覧) */
  let outerScroll = null;
  for (let p = el.parentElement; p && p !== stopAt; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
    const r = p.getBoundingClientRect();
    if (/auto|scroll/.test(cs.overflowY)) outerScroll = r;
    clip = clip
      ? { left: Math.max(clip.left, r.left), top: Math.max(clip.top, r.top), right: Math.min(clip.right, r.right), bottom: Math.min(clip.bottom, r.bottom) }
      : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }
  // ★v0.1.1761: 段がまるごと一覧の外(下)にあると、枠の重なりが空(上端>下端)になる。そのまま使うと縁が段の位置=
  //   一覧の外になり、吹き出しが PICK UP 枠より下(会場の外)に出ていた。空なら一覧のスクロール枠そのものの縁に寄せる。
  if (clip && (clip.bottom <= clip.top || clip.right <= clip.left) && outerScroll) {
    return { left: outerScroll.left, top: outerScroll.top, right: outerScroll.right, bottom: outerScroll.bottom };
  }
  return clip;
}

/** @param {DOMRect|{left:number,top:number,right:number,bottom:number}} r @param {{left:number,top:number}} o */
const rel = (r, o) => ({ left: r.left - o.left, top: r.top - o.top, right: r.right - o.left, bottom: r.bottom - o.top });

/**
 * 吹き出し1つを置く。戻り値=置いた箱(レイヤー基準)と向き。次の吹き出しの「避ける物」に使う。
 * @param {object} p
 * @param {HTMLElement} p.layer 吹き出しレイヤー(座標の原点)
 * @param {HTMLElement} p.bubbleEl 吹き出し
 * @param {HTMLElement|null} p.anchorEl 話した人のアバター(無ければ fallback を使う)
 * @param {{x:number,y:number}|null} [p.fallback] 席が無い人の決定座標(レイヤー基準)
 * @param {HTMLElement|null} p.seating 会場の席の帯(ここから外=配信映像は軽く避ける)
 * @param {HTMLElement|null} [p.viewport] 席の一覧のスクロール枠。席が無い人の吹き出しはこの中(下の縁)に出す
 * @param {Array<{ el: Element|null, weight: number, clipTo?: Element|null }>} p.obstacleEls clipTo=その枠(一覧のスクロール)で見えている部分だけを避ける
 * @param {Array<{left:number,top:number,right:number,bottom:number}>} p.otherBubbles 他の吹き出しの箱(レイヤー基準)
 * @param {import('../lib/bubblePlacement.js').BubbleSide|null} [p.prefer]
 * @returns {{ box: {left:number,top:number,right:number,bottom:number}, side: string }|null}
 */
export function placeVenueBubble(p) {
  const { layer, bubbleEl, anchorEl } = p;
  const L = layer.getBoundingClientRect();
  /** @type {{left:number,top:number,right:number,bottom:number}} */
  let anchor;
  let away = false;
  let edge = null;
  /** @type {{left:number,top:number,right:number,bottom:number}|null} */
  let clip = null;
  if (anchorEl) {
    clip = visibleClipRect(anchorEl, layer.parentElement || layer);
    const v = resolveVisibleAnchor(rel(anchorEl.getBoundingClientRect(), L), clip ? rel(clip, L) : null);
    anchor = v.anchor;
    away = !v.visible;
    edge = v.edge;
  } else if (p.fallback && p.viewport) {
    // ★v0.1.1826: 席が無い人(会場が満席・会場に居ない人)の吹き出し。以前は会場の下端から決めた座標に出し、
    //   診断の行に被ったり PICK UP より下(会場の外)に出たりしていた(実機)。一覧の見えている下の縁に、名前付きで出す。
    const v = rel(p.viewport.getBoundingClientRect(), L);
    const x = Math.min(Math.max(p.fallback.x, v.left + 24), v.right - 24);
    anchor = { left: x - 1, top: v.bottom - 2, right: x + 1, bottom: v.bottom - 2 };
    away = true;
    edge = 'bottom';
  } else if (p.fallback) {
    anchor = { left: p.fallback.x - 1, top: p.fallback.y, right: p.fallback.x + 1, bottom: p.fallback.y };
  } else {
    return null;
  }
  bubbleEl.classList.toggle('nlsb-bubble--away', away);
  bubbleEl.classList.toggle('nlsb-bubble--seatless', !anchorEl && !!p.viewport);
  const w = bubbleEl.offsetWidth || 160;
  const h = bubbleEl.offsetHeight || 40;
  const obstacles = [];
  for (const o of p.obstacleEls) {
    if (!o.el || !o.el.isConnected) continue;
    let r = rel(o.el.getBoundingClientRect(), L);
    if (o.clipTo) {
      // 一覧の中の案内文は、一覧のスクロールで見えている部分だけを避ける。
      // ★v0.1.1761: 以前は「話した人の席を切り取る枠」で切っていた。その枠には段(.nl-story-userlane・overflow:auto)
      //   自身が入るため、段の外にある案内文は面積0になって避ける物から消え、たぬ姉段の真上の案内文に被っていた(実機)。
      const c = rel(o.clipTo.getBoundingClientRect(), L);
      r = { left: Math.max(r.left, c.left), top: Math.max(r.top, c.top), right: Math.min(r.right, c.right), bottom: Math.min(r.bottom, c.bottom) };
    }
    if (r.right > r.left && r.bottom > r.top) obstacles.push({ ...r, weight: o.weight });
  }
  for (const r of p.otherBubbles) obstacles.push({ ...r, weight: VENUE_BUBBLE_OBSTACLE_WEIGHTS.bubble });
  const vw = Math.min(L.width, (globalThis.innerWidth || L.width) - L.left);
  const pl = chooseBubblePlacement({
    anchor,
    size: { w, h },
    bounds: { left: 8, top: 8, right: Math.max(16, vw - 8), bottom: Math.max(16, L.height - 8) },
    obstacles,
    home: p.seating ? rel(p.seating.getBoundingClientRect(), L) : null,
    outsideWeight: 0.5,
    gap: away ? 4 : 10,
    sides: edge === 'bottom' ? ['top'] : edge === 'top' ? ['bottom'] : undefined,
    prefer: p.prefer || null
  });
  bubbleEl.dataset.side = pl.side;
  bubbleEl.style.setProperty('--nlsb-bubble-tail', `${pl.tail}px`);
  bubbleEl.style.left = `${pl.left}px`;
  // 吹き出しは translateY(-100%)(既存のアニメと共通)=top には下端を書く。
  bubbleEl.style.top = `${pl.top + h}px`;
  return { box: { left: pl.left, top: pl.top, right: pl.left + w, bottom: pl.top + h }, side: pl.side };
}
