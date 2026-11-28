// v0.1.2266(Codex 最終): 会場で配信を替えたあと、ニコ生の読み上げの許可がもとに戻らなかった。
//   ニコ生の会場は種類(contentKind)を出さないので、配信の切り替えで止めた許可を戻す道が無かった。master は止めない。
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { VoicePlayer } from './voicePlayer.js';
import { venueVoicePageGate, venueVoiceTargetSuspends } from './venueStatStrip.js';

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

/** venueBar の配線と同じ順で呼ぶ(配信の切り替え = resetVenueForLive、帯の描き直し = paint)。 */
function wire(p, platform) {
  return {
    reset: (liveId) => { if (venueVoiceTargetSuspends(platform)) p.setPageTarget(liveId); },
    paint: (contentKind) => { const g = venueVoicePageGate(contentKind, platform); if (g !== null) p.setPageAllowed(g); },
  };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('ニコ生の会場: 配信を替えても読み上げの許可は master と同じ', () => {
  it('nico → 別の配信 → nico: 許可は ON のまま戻る(種類が空でも)', async () => {
    const p = makePlayer(); await p.initialize();
    const v = wire(p, undefined);
    v.reset('lv100'); v.paint('');
    await p.enable({ persist: false }); await flush();
    expect(p.enabled).toBe(true);
    v.reset('lv200'); v.paint('');
    v.reset('lv100'); v.paint('');
    await flush();
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
  it('Twitch・Kick なども同じ: 種類が空のライブでは、切り替えのあとも許可は ON のまま', async () => {
    for (const plat of ['twitch', 'kick', 'showroom']) {
      const p = makePlayer(); await p.initialize();
      const v = wire(p, plat);
      v.reset('chA'); v.paint(''); await p.enable({ persist: false }); await flush();
      v.reset('chB'); v.paint('');
      v.reset('chA'); v.paint(''); await flush();
      expect(p.pageAllowed).toBe(true);
      expect(p.enabled).toBe(true);
      v.paint('live_replay'); expect(p.pageAllowed).toBe(false); // アーカイブの種類が来たら止める
    }
  });
  it('YouTube は今まで通り: 切り替えで止め、種類(live)が分かったら戻す。分かるまでは止めたまま', async () => {
    const p = makePlayer(); await p.initialize();
    const v = wire(p, 'youtube');
    v.reset('a'); v.paint('live'); await p.enable({ persist: false }); await flush();
    v.reset('b'); expect(p.pageAllowed).toBe(false);
    v.paint(''); expect(p.pageAllowed).toBe(false);
    v.paint('live'); await flush(); expect(p.pageAllowed).toBe(true);
  });
  it('配線: venueBar は上の2つの判定を通る', () => {
    const src = readFileSync(`${process.cwd()}/src/extension/venueBar.js`, 'utf8');
    expect(src).toContain('if (venueVoiceTargetSuspends(options.statPlatform)) voicePlayer.setPageTarget(liveId);');
    expect(src).toContain('venueVoicePageGate(model.contentKind, options.statPlatform)');
  });
});
