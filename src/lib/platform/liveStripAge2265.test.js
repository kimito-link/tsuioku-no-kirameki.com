/**
 * v0.1.2265: 会場の帯の「経過」と「再生」(ライブ・アーカイブ)。
 *   実ページ(YouTube の 2022 年に始まった 24 時間配信のアーカイブ jfKfPfyJRdk)で「再生 読み込み中」「経過 38380時間9分」と出た。
 *   7日以内の経過・ライブの帯は今まで通り。
 */
import { describe, expect, it } from 'vitest';
import { formatOfficialStreamAgeMinutes } from '../formatOfficialStreamAgeMinutes.js';
import { venueItemsForPlatform } from './platformMetrics.js';
import { ytSummaryToNicoSnapshot } from '../../../extension-youtube/src/ytNicoShim.js';

const LIVE_PLATFORMS = ['youtube', 'twitch', 'kick', 'twitcasting', 'tiktok', 'showroom', 'abema'];
const bag = (/** @type {any} */ facts, concurrent = { text: '—', isPlaceholder: true }) => ({
  records: { text: '12', isPlaceholder: false },
  concurrent,
  streamAge: { text: formatOfficialStreamAgeMinutes(38380 * 60 + 9) || '—', isPlaceholder: false },
  facts,
});

describe('経過の文字(どのサービスも同じ読み口)', () => {
  it.each([[0, '0分'], [59, '59分'], [61, '1時間1分'], [1440, '24時間'], [10079, '167時間59分']])('7日未満は今まで通り %s分 → %s', (m, want) => {
    expect(formatOfficialStreamAgeMinutes(m)).toBe(want);
  });
  it('7日を超える経過は日・年で(NNNNN時間にしない)', () => {
    const t = formatOfficialStreamAgeMinutes(38380 * 60 + 9);
    expect(t).toBe('4年139日');
    expect(t).not.toMatch(/\d{4,}時間/);
    expect(formatOfficialStreamAgeMinutes(10081)).toBe('7日');
  });
  it.each([[10080, '7日'], [10081, '7日'], [38380 * 60, '4年139日'], [38380 * 60 + 9, '4年139日']])('7日ちょうど以上は日・年 %s分 → %s', (m, want) => {
    expect(formatOfficialStreamAgeMinutes(m)).toBe(want);
  });
});

describe.each(LIVE_PLATFORMS)('%s の会場の帯', (platform) => {
  it('アーカイブ(live_replay)は経過を出さず、読めない再生を「読み込み中」で止めない', () => {
    const items = venueItemsForPlatform(platform, bag({ contentKind: 'live_replay', isLive: false })) || [];
    expect(items.some((it) => it.key === 'streamAge')).toBe(false);
    expect(items.some((it) => it.key === 'concurrent' && it.isPlaceholder)).toBe(false);
    expect(items.some((it) => it.key === 'records')).toBe(true);
  });
  it('ライブの帯は今まで通り(記録・同時・経過。読めない同時は読み込み中のまま)', () => {
    const items = venueItemsForPlatform(platform, bag({ contentKind: 'live', viewers: null })) || [];
    expect(items.slice(0, 3).map((it) => it.key)).toEqual(['records', 'concurrent', 'streamAge']);
  });
});

describe('YouTube のアーカイブ', () => {
  it('再生数が読めたら「再生 N回」', () => {
    const items = venueItemsForPlatform('youtube', bag({ contentKind: 'live_replay', isLive: false, viewCount: 651847121 })) || [];
    const c = items.find((it) => it.key === 'concurrent');
    expect(c && `${c.label} ${c.text}${c.unit}`).toBe('再生 651,847,121回');
  });
  const start = Date.parse('2022-07-12T15:59:30Z');
  it('終わった時刻の無いアーカイブは、開始からの経過を作らない', () => {
    const s = ytSummaryToNicoSnapshot({ contentKind: 'live_replay', isLive: false, startedAt: start, slotViewCount: 651847121 }, 'jfKfPfyJRdk', '', {});
    expect(s.streamAgeMin).toBe(null);
    expect(s.platformFacts.viewCount).toBe(651847121);
  });
  it('配信中は今まで通り開始からの経過', () => {
    const now = Date.now();
    const s = ytSummaryToNicoSnapshot({ contentKind: 'live', isLive: true, startedAt: now - 90 * 60_000, concurrentViewers: 120 }, 'abcdefghijk', '', {});
    expect(s.streamAgeMin).toBe(90);
  });
});

describe('5,000万回を超える再生数(実ページ jfKfPfyJRdk は 651,847,121 回)', async () => {
  const { mergeYtStreamSummary } = await import('../youtube/ytStreamStorePolicy.js');
  it('まとめに残し、アーカイブの帯に「再生」を出す', () => {
    const sum = mergeYtStreamSummary(null, { videoId: 'jfKfPfyJRdk', contentKind: 'live_replay', isLive: false, isLiveContent: true, slotViewCount: 651847121 }, 1);
    expect(sum.slotViewCount).toBe(651847121);
    const s = ytSummaryToNicoSnapshot(sum, 'jfKfPfyJRdk', '', {});
    const items = venueItemsForPlatform('youtube', bag(s.platformFacts)) || [];
    expect(items.find((it) => it.key === 'concurrent')?.text).toBe('651,847,121');
  });
  it('同時接続は今まで通り 5,000万人を超える数を捨てる', () => {
    const sum = mergeYtStreamSummary(null, { videoId: 'abcdefghijk', contentKind: 'live', isLive: true, concurrentViewers: 60_000_000 }, 1);
    expect(sum.concurrentViewers ?? null).toBe(null);
  });
});
