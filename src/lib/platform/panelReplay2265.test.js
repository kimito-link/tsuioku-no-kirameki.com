/** @vitest-environment happy-dom */
/**
 * v0.1.2265: 横の欄(サイドパネル)の YouTube のアーカイブ(jfKfPfyJRdk)が「同時視聴者数 読み込み中 / 経過 —」のままだった。
 *   会場の帯と同じ決まり: アーカイブ(live_replay)は 再生 が読めたら出し、同時・経過は隠す(読み込み中で止めない)。
 *   ライブ・ほかのサービスのライブの横の欄は変えない。
 */
import { describe, expect, it } from 'vitest';
import { applyPlatformMetricChrome } from './platformMetricChrome.js';
import { venueItemsForPlatform } from './platformMetrics.js';

function mount() {
  document.body.innerHTML = `
    <div id="liveStatCards">
      <div class="nl-live-stat-card" id="watchConcurrentCard">
        <div class="nl-live-stat-label">推定同時接続</div>
        <div id="watchConcurrentEst">—</div>
      </div>
      <div class="nl-official-nico-stats__row">
        <div class="nl-official-nico-stats__chip"><span class="nl-official-nico-stats__label">経過</span><span id="officialStatNicoStreamAge">—</span></div>
      </div>
    </div>`;
  return document;
}
const shown = (/** @type {Element|null} */ el) => !!el && !(/** @type {HTMLElement} */ (el).hidden);
const ageChip = () => document.querySelector('#officialStatNicoStreamAge')?.parentElement || null;
const viewsChip = () => document.querySelector('[data-nl-metric="views"]');

const PLATFORMS = ['youtube', 'twitch', 'kick', 'twitcasting', 'tiktok', 'showroom'];

describe.each(PLATFORMS)('%s の横の欄', (platform) => {
  it('アーカイブで再生数が読めたら「再生 N回」を出し、同時・経過は隠す', () => {
    const root = mount();
    applyPlatformMetricChrome(root, { platform, facts: { contentKind: 'live_replay', isLive: false, viewCount: 651847121 } });
    expect(shown(root.querySelector('#watchConcurrentCard'))).toBe(false);
    expect(shown(ageChip())).toBe(false);
    const v = viewsChip();
    expect(v?.textContent).toContain('再生');
    expect(v?.textContent).toContain('651,847,121');
    expect(root.body.textContent).not.toContain('読み込み中');
  });
  it('アーカイブで再生数が読めないときも、読み込み中で止めずに隠す', () => {
    const root = mount();
    applyPlatformMetricChrome(root, { platform, facts: { contentKind: 'live_replay', isLive: false } });
    expect(shown(root.querySelector('#watchConcurrentCard'))).toBe(false);
    expect(shown(ageChip())).toBe(false);
    expect(viewsChip()).toBe(null);
  });
  it('ライブの横の欄は今まで通り(同時・経過を出す・再生は足さない)、アーカイブからライブへ戻ると戻す', () => {
    const root = mount();
    applyPlatformMetricChrome(root, { platform, facts: { contentKind: 'live_replay', viewCount: 5 } });
    applyPlatformMetricChrome(root, { platform, facts: { contentKind: 'live', viewers: 120 } });
    expect(shown(root.querySelector('#watchConcurrentCard'))).toBe(true);
    expect(shown(ageChip())).toBe(true);
    expect(viewsChip()).toBe(null);
  });
  it('会場の帯は再生を1つだけ(横の欄の再生のチップを二重に足さない)', () => {
    const items = venueItemsForPlatform(platform, {
      records: { text: '0', isPlaceholder: false }, concurrent: { text: '—', isPlaceholder: true },
      streamAge: { text: '—', isPlaceholder: true }, facts: { contentKind: 'live_replay', viewCount: 651847121 },
    }) || [];
    expect(items.filter((it) => it.label === '再生').length).toBeLessThanOrEqual(1);
  });
});
