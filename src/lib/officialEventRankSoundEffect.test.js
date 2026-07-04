import { describe, expect, it, vi, beforeEach } from 'vitest';

const { playEffectSoundMock } = vi.hoisted(() => ({ playEffectSoundMock: vi.fn() }));

vi.mock('./effectSoundPlayer.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, playEffectSound: playEffectSoundMock };
});

const { maybePlayEventRankChangeSound } = await import('./officialEventRankSoundEffect.js');
const { EFFECT_SOUND_KINDS } = await import('./effectSoundPlayer.js');
const { KEY_VENUE_EFFECT_SOUND_PRESENCE } = await import('./storageKeys.js');

function makeBundle(rank) {
  return { eventBanner: { rank } };
}

describe('maybePlayEventRankChangeSound', () => {
  beforeEach(() => {
    playEffectSoundMock.mockClear();
  });

  it('初回(前回rank不明)は鳴らさない', async () => {
    const storageLocal = { get: vi.fn().mockResolvedValue({}) };
    await maybePlayEventRankChangeSound('lv1', makeBundle(5), { storageLocal, effectSoundEnabled: true });
    expect(playEffectSoundMock).not.toHaveBeenCalled();
  });

  it('順位が上がったら RANK_UP を鳴らす(2回目呼び出しで比較が効く)', async () => {
    const storageLocal = { get: vi.fn().mockResolvedValue({}) };
    const deps = { storageLocal, effectSoundEnabled: true };
    await maybePlayEventRankChangeSound('lv-up', makeBundle(5), deps);
    await maybePlayEventRankChangeSound('lv-up', makeBundle(3), deps);
    expect(playEffectSoundMock).toHaveBeenCalledWith(EFFECT_SOUND_KINDS.RANK_UP);
  });

  it('順位が下がったら RANK_DOWN を鳴らす', async () => {
    const storageLocal = { get: vi.fn().mockResolvedValue({}) };
    const deps = { storageLocal, effectSoundEnabled: true };
    await maybePlayEventRankChangeSound('lv-down', makeBundle(3), deps);
    await maybePlayEventRankChangeSound('lv-down', makeBundle(5), deps);
    expect(playEffectSoundMock).toHaveBeenCalledWith(EFFECT_SOUND_KINDS.RANK_DOWN);
  });

  it('効果音OFFなら鳴らさない', async () => {
    const storageLocal = { get: vi.fn().mockResolvedValue({}) };
    const deps = { storageLocal, effectSoundEnabled: false };
    await maybePlayEventRankChangeSound('lv-off', makeBundle(5), deps);
    await maybePlayEventRankChangeSound('lv-off', makeBundle(3), deps);
    expect(playEffectSoundMock).not.toHaveBeenCalled();
  });

  it('会場windowが新鮮なプレゼンスを持つなら鳴らさない(会場優先)', async () => {
    const storageLocal = { get: vi.fn().mockResolvedValue({ [KEY_VENUE_EFFECT_SOUND_PRESENCE]: Date.now() }) };
    const deps = { storageLocal, effectSoundEnabled: true };
    await maybePlayEventRankChangeSound('lv-venue', makeBundle(5), deps);
    await maybePlayEventRankChangeSound('lv-venue', makeBundle(3), deps);
    expect(playEffectSoundMock).not.toHaveBeenCalled();
  });

  it('liveIdが空なら何もしない', async () => {
    const storageLocal = { get: vi.fn().mockResolvedValue({}) };
    await maybePlayEventRankChangeSound('', makeBundle(5), { storageLocal, effectSoundEnabled: true });
    expect(playEffectSoundMock).not.toHaveBeenCalled();
  });

  it('rankが無い(null相当)ときは前回値を上書きしない', async () => {
    const storageLocal = { get: vi.fn().mockResolvedValue({}) };
    const deps = { storageLocal, effectSoundEnabled: true };
    await maybePlayEventRankChangeSound('lv-null', makeBundle(5), deps);
    await maybePlayEventRankChangeSound('lv-null', makeBundle(null), deps);
    await maybePlayEventRankChangeSound('lv-null', makeBundle(3), deps);
    expect(playEffectSoundMock).toHaveBeenCalledWith(EFFECT_SOUND_KINDS.RANK_UP);
  });

  it('storage.get が失敗しても例外を投げない', async () => {
    const storageLocal = { get: vi.fn().mockRejectedValue(new Error('boom')) };
    await expect(
      maybePlayEventRankChangeSound('lv-err', makeBundle(5), { storageLocal, effectSoundEnabled: true })
    ).resolves.toBeUndefined();
  });
});
