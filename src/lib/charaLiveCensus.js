/**
 * charaLiveCensus.js
 *
 * 「キャラライブが本当に画面に出ているか」を **実測** して1行にする計器。
 *
 * なぜ要るか(2026-08-25・3回連続で外した反省):
 *   キャラが出ない不具合を、コードを読んで推測で3回直して3回とも外した。
 *   ・1回目: body直下 z2147483000 が会場ルートと同値で負けていた
 *   ・2回目: stage内 z6 が rosterPanel(同じz6・後から入る)に負けていた
 *   ・3回目: ↑を直しても出なかった(原因未特定のまま)
 *   毎回「直したはず」で送り、ユーザーに「でません」と言わせていた。
 *
 *   ★足りなかったのは腕ではなく【事実】。要素があるか / 見えているか / どこに何pxで
 *   いるか を実測して持ってくれば、推測の往復は起きない。
 *   このリポの既存 venueDomCensus.js / venueGeometryVerdict.js と同じ思想
 *   (「測ってから言う」)。
 *
 * 純関数ではないが(DOM を読む)、**読むだけで一切書き換えない**。
 * 判定ロジックは下の verdict 関数に分離してテスト可能にする。
 */

/**
 * @typedef {{
 *   mounted: boolean,        // .nlcl-stage が DOM に居るか
 *   parent: string,          // 親要素のクラス(どこに刺さったか)
 *   inVenueStage: boolean,   // 会場ステージの中に居るか
 *   hidden: boolean,         // hidden 属性が付いているか
 *   display: string,         // 実際の display(none なら見えない)
 *   visibility: string,      // 実際の visibility
 *   opacity: string,         // 実際の opacity
 *   zIndex: string,          // 実際の z-index
 *   rect: { x: number, y: number, w: number, h: number },  // 実際の位置と大きさ
 *   charaCount: number,      // 子キャラの数(3 のはず)
 *   imgLoaded: number,       // 画像が実際に読めた数
 *   imgBroken: number,       // 読めなかった数
 *   coveredBy: string        // キャラ中心の最前面要素(自分でなければ覆われている)
 * }} CharaLiveCensus
 */

/**
 * キャラライブの実測を採る。DOM は読むだけ。
 *
 * @param {Document} doc
 * @returns {CharaLiveCensus}
 */
export function collectCharaLiveCensus(doc) {
  /** @type {CharaLiveCensus} */
  const out = {
    mounted: false,
    parent: '',
    inVenueStage: false,
    hidden: false,
    display: '',
    visibility: '',
    opacity: '',
    zIndex: '',
    rect: { x: 0, y: 0, w: 0, h: 0 },
    charaCount: 0,
    imgLoaded: 0,
    imgBroken: 0,
    coveredBy: ''
  };
  const el = doc?.querySelector?.('.nlcl-stage');
  if (!el) return out;

  out.mounted = true;
  out.parent = String(el.parentElement?.className || '(なし)');
  out.inVenueStage = !!el.closest?.('.nlsb-stage');
  out.hidden = el.hasAttribute?.('hidden') === true;

  const view = doc.defaultView;
  if (view?.getComputedStyle) {
    const cs = view.getComputedStyle(el);
    out.display = cs.display;
    out.visibility = cs.visibility;
    out.opacity = cs.opacity;
    out.zIndex = cs.zIndex;
  }

  if (typeof el.getBoundingClientRect === 'function') {
    const r = el.getBoundingClientRect();
    out.rect = {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height)
    };
  }

  /** @type {ArrayLike<Element>} */
  const charas = el.querySelectorAll?.('.nlcl-chara') || [];
  out.charaCount = charas.length;
  for (const c of Array.from(charas)) {
    const img = c.querySelector?.('img');
    if (!img) continue;
    // naturalWidth>0 なら実際に読めている(src が付いているだけでは判らない)。
    if (img.complete && img.naturalWidth > 0) out.imgLoaded += 1;
    else if (img.complete) out.imgBroken += 1;
  }

  // ★覆われ検出: キャラの中心座標で最前面に居る要素を引く。
  //   自分(または自分の子孫)でなければ、何かに覆われている＝見えていない。
  //   3回外した原因が毎回これだったので、名前で出す。
  if (out.rect.w > 0 && typeof doc.elementFromPoint === 'function') {
    const cx = out.rect.x + out.rect.w / 2;
    const cy = out.rect.y + out.rect.h / 2;
    const top = doc.elementFromPoint(cx, cy);
    if (top && !el.contains(top) && top !== el) {
      out.coveredBy = String(top.className || top.tagName || '?');
    }
  }
  return out;
}

/**
 * 実測から「見えているか」を判定し、見えないなら **理由を名指しする**。
 *
 * 「出ません」に対して「原因はこれです」と即答できるようにするのが目的。
 * 推測を混ぜない: 実測値だけから言えることしか言わない。
 *
 * @param {CharaLiveCensus} c
 * @returns {{ visible: boolean, reason: string, line: string }}
 */
export function charaLiveVerdict(c) {
  /** @param {string} reason */
  const ng = (reason) => ({
    visible: false,
    reason,
    line: `キャラライブ ❌ ${reason}`
  });

  if (!c || !c.mounted) return ng('DOMに存在しない(起動コードが走っていない)');
  if (!c.inVenueStage) return ng(`会場ステージの外にある(親=${c.parent})`);
  if (c.hidden) return ng('hidden 属性が付いている(会場が閉じている扱い)');
  if (c.display === 'none') return ng('display:none になっている');
  if (c.visibility === 'hidden') return ng('visibility:hidden になっている');
  if (c.opacity === '0') return ng('opacity:0 になっている');
  if (c.rect.w === 0 || c.rect.h === 0) return ng('大きさが 0(レイアウトされていない)');
  if (c.charaCount === 0) return ng('中にキャラが1体もいない');
  if (c.imgLoaded === 0) return ng(`画像が1枚も読めていない(壊れ${c.imgBroken}枚)`);
  if (c.coveredBy) return ng(`「${c.coveredBy}」に覆われている(z-index=${c.zIndex})`);

  return {
    visible: true,
    reason: '',
    line:
      `キャラライブ ✅ ${c.charaCount}体 表示中 ` +
      `(z=${c.zIndex} ${c.rect.w}x${c.rect.h} @${c.rect.x},${c.rect.y} 画像${c.imgLoaded}枚)`
  };
}
