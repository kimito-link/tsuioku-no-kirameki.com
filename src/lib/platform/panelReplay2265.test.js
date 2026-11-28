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

// v0.1.2265(Codex P2c): アーカイブの会場の帯は、どのサービスも「再生 N回」= ページの再生数だけ。前の同時視聴者数で埋めない
describe.each(['youtube', 'twitch', 'kick', 'twitcasting', 'tiktok', 'showroom', 'mixch', 'whowatch', 'abema'])('%s: アーカイブの会場の帯', (platform) => {
  const bag = (/** @type {any} */ facts, concurrent = { text: '345', isPlaceholder: false }) => ({
    records: { text: '10', isPlaceholder: false },
    concurrent,
    streamAge: { text: '3時間', isPlaceholder: false },
    facts,
  });
  it('再生数が読めたら「再生 N回」(古い同時視聴者数は使わない)', () => {
    const items = venueItemsForPlatform(platform, bag({ contentKind: 'live_replay', viewers: 345, viewCount: 98765 })) || [];
    const c = items.find((i) => i.key === 'concurrent');
    expect(c).toMatchObject({ label: '再生', text: '98,765', unit: '回', isPlaceholder: false });
    expect(items.filter((i) => i.label === '再生')).toHaveLength(1);
    expect(items.some((i) => i.key === 'streamAge')).toBe(false);
  });
  it('再生数が無ければ欄ごと出さない(同時視聴者数・画面の数で埋めない)', () => {
    const items = venueItemsForPlatform(platform, bag({ contentKind: 'live_replay', viewers: 345 })) || [];
    expect(items.some((i) => i.key === 'concurrent')).toBe(false);
    expect(JSON.stringify(items)).not.toContain('345');
    expect(JSON.stringify(items)).not.toContain('読み込み中');
  });
  it('ライブはそのまま(同時視聴者数の欄)', () => {
    const items = venueItemsForPlatform(platform, bag({ contentKind: 'live', viewers: 345 })) || [];
    const c = items.find((i) => i.key === 'concurrent');
    expect(c?.label).not.toBe('再生');
    expect(items.some((i) => i.key === 'streamAge')).toBe(true);
  });
});

// v0.1.2265(実機の残り): アーカイブでは横の欄の「読み上げ」も押せない(動画と同じ)。どのサービスも同じ。ライブに戻れば押せる
describe.each(['youtube', 'twitch', 'kick', 'twitcasting', 'tiktok', 'showroom'])('%s の横の欄の読み上げボタン', (platform) => {
  const withBtn = () => {
    const root = document.createElement('div');
    root.innerHTML = '<div id="watchConcurrentCard"><span id="watchConcurrentEst">—</span></div><div class="nl-official-nico-stats__row"><span><span id="officialStatNicoStreamAge">—</span></span></div><button id="openComeviewVoiceBtn" type="button">読み上げ</button>';
    document.body.replaceChildren(root);
    return { root, btn: /** @type {HTMLButtonElement} */ (root.querySelector('#openComeviewVoiceBtn')) };
  };
  it('アーカイブでは押せない・ライブに戻ると押せる', () => {
    const { root, btn } = withBtn();
    applyPlatformMetricChrome(root, { platform, facts: { contentKind: 'live_replay', viewCount: 5 } });
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    applyPlatformMetricChrome(root, { platform, facts: { contentKind: 'live', viewers: 3 } });
    expect(btn.disabled).toBe(false);
    expect(btn.hasAttribute('aria-disabled')).toBe(false);
  });
  it('ライブのボタンは触らない・動画が止めたボタンはアーカイブの側で戻さない', () => {
    const { root, btn } = withBtn();
    applyPlatformMetricChrome(root, { platform, facts: { contentKind: 'live', viewers: 3 } });
    expect(btn.disabled).toBe(false);
    btn.disabled = true; btn.setAttribute('data-nl-video-voice-disabled', '1');
    applyPlatformMetricChrome(root, { platform, facts: { contentKind: 'live', viewers: 3 } });
    expect(btn.disabled).toBe(true);
  });
});

describe('venueVoiceSuspendedKind: 会場の声を止める種類(どのサービスも同じ)', () => {
  it.each([['video', true], ['live_replay', true], ['live', false], ['', false], [undefined, false]])('%s → %s', async (kind, want) => {
    const { venueVoiceSuspendedKind } = await import('../venueStatStrip.js');
    expect(venueVoiceSuspendedKind(kind)).toBe(want);
  });
});
