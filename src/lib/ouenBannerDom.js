/**
 * 応援動画バナーを DOM に反映する。
 *
 * ★popup-entry.js は 22,000行超なので、ここに切り出す（max-lines ラチェット対策も兼ねる）。
 * ★fail-closed: 例外が出ても **拡張の本体機能を絶対に止めない**。
 *   バナーは「あると嬉しい」ものであって、本体より優先しない。
 */
import { decideOuenBanner } from './ouenBanner.js';

/**
 * @param {Document} doc
 * @param {() => Promise<unknown>} loadJson JSONを読む関数（テストで差し替える）
 */
export async function applyOuenBanner(doc, loadJson) {
  try {
    const el = doc.getElementById('ouenBanner');
    if (!el) return false;

    let raw = null;
    try {
      raw = await loadJson();
    } catch {
      return false;                 // ★読めなければ出さない
    }

    const d = decideOuenBanner(raw);
    if (!d.show) return false;

    const t = doc.getElementById('ouenBannerTitle');
    const n = doc.getElementById('ouenBannerNote');
    const w = doc.getElementById('ouenBannerWhen');
    if (t) t.textContent = d.title;
    if (n) n.textContent = d.note;
    if (w) w.textContent = d.when;
    // ★textContent で入れる（innerHTML を使わない＝JSONに何が来ても描画されない）
    el.setAttribute('href', d.url);
    el.removeAttribute('hidden');
    return true;
  } catch {
    return false;
  }
}

/**
 * popup-entry から呼ぶ入口。
 *
 * ★popup-entry.js は max-lines ラチェットで1行も増やせないため、
 *   「JSONの取り方」までこちら側に閉じ込めて、呼び出しを1行にする。
 * ★await しない（本体の描画を1msも待たせない）。失敗しても黙って何もしない。
 *
 * @param {Document} doc
 */
export function mountOuenBanner(doc) {
  void applyOuenBanner(doc, () =>
    fetch(chrome.runtime.getURL('data/ouen-banner.json')).then((r) => r.json()));
}
