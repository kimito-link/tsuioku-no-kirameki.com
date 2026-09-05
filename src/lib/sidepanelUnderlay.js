/**
 * sidepanelUnderlay.js — サイドパネルの【下敷き】。黒の代わりに地の色を見せる。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ ★これは「幕(cloak)」ではない(混同すると12版の失敗を繰り返す)
 *   [[cloakNotForSidePanel]] が禁じたのは **中身を隠す幕**
 *   (`.nl-popup-primary { opacity: 0 }` で本体を覆い、JS で解除するもの)。
 *   解除が遅れて t+917ms まで隠れ、それが「黒」に見えていた。
 *   ＝**防げない白を防ごうとして、防げる黒を作っていた**。
 *
 *   ここで足すのは逆向きのもの:
 *     - **中身を隠さない**(iframe より【下】に敷く。z-index も重ねも使わない)
 *     - **JS で解除しない**(解除する必要が無い。ずっと敷きっぱなしでよい)
 *     - 役割は「iframe が透明/未commit の間、その下にクリーム色を見せる」だけ
 *   ★解除処理が無い = 解除が遅れて黒くなる事故が原理的に起きない。
 *
 * ■ なぜ要るか(2026-08-18・v0.1.1437 の残課題)
 *   v0.1.1437 で「iframe を opacity:0 で隠し、CSS アニメで必ず開く」ようにした。
 *   実測で【永久固着は消えた】が、
 *   ★メインスレッドが固まっている**間**は CSS アニメも進まない(実測済み)。
 *   その間 iframe は透明のまま = その下に何も無ければ **UA の既定色(ダークなら黒)** が出る。
 *   → **下に地の色を敷いておけば、黒の代わりにクリーム色が見える**。
 *
 * ■ ★JS を1行も使わない
 *   真因が「JS が動けない時間帯」なのだから、対策を JS に置いてはいけない
 *   [[js-rescue-cannot-run-when-loop-stalls-2026-08-18]]。
 *   下敷きは HTML+CSS のみで成立する(この module は検査用の契約を持つだけ)。
 *
 * @module sidepanelUnderlay
 */

/** 下敷きの色。popup.html / sidepanel.html の地と同値(3箇所で一致させる)。 */
export const UNDERLAY_COLOR = '#fffaf2';

/** 下敷きの要素に付ける印(HTML/CSS と機械照合するための鍵)。 */
export const UNDERLAY_ID = 'nl-underlay';

/**
 * 下敷きの設計が「幕」に退化していないかを判定する。★構造で返す。
 *
 * ★ここが緑である限り、[[cloakNotForSidePanel]] の禁を破っていない:
 *   - 中身の上に重ならない(iframe より下)
 *   - JS による解除を持たない(解除漏れで隠れっぱなしにならない)
 *
 * @param {{
 *   coversContent?: boolean,
 *   revealedByJs?: boolean,
 *   hasColor?: boolean
 * }} spec
 * @returns {{ ok: boolean, reason: 'ok'|'covers-content'|'js-reveal'|'no-color' }}
 */
export function judgeUnderlaySpec(spec) {
  const s = spec && typeof spec === 'object' ? spec : {};
  // ★中身を覆うなら、それは下敷きではなく幕。禁止。
  if (s.coversContent === true) return { ok: false, reason: 'covers-content' };
  // ★JS で解除するものは、JS が動けない時間帯に効かない=作った意味が無い。
  if (s.revealedByJs === true) return { ok: false, reason: 'js-reveal' };
  if (s.hasColor !== true) return { ok: false, reason: 'no-color' };
  return { ok: true, reason: 'ok' };
}
