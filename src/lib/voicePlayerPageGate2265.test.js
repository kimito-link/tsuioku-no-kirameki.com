// v0.1.2265(Codex P2a): 「読み上げたい」(意思)と「このページで声を出してよい」(動画では出さない)を分ける。
//   動画に移ったら、鳴っている声・待ち・つなぎかけの ON を止め、ライブに戻ったら意思どおり再開する。
import { describe, expect, it, vi } from 'vitest';
import { VoicePlayer } from './voicePlayer.js';

/** @param {Record<string, any>} [over] */
function makePlayer(over = {}) {
  /** @type {Array<(c: any, a: string) => void>} */
  const listeners = [];
  const storage = { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue() };
  let release = () => {};
  const p = new VoicePlayer({
    storage,
    storageOnChanged: { addListener: (/** @type {any} */ fn) => listeners.push(fn) },
    isObsMode: () => false,
    audioConstructor: function () { return { play: vi.fn().mockResolvedValue(), pause: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }; },
    createObjectURL: vi.fn().mockReturnValue('blob:x'),
    revokeObjectURL: vi.fn(),
    fetchVoicevoxAlive: vi.fn().mockResolvedValue(true),
    fetchVoiceStyleIds: vi.fn(() => new Promise((r) => { release = () => r([1, 2]); })),
    fetchSynthesizeVoice: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    resolveVoice: vi.fn().mockReturnValue({ speaker: 1, speedOffset: 0 }),
    ...over,
  });
  const fireStorage = (/** @type {boolean} */ on) => listeners.forEach((fn) => fn({ [p.VOICE_READING_ENABLED_KEY]: { newValue: on } }, 'local'));
  return { p, storage, fireStorage, release: () => release() };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('VoicePlayer: 動画のページでは声を出さない(意思は残す)', () => {
  it('動画に移る前に出した ON が後から届いても、動画のあいだは声を出さない', async () => {
    const { p, fireStorage, release } = makePlayer();
    await p.initialize();
    expect(typeof p.setPageAllowed).toBe('function');
    p.setPageAllowed(false); // 動画へ
    fireStorage(true); // 前のページで押した ON が届く
    await flush(); release(); await flush(); await flush();
    expect(p.readingWanted).toBe(true); // 意思は ON のまま(ボタンの記憶)
    expect(p.enabled).toBe(false); // 声は出さない
    p.enqueue([{ kind: 'comment', text: 'こんにちは', nickname: 'a', userId: '1' }]);
    expect(p.queue.length).toBe(0);
  });

  it('つなぎかけの ON は、動画に移ったら(世代で)無効になる', async () => {
    const { p, release } = makePlayer();
    await p.initialize();
    const pending = p.enable({ persist: false });
    await flush();
    p.setPageAllowed(false); // つなぎ中に動画へ
    release(); await pending; await flush();
    expect(p.enabled).toBe(false);
    expect(p.readingWanted).toBe(true);
  });

  it('鳴っている・待っている声は、動画に移ったら止めて捨てる', async () => {
    const { p, release } = makePlayer();
    await p.initialize();
    const on = p.enable({ persist: false }); await flush(); release(); await on;
    expect(p.enabled).toBe(true);
    const stop = vi.spyOn(p, 'stop');
    p.queue.push(/** @type {any} */ ({ kind: 'comment', text: 'x' }));
    p.setPageAllowed(false);
    expect(stop).toHaveBeenCalled();
    expect(p.queue.length).toBe(0);
    expect(p.enabled).toBe(false);
  });

  it('ライブに戻ったら、意思が ON なら再開する(OFF なら再開しない)', async () => {
    const { p, release } = makePlayer();
    await p.initialize();
    p.setPageAllowed(false);
    const on = p.enable({ persist: false }); await flush();
    expect(p.enabled).toBe(false);
    p.setPageAllowed(true); await flush(); release(); await on; await flush(); await flush();
    expect(p.enabled).toBe(true);
    p.disable({ persist: false });
    p.setPageAllowed(false); p.setPageAllowed(true); await flush();
    expect(p.enabled).toBe(false);
    expect(p.readingWanted).toBe(false);
  });

  it('許可が変わらない呼び出しは何もしない(ライブのまま止めない)', async () => {
    const { p, release } = makePlayer();
    await p.initialize();
    const on = p.enable({ persist: false }); await flush(); release(); await on;
    const stop = vi.spyOn(p, 'stop');
    p.setPageAllowed(true);
    expect(stop).not.toHaveBeenCalled();
    expect(p.enabled).toBe(true);
  });
});

describe('配線: 会場は帯の写しのページの種類で声の許可を切り替える', () => {
  it('buildVenueStatStripModel は写しの contentKind を返す(別の配信の写しは使わない)', async () => {
    const { buildVenueStatStripModel } = await import('./venueStatStrip.js');
    const snap = { liveId: 'lv1', capturedAt: Date.now(), platform: 'youtube', platformFacts: { contentKind: 'video' } };
    expect(buildVenueStatStripModel(snap, { liveId: 'lv1', platform: 'youtube' }).contentKind).toBe('video');
    expect(buildVenueStatStripModel(snap, { liveId: 'lv2', platform: 'youtube' }).contentKind).toBe('');
  });
  it('venueBar は帯を描くたびに setPageAllowed(動画・アーカイブ以外) を呼び、止めている間は会場のボタンも押せない', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(`${process.cwd()}/src/extension/venueBar.js`, 'utf8');
    expect(src).toContain("voiceBtn.disabled = voicePlayer.pageAllowed === false;");
    expect(src).toMatch(/statStrip\.paint\(model\);\n\s+\{ const gate = venueVoicePageGate\(model\.contentKind, options\.statPlatform, location\.href\); if \(gate !== null\) voicePlayer\.setPageAllowed\(gate\); \}/);
  });
});

describe('VoicePlayer.setPageTarget: 配信が変わるまで前の許可を使わない', () => {
  it('ライブAから動画Bへ移る途中(種類がまだ空)でも、待ちと再生を止める。意思は残す', async () => {
    const { p, release } = makePlayer();
    await p.initialize();
    p.setPageTarget('lv-live-a');
    const on = p.enable({ persist: false }); await flush(); release(); await on;
    expect(p.enabled).toBe(true);
    p.queue.push(/** @type {any} */ ({ kind: 'comment', text: 'x' }));
    p.setPageTarget('lv-video-b'); // 新しい写しがまだ無い
    expect(p.pageAllowed).toBe(false);
    expect(p.enabled).toBe(false);
    expect(p.queue.length).toBe(0);
    expect(p.readingWanted).toBe(true);
  });
  it('最初の割り当て(空→id)では止めない', async () => {
    const { p, release } = makePlayer();
    await p.initialize();
    const on = p.enable({ persist: false }); await flush(); release(); await on;
    p.setPageTarget('lv-first');
    expect(p.enabled).toBe(true);
    expect(p.pageAllowed).toBe(true);
  });
  it('同じ id の呼び出しは何もしない', async () => {
    const { p, release } = makePlayer();
    await p.initialize();
    const on = p.enable({ persist: false }); await flush(); release(); await on;
    p.setPageTarget('lv-a');
    p.setPageTarget('lv-a');
    expect(p.enabled).toBe(true);
  });
});
