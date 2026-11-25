// @ts-nocheck — ニコ生横欄の「推定（視聴者の購入額）」チップを公式ギフトptから同期する補助。
import { estimateNiconicoGiftSpendJpy, formatEstimatedViewerSpendDisplay, formatStreamerTakeHomeDisplay } from '../../lib/estimatedViewerSpend.js';

/**
 * ニコ生横欄（.nl-official-nico-stats__row）へ「推定（視聴者の購入額）」チップを同期する。
 * @param {HTMLElement|null} giftValEl #officialStatNicoGiftPts 要素
 * @param {{ text: string, isPlaceholder: boolean }|null} giftChip
 */
export function syncNicoEstimatedViewerSpendChip(giftValEl, giftChip) {
  const row = giftValEl?.closest?.('.nl-official-nico-stats__row');
  if (!row) return;
  syncNicoStreamerTakeHomeChip(row, giftChip);
  const existing = row.querySelector('[data-nl-metric="nicoEstimatedViewerSpend"]');
  const estDisp =
    giftChip && !giftChip.isPlaceholder
      ? formatEstimatedViewerSpendDisplay(estimateNiconicoGiftSpendJpy(giftChip.text))
      : null;
  if (!estDisp) {
    if (existing) existing.remove();
    keepTakeHomeLast(row);
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
  keepTakeHomeLast(row);
}

/** 受取の欄は推定の後ろ(推定が無ければギフトptの後ろ)に置く。どのサービスも同じ並び(v0.1.2225) @param {HTMLElement} row */
function keepTakeHomeLast(row) {
  const th = row.querySelector('[data-nl-metric="nicoEstimatedStreamerTakeHome"]');
  if (th && row.lastElementChild !== th) row.appendChild(th);
}

/**
 * ニコ生の「推定（配信者の受取）」の欄。奨励金の計算は非公開なので金額は出さず「—（公式の率が非公開）」(2026-11-25 りんくさん決定)。
 * ニコ生の数字を描くとき(giftChip がある)だけ出し、ほかのサービスへ切り替えたら外す(ほかは platformMetricChrome が出す)。
 * @param {HTMLElement} row
 * @param {{ text: string, isPlaceholder: boolean }|null} giftChip
 */
function syncNicoStreamerTakeHomeChip(row, giftChip) {
  const existing = row.querySelector('[data-nl-metric="nicoEstimatedStreamerTakeHome"]');
  if (!giftChip) {
    if (existing) existing.remove();
    return;
  }
  const d = formatStreamerTakeHomeDisplay('niconico', null);
  let chipEl = existing;
  if (!chipEl) {
    chipEl = row.ownerDocument.createElement('div');
    chipEl.className = 'nl-official-nico-stats__chip';
    chipEl.setAttribute('data-nl-metric', 'nicoEstimatedStreamerTakeHome');
    const lbl = row.ownerDocument.createElement('span');
    lbl.className = 'nl-official-nico-stats__label';
    const val = row.ownerDocument.createElement('span');
    val.className = 'nl-official-nico-stats__val is-placeholder';
    chipEl.append(lbl, val);
    row.appendChild(chipEl);
  }
  const lbl = chipEl.querySelector('.nl-official-nico-stats__label');
  const val = chipEl.querySelector('.nl-official-nico-stats__val');
  if (lbl && lbl.textContent !== d.label) lbl.textContent = d.label;
  if (val && val.textContent !== d.text) val.textContent = d.text;
  if (chipEl.getAttribute('title') !== d.title) chipEl.setAttribute('title', d.title);
}
