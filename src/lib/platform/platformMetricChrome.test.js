/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { applyPlatformMetricChrome, watchPlatformMetricChrome } from './platformMetricChrome.js';
import { tallySupportItems } from './platformMetrics.js';

function mount() {
  document.body.innerHTML = `
    <div id="liveStatCards">
      <div class="nl-live-stat-card" id="watchConcurrentCard">
        <img class="nl-live-stat-icon" title="広告ランキングのレーンへ移動" alt="" />
        <div class="nl-live-stat-label">推定同時接続</div>
        <div id="watchConcurrentEst">108</div>
        <div id="watchConcurrentLoading" aria-label="推定同時接続を読み込み中"></div>
      </div>
      <div class="nl-live-stat-card nl-live-stat-card--visitors">
        <div class="nl-live-stat-label">来場者数</div>
        <div id="watchViewerDom">（数字非公開）</div>
      </div>
      <div class="nl-official-nico-stats__row" aria-label="公式視聴統計の一覧">
        <div class="nl-official-nico-stats__chip"><span class="nl-official-nico-stats__label">来場</span><span id="officialStatNicoViewers">108</span></div>
        <div class="nl-official-nico-stats__chip"><span class="nl-official-nico-stats__label">本家コメ</span><span id="officialStatNicoComments">—</span><span id="officialStatNicoCommentsRate"></span></div>
        <div class="nl-official-nico-stats__chip"><span class="nl-official-nico-stats__label">経過</span><span id="officialStatNicoStreamAge">15分</span></div>
        <div class="nl-official-nico-stats__chip"><span class="nl-official-nico-stats__label">広告pt</span><span id="officialStatNicoAdPts">—</span></div>
        <div class="nl-official-nico-stats__chip"><span class="nl-official-nico-stats__label">ギフトpt</span><span id="officialStatNicoGiftPts">—</span></div>
      </div>
    </div>
    <section id="northStarLanes">
      <div data-nl-trio-slot="konta" title="こん太（広告ランキング）"></div>
      <div data-lane="contributionRanking"><p class="nl-north-star-lane__label">ギフト貢献度</p><p class="nl-north-star-lane__sublabel">ニコニコ公式</p></div>
      <div data-lane="giftHistory">
        <p class="nl-north-star-lane__label">この番組へのギフト履歴<span id="giftHistoryProgramPt">公式累計</span></p>
        <p class="nl-north-star-lane__sublabel">履歴</p>
      </div>
      <div data-lane="adRanking"></div>
      <div data-lane="programPoints"></div>
      <div data-lane="eventRank"></div>
      <div data-lane="eventScore"></div>
      <div data-lane="eventVotingSupporters"></div>
      <p class="nl-north-star-lanes__note">公式ページで見えている値を写します。</p>
      <p id="northStarLaneGadgetSummary-giftHistory"><span class="nl-north-star-lane__summary-note">公式番組累計（プレイヤー表示と同じ）</span></p>
    </section>
    <div id="giftRankingFetchPrompt"></div>
    <a id="watchOfficialEventBannerCard"></a>
  `;
  return document;
}

describe('applyPlatformMetricChrome', () => {
  it('数が来る前のニコ生の札(（接続中…）・推定中・—)は、ほかのサービスでは読み込み中にする', () => {
    for (const t of ['（接続中…）', '（取得不可）', '推定中', '—', '~120']) {
      const root = mount();
      root.querySelector('#watchConcurrentEst').textContent = t;
      applyPlatformMetricChrome(root, { platform: 'youtube', facts: {} });
      expect(root.querySelector('#watchConcurrentEst').textContent).toBe('読み込み中');
    }
    const root = mount();
    root.querySelector('#watchConcurrentEst').textContent = '8,664';
    applyPlatformMetricChrome(root, { platform: 'youtube', facts: {} });
    expect(root.querySelector('#watchConcurrentEst').textContent).toBe('8,664');
  });

  it('YouTube ではニコ生のチップを隠し、このPCの合計を足す', () => {
    const root = mount();
    applyPlatformMetricChrome(root, {
      platform: 'youtube',
      facts: {
        streamAgeProvenance: 'official',
        support: tallySupportItems([{ kind: 'superchat', amount: 500, currency: 'JPY' }, { kind: 'membership' }]),
      },
    });
    expect(root.querySelector('.nl-live-stat-card--visitors').hidden).toBe(true);
    expect(root.querySelector('#watchConcurrentCard .nl-live-stat-label').textContent).toBe('同時視聴者数');
    expect(root.querySelector('#officialStatNicoAdPts').parentElement.hidden).toBe(true);
    expect(root.querySelector('#officialStatNicoViewers').parentElement.hidden).toBe(true);
    expect(root.querySelector('#officialStatNicoComments').parentElement.hidden).toBe(true);
    expect(root.querySelector('#officialStatNicoGiftPts').parentElement.hidden).toBe(true);
    expect(root.querySelector('#officialStatNicoStreamAge').parentElement.hidden).toBe(false);
    expect(root.querySelector('[data-nl-metric="superchat"] .nl-official-nico-stats__val').textContent).toBe('¥500');
    expect(root.querySelector('[data-nl-metric="members"]')).toBeNull();
    expect(root.documentElement.classList.contains('nl-cap-youtube')).toBe(true);
    expect(root.querySelector('[data-lane="adRanking"]').hidden).toBe(true);
    expect(root.querySelector('#giftRankingFetchPrompt').hidden).toBe(true);
    expect(root.querySelector('[data-lane="contributionRanking"] .nl-north-star-lane__label').textContent).toContain('スパチャの合計順');
    expect(root.querySelector('[data-lane="contributionRanking"] .nl-north-star-lane__sublabel').textContent).toBe('ニコニコ公式');
    expect(root.querySelector('#giftHistoryProgramPt').hidden).toBe(true);
    expect(root.querySelector('[data-lane="giftHistory"] .nl-north-star-lane__label').textContent).toContain('スーパーチャット・ギフト');
    expect(root.querySelector('[data-nl-trio-slot="konta"]').getAttribute('title')).not.toContain('広告');
    expect(root.querySelector('#watchConcurrentCard .nl-live-stat-icon').getAttribute('title')).not.toContain('広告');
  });

  it('記録にスパチャが1件も無いうちはギフト欄を出さず、来たら出す', () => {
    const root = mount();
    applyPlatformMetricChrome(root, { platform: 'youtube', facts: { support: tallySupportItems([]) } });
    expect(document.documentElement.hasAttribute('data-nl-gift-has')).toBe(false);
    applyPlatformMetricChrome(root, { platform: 'youtube', facts: { support: tallySupportItems([{ kind: 'superchat', amount: 500, currency: 'JPY' }]) } });
    expect(document.documentElement.getAttribute('data-nl-gift-has')).toBe('1');
    applyPlatformMetricChrome(root, { platform: 'youtube', facts: { support: null } });
    expect(document.documentElement.getAttribute('data-nl-gift-has')).toBe('1');
    const css = document.getElementById('nl-platform-capability-style')?.textContent || '';
    expect(css).toContain('html.nl-cap-foreign:not([data-nl-gift-has="1"]) .nl-north-star-gift-stack{display:none!important;}');
  });

  it('ニコ生以外では、中身の無いギフト欄の点線の枠を出さない', () => {
    const root = mount();
    applyPlatformMetricChrome(root, { platform: 'abema', facts: {} });
    const css = document.getElementById('nl-platform-capability-style')?.textContent || '';
    expect(css).toContain('html.nl-cap-foreign .nl-north-star-gift-stack:not(:has(> [data-lane="giftHistory"]:not([hidden])))');
  });

  it('欄を出し直しても、次の適用でまた隠す', async () => {
    const root = mount();
    const stop = watchPlatformMetricChrome(root, () => ({ platform: 'twitch', facts: { support: null } }));
    await new Promise((r) => requestAnimationFrame(() => r()));
    expect(root.querySelector('[data-lane="adRanking"]').hidden).toBe(true);
    root.querySelector('#giftRankingFetchPrompt').hidden = false;
    await new Promise((r) => requestAnimationFrame(() => r()));
    await new Promise((r) => requestAnimationFrame(() => r()));
    expect(root.querySelector('#giftRankingFetchPrompt').hidden).toBe(true);
    expect(root.querySelector('[data-nl-metric="superchat"]')).toBeNull();
    stop();
  });

  it('ニコ生の状態では何も隠さない', () => {
    const root = mount();
    applyPlatformMetricChrome(root, { platform: 'niconico', facts: {} });
    expect(root.querySelector('.nl-live-stat-card--visitors').hidden).toBe(false);
    expect(root.querySelector('#officialStatNicoAdPts').parentElement.hidden).toBe(false);
    expect(root.querySelector('#watchConcurrentCard .nl-live-stat-label').textContent).toBe('推定同時接続');
  });
});
