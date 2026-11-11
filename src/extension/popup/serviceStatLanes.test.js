/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';
import { applyUnpublishedStatChips, rememberServiceStatSnapshot, setNorthStarLaneHidden } from './serviceStatLanes.js';

const abema = {
  serviceMetrics: {
    visitors: false,
    officialComments: true,
    commentLabel: 'コメント',
    adPoints: false,
    giftPoints: false,
    paidRank: false,
    giftHistory: false,
    estimateConcurrent: false,
    programViews: true,
  },
  slotCommentCount: 1339,
  slotViewCount: 16000,
};

function mount() {
  document.body.innerHTML = `
    <div class="nl-official-nico-stats__chip"><span class="nl-official-nico-stats__label">来場</span><b id="officialStatNicoViewers">—</b></div>
    <div class="nl-official-nico-stats__chip"><span class="nl-official-nico-stats__label">本家コメ</span><b id="officialStatNicoComments">—</b></div>
    <div class="nl-official-nico-stats__chip"><span class="nl-official-nico-stats__label">広告pt</span><b id="officialStatNicoAdPts">—</b></div>
    <div class="nl-official-nico-stats__chip"><span class="nl-official-nico-stats__label">ギフトpt</span><b id="officialStatNicoGiftPts">—</b></div>
    <section class="nl-north-star-lane" data-lane="contributionRanking">ギフトの合計順</section>
    <section class="nl-north-star-lane" data-lane="giftHistory">ギフト履歴</section>
    <section class="nl-north-star-lane" data-lane="adRanking">広告</section>
  `;
}

describe('ABEMA では公開している数字だけ残す', () => {
  it('来場・広告pt・ギフトpt と順位レーンを隠し、コメントは残す', () => {
    mount();
    rememberServiceStatSnapshot(abema);
    applyUnpublishedStatChips(abema);
    expect(document.getElementById('officialStatNicoViewers').closest('.nl-official-nico-stats__chip').hidden).toBe(true);
    expect(document.getElementById('officialStatNicoAdPts').closest('.nl-official-nico-stats__chip').hidden).toBe(true);
    expect(document.getElementById('officialStatNicoGiftPts').closest('.nl-official-nico-stats__chip').hidden).toBe(true);
    const comments = document.getElementById('officialStatNicoComments').closest('.nl-official-nico-stats__chip');
    expect(comments.hidden).toBe(false);
    expect(comments.querySelector('.nl-official-nico-stats__label').textContent).toBe('コメント');
    expect(document.querySelector('[data-lane="contributionRanking"]').hidden).toBe(true);
    expect(document.querySelector('[data-lane="giftHistory"]').hidden).toBe(true);
    expect(document.querySelector('[data-lane="adRanking"]').hidden).toBe(true);
    setNorthStarLaneHidden('giftHistory', false);
    expect(document.querySelector('[data-lane="giftHistory"]').hidden).toBe(true);
  });
});
