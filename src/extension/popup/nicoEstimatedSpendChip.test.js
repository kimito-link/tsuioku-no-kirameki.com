/** @vitest-environment happy-dom */
// ニコ生の横欄にも「推定（配信者の受取）」の欄を、ほかのサービスと同じ並び(推定の後ろ)で出す(v0.1.2225・2026-11-25 りんくさん決定)
import { describe, it, expect } from 'vitest';
import { syncNicoEstimatedViewerSpendChip } from './nicoEstimatedSpendChip.js';

function row() {
  document.body.innerHTML = '<div class="nl-official-nico-stats__row"><div class="nl-official-nico-stats__chip"><span class="nl-official-nico-stats__label">ギフトpt</span><span id="officialStatNicoGiftPts" class="nl-official-nico-stats__val">1,200</span></div></div>';
  return /** @type {HTMLElement} */ (document.getElementById('officialStatNicoGiftPts'));
}
const keys = () => [...document.querySelectorAll('.nl-official-nico-stats__chip')].map((el) => el.getAttribute('data-nl-metric') || 'giftPts');

describe('ニコ生の横欄の受取（推定）', () => {
  it('ギフトptがあるとき: 推定の後ろに「—（公式の率が非公開）」(金額は作らない)', () => {
    const g = row();
    syncNicoEstimatedViewerSpendChip(g, { text: '1,200', isPlaceholder: false });
    expect(keys()).toEqual(['giftPts', 'nicoEstimatedViewerSpend', 'nicoEstimatedStreamerTakeHome']);
    const th = /** @type {HTMLElement} */ (document.querySelector('[data-nl-metric="nicoEstimatedStreamerTakeHome"]'));
    expect(th.textContent).toBe('推定（配信者の受取）—（公式の率が非公開）');
    expect(th.textContent).not.toContain('¥');
    expect(th.getAttribute('title')).toContain('公式に公開していない');
    // 2回目も増えない・並びも同じ
    syncNicoEstimatedViewerSpendChip(g, { text: '1,300', isPlaceholder: false });
    expect(keys()).toEqual(['giftPts', 'nicoEstimatedViewerSpend', 'nicoEstimatedStreamerTakeHome']);
  });
  it('ギフトptがまだ無いとき: 受取の欄だけ出す', () => {
    const g = row();
    syncNicoEstimatedViewerSpendChip(g, { text: '—', isPlaceholder: true });
    expect(keys()).toEqual(['giftPts', 'nicoEstimatedStreamerTakeHome']);
  });
  it('ほかのサービスへ切り替えたら(giftChip なし)ニコ生の受取の欄を外す(二重にしない)', () => {
    const g = row();
    syncNicoEstimatedViewerSpendChip(g, { text: '1,200', isPlaceholder: false });
    syncNicoEstimatedViewerSpendChip(g, null);
    expect(keys()).toEqual(['giftPts']);
  });
});
