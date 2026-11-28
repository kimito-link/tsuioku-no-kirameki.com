// v0.1.2266(Codex 最終): 会場で配信を替えたあと、ニコ生の読み上げの許可がもとに戻らなかった。
//   ニコ生の会場は種類(contentKind)を出さないので、配信の切り替えで止めた許可を戻す道が無かった。master は止めない。
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { VoicePlayer } from './voicePlayer.js';
import { venueVoicePageGate } from './venueStatStrip.js';

function makePlayer() {
  const storage = { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue() };
  return new VoicePlayer({
    storage,
    storageOnChanged: { addListener: () => {} },
    isObsMode: () => false,
    audioConstructor: function () { return { play: vi.fn().mockResolvedValue(), pause: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }; },
    createObjectURL: vi.fn().mockReturnValue('blob:x'),
    revokeObjectURL: vi.fn(),
    fetchVoicevoxAlive: vi.fn().mockResolvedValue(true),
    fetchVoiceStyleIds: vi.fn().mockResolvedValue([1, 2]),
    fetchSynthesizeVoice: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    resolveVoice: vi.fn().mockReturnValue({ speaker: 1, speedOffset: 0 }),
  });
}

/** venueBar の配線と同じ順で呼ぶ(配信の切り替え = resetVenueForLive は全サービスで setPageTarget、帯の描き直し = paint)。 */
function wire(p, platform) {
  return {
    reset: (liveId) => { p.setPageTarget(liveId); },
    paint: (contentKind, url = '') => { const g = venueVoicePageGate(contentKind, platform, url); if (g !== null) p.setPageAllowed(g); },
  };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

const TW_LIVE = 'https://www.twitch.tv/chanA';
const TW_VOD = 'https://www.twitch.tv/videos/123456789';
const KK_LIVE = 'https://kick.com/chana';
const KK_VOD = 'https://kick.com/chana/videos/01a20f53-aaaa-bbbb';
const TC_LIVE = 'https://twitcasting.tv/usera';
const TC_VOD = 'https://twitcasting.tv/usera/movie/123456';

async function playing(p) {
  await p.initialize();
  await p.enable({ persist: false }); await flush();
  p.enqueue([{ kind: 'comment', text: '旧ページの声', nickname: 'a', userId: '1' }]);
}

describe('ニコ生の会場: 配信を替えても読み上げの許可は master と同じ', () => {
  it('nico → 別の配信 → nico: 許可は ON のまま戻る(種類が空でも)', async () => {
    const p = makePlayer(); await p.initialize();
    const v = wire(p, undefined);
    v.reset('lv100'); v.paint('');
    await p.enable({ persist: false }); await flush();
    v.reset('lv200'); expect(p.pageAllowed).toBe(false); v.paint('');
    v.reset('lv100'); v.paint(''); await flush();
    expect(p.pageAllowed).toBe(true);
    expect(p.readingWanted).toBe(true);
    expect(p.enabled).toBe(true);
  });
  it('ニコ生でも動画(video)の種類が来たら止め、ライブに戻ったら出す', async () => {
    const p = makePlayer(); await p.initialize();
    const v = wire(p, undefined);
    v.reset('lv1'); await p.enable({ persist: false }); await flush();
    v.paint('video'); expect(p.pageAllowed).toBe(false);
    v.paint(''); await flush(); expect(p.pageAllowed).toBe(true);
  });
});

describe.each([
  ['twitch', TW_LIVE, TW_VOD],
  ['kick', KK_LIVE, KK_VOD],
  ['twitcasting', TC_LIVE, TC_VOD],
])('%s: 切り替えで旧ページの声を捨て、録画なら止めたまま・ライブなら戻す', (plat, live, vod) => {
  it('ライブA → 録画B(Bの写しはまだ無い): 旧い声と待ちを止め、許可は false', async () => {
    const p = makePlayer(); const stop = vi.spyOn(p, 'stop');
    await playing(p);
    const v = wire(p, plat);
    v.reset('A'); v.paint('', live); await flush();
    v.reset('B'); v.paint('', vod); // B の鏡・self は未着 = 種類は空
    expect(p.pageAllowed).toBe(false);
    expect(p.enabled).toBe(false);
    expect(p.queue.length).toBe(0);
    expect(stop).toHaveBeenCalled();
    expect(p.readingWanted).toBe(true); // 意思は残す
  });
  it('録画A → 録画B: 止めたまま', async () => {
    const p = makePlayer(); await p.initialize();
    const v = wire(p, plat);
    v.reset('A'); v.paint('', vod); expect(p.pageAllowed).toBe(false);
    v.reset('B'); v.paint('', vod); expect(p.pageAllowed).toBe(false);
  });
  it('録画 → 種類なしのライブ: 許可が戻る', async () => {
    const p = makePlayer(); await p.initialize();
    const v = wire(p, plat);
    v.reset('A'); v.paint('', vod); expect(p.pageAllowed).toBe(false);
    v.reset('B'); v.paint('', live); expect(p.pageAllowed).toBe(true);
  });
  it('ライブA → ライブB: 旧い待ちは捨て、そのあと戻る', async () => {
    const p = makePlayer(); await playing(p);
    const v = wire(p, plat);
    v.reset('A'); v.paint('', live); await flush();
    p.enqueue([{ kind: 'comment', text: '旧', nickname: 'a', userId: '1' }]);
    v.reset('B'); expect(p.queue.length).toBe(0);
    v.paint('', live); await flush();
    expect(p.pageAllowed).toBe(true);
    expect(p.enabled).toBe(true);
  });
  it('あとから live_replay が来たら止める', async () => {
    const p = makePlayer(); await p.initialize();
    const v = wire(p, plat);
    v.reset('A'); v.paint('', live); v.paint('live_replay', live);
    expect(p.pageAllowed).toBe(false);
  });
});

describe('SHOWROOM・YouTube', () => {
  it('SHOWROOM ライブ → ライブ: 旧い待ちを捨て、種類なしでも戻る', async () => {
    const p = makePlayer(); await playing(p);
    const v = wire(p, 'showroom');
    v.reset('roomA'); v.paint('', 'https://www.showroom-live.com/r/a'); await flush();
    p.enqueue([{ kind: 'comment', text: '旧', nickname: 'a', userId: '1' }]);
    v.reset('roomB'); expect(p.queue.length).toBe(0);
    v.paint('', 'https://www.showroom-live.com/r/b'); await flush();
    expect(p.pageAllowed).toBe(true);
  });
  it('YouTube は今まで通り: 切り替えで止め、未分類のあいだは止めたまま、live で戻し、video/live_replay は止める', async () => {
    const p = makePlayer(); await p.initialize();
    const v = wire(p, 'youtube');
    v.reset('a'); v.paint('live'); await p.enable({ persist: false }); await flush();
    v.reset('b'); expect(p.pageAllowed).toBe(false);
    v.paint(''); expect(p.pageAllowed).toBe(false);
    v.paint('live'); await flush(); expect(p.pageAllowed).toBe(true);
    v.paint('video'); expect(p.pageAllowed).toBe(false);
    v.paint('live'); v.paint('live_replay'); expect(p.pageAllowed).toBe(false);
  });
});

describe('配線', () => {
  it('venueBar は切り替えのたびに全サービスで setPageTarget し、ゲートには今のページの URL を渡す', () => {
    const src = readFileSync(`${process.cwd()}/src/extension/venueBar.js`, 'utf8');
    expect(src).toContain('    voicePlayer.setPageTarget(liveId);');
    expect(src).not.toContain('venueVoiceTargetSuspends');
    expect(src).toContain('venueVoicePageGate(model.contentKind, options.statPlatform, location.href)');
  });
});
