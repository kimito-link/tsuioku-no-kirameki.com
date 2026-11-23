// @ts-nocheck — ニコ生横欄の「推定（視聴者の購入額）」チップを公式ギフトptから同期する補助。
import { estimateNiconicoGiftSpendJpy, formatEstimatedViewerSpendDisplay } from '../../lib/estimatedViewerSpend.js';

/**
 * ニコ生横欄（.nl-official-nico-stats__row）へ「推定（視聴者の購入額）」チップを同期する。
 * @param {HTMLElement|null} giftValEl #officialStatNicoGiftPts 要素
 * @param {{ text: string, isPlaceholder: boolean }|null} giftChip
 */
export function syncNicoEstimatedViewerSpendChip(giftValEl, giftChip) {
  const row = giftValEl?.closest?.('.nl-official-nico-stats__row');
  if (!row) return;
  const existing = row.querySelector('[data-nl-metric="nicoEstimatedViewerSpend"]');
  const estDisp =
    giftChip && !giftChip.isPlaceholder
      ? formatEstimatedViewerSpendDisplay(estimateNiconicoGiftSpendJpy(giftChip.text))
      : null;
  if (!estDisp) {
    if (existing) existing.remove();
    return;
  }
  let chipEl = existing;
  if (!chipEl) {
    chipEl = row.ownerDocument.createElement('div');
    chipEl.className = 'nl-official-nico-stats__chip';
    chipEl.setAttribute('data-nl-metric', 'nicoEstimatedViewerSpend');
    const lbl = row.ownerDocument.createElement('span');
    lbl.className = 'nl-official-nico-stats__label';
    const val = row.ownerDocument.createElement('span');
    val.className = 'nl-official-nico-stats__val';
    chipEl.append(lbl, val);
    row.appendChild(chipEl);
  }
  const lbl = chipEl.querySelector('.nl-official-nico-stats__label');
  const val = chipEl.querySelector('.nl-official-nico-stats__val');
  if (lbl && lbl.textContent !== estDisp.label) lbl.textContent = estDisp.label;
  if (val && val.textContent !== estDisp.text) val.textContent = estDisp.text;
  if (chipEl.getAttribute('title') !== estDisp.title) chipEl.setAttribute('title', estDisp.title);
}
