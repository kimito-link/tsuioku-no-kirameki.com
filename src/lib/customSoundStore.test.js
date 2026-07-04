import { describe, expect, it, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { resolveEffectSoundPath } from './effectSoundPlayer.js';
import { KEY_CUSTOM_SOUND_REV } from './storageKeys.js';
import {
  CUSTOM_SOUND_DB_NAME,
  CUSTOM_SOUND_DB_VERSION,
  CUSTOM_SOUND_STORE_BLOBS,
  CUSTOM_SOUND_STORE_ASSIGNMENTS,
  CUSTOM_SOUND_DEFAULT_GAIN,
  openCustomSoundDb,
  putSoundBlob,
  getSoundBlob,
  listSoundBlobs,
  deleteSoundBlob,
  getAssignment,
  setAssignment,
  clearAssignment,
  listAssignments,
  bumpCustomSoundRev,
  mergeVariantPaths,
  mergeSinglePaths,
  getUrlForCustomSound,
  gainForAssignments,
  buildCustomVariantPathsFromAssignments,
  rotationRngFor,
  _resetRotationCountersForTest,
  loadCustomSoundRuntimeState
} from './customSoundStore.js';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetRotationCountersForTest();
});

describe('スキーマ定数', () => {
  it('DB名/version/ストア名が固定されている', () => {
    expect(CUSTOM_SOUND_DB_NAME).toBe('tk-custom-sounds');
    expect(CUSTOM_SOUND_DB_VERSION).toBe(1);
    expect(CUSTOM_SOUND_STORE_BLOBS).toBe('blobs');
    expect(CUSTOM_SOUND_STORE_ASSIGNMENTS).toBe('assignments');
  });
});

describe('blobs ストア(IDB fake注入)', () => {
  it('put→get で1件保存・取得できる', async () => {
    const db = await openCustomSoundDb();
    const blob = new Blob(['dummy'], { type: 'audio/mpeg' });
    await putSoundBlob(db, { id: 'as_204361', blob, name: 'audiostock_204361.mp3' });
    const rec = await getSoundBlob(db, 'as_204361');
    expect(rec).toMatchObject({ id: 'as_204361', name: 'audiostock_204361.mp3' });
    expect(rec.blob).toBeInstanceOf(Blob);
  });

  it('listSoundBlobsで全件列挙できる(取込件数の計測に使う)', async () => {
    const db = await openCustomSoundDb();
    await putSoundBlob(db, { id: 'as_1', blob: new Blob(['a']), name: 'a.mp3' });
    await putSoundBlob(db, { id: 'as_2', blob: new Blob(['b']), name: 'b.mp3' });
    const list = await listSoundBlobs(db);
    expect(list).toHaveLength(2);
  });

  it('deleteSoundBlobで削除できる', async () => {
    const db = await openCustomSoundDb();
    await putSoundBlob(db, { id: 'as_1', blob: new Blob(['a']), name: 'a.mp3' });
    await deleteSoundBlob(db, 'as_1');
    expect(await getSoundBlob(db, 'as_1')).toBeNull();
  });

  it('無効なrec(blobなし)はno-op', async () => {
    const db = await openCustomSoundDb();
    await putSoundBlob(db, { id: 'as_1', name: 'a.mp3' });
    expect(await listSoundBlobs(db)).toHaveLength(0);
  });
});

describe('assignments ストア', () => {
  it('setAssignment→getAssignment で割当を保存・取得できる', async () => {
    const db = await openCustomSoundDb();
    await setAssignment(db, 'gift_medium', ['as_812926', 'as_1587171'], 0.8);
    const a = await getAssignment(db, 'gift_medium');
    expect(a).toMatchObject({ key: 'gift_medium', ids: ['as_812926', 'as_1587171'], gain: 0.8 });
  });

  it('gain省略時は既定値', async () => {
    const db = await openCustomSoundDb();
    await setAssignment(db, 'ad', ['as_104491']);
    const a = await getAssignment(db, 'ad');
    expect(a.gain).toBe(CUSTOM_SOUND_DEFAULT_GAIN);
  });

  it('gainは0-1にクランプされる', async () => {
    const db = await openCustomSoundDb();
    await setAssignment(db, 'ad', ['as_104491'], 5);
    expect((await getAssignment(db, 'ad')).gain).toBe(1);
  });

  it('未割当キーはnull', async () => {
    const db = await openCustomSoundDb();
    expect(await getAssignment(db, 'nonexistent')).toBeNull();
  });

  it('clearAssignmentで割当を削除できる(既定に戻す)', async () => {
    const db = await openCustomSoundDb();
    await setAssignment(db, 'ad', ['as_104491']);
    await clearAssignment(db, 'ad');
    expect(await getAssignment(db, 'ad')).toBeNull();
  });

  it('listAssignmentsで全キーの割当を列挙できる', async () => {
    const db = await openCustomSoundDb();
    await setAssignment(db, 'ad', ['as_104491']);
    await setAssignment(db, 'gift_medium', ['as_812926']);
    const list = await listAssignments(db);
    expect(list).toHaveLength(2);
  });
});

describe('bumpCustomSoundRev', () => {
  it('世代カウンタを+1して返す', async () => {
    const store = { [KEY_CUSTOM_SOUND_REV]: 0 };
    const storageLocal = {
      get: async (key) => ({ [key]: store[key] }),
      set: async (items) => { Object.assign(store, items); }
    };
    expect(await bumpCustomSoundRev(storageLocal)).toBe(1);
    expect(await bumpCustomSoundRev(storageLocal)).toBe(2);
  });

  it('例外時は0を返す(呼び出し元に伝播しない)', async () => {
    const storageLocal = {
      get: async () => { throw new Error('boom'); },
      set: async () => {}
    };
    expect(await bumpCustomSoundRev(storageLocal)).toBe(0);
  });
});

describe('mergeVariantPaths(カスタム優先・フォールバック)', () => {
  it('カスタムに無いキーは基底のまま', () => {
    const base = { gift: ['g1', 'g2'] };
    expect(mergeVariantPaths(base, {})).toEqual(base);
  });

  it('カスタムがあるキーは上書きされる', () => {
    const base = { gift_medium: ['syn1', 'syn2'] };
    const custom = { gift_medium: ['blob:aaa', 'blob:bbb'] };
    expect(mergeVariantPaths(base, custom)).toEqual({ gift_medium: ['blob:aaa', 'blob:bbb'] });
  });

  it('カスタム側が空配列なら基底を残す(無音化させない)', () => {
    const base = { gift_medium: ['syn1'] };
    expect(mergeVariantPaths(base, { gift_medium: [] })).toEqual({ gift_medium: ['syn1'] });
  });

  it('基底に無い新設キーもカスタムから追加される', () => {
    const base = {};
    const custom = { voice_atsui: ['blob:vvv'] };
    expect(mergeVariantPaths(base, custom)).toEqual({ voice_atsui: ['blob:vvv'] });
  });
});

describe('mergeSinglePaths', () => {
  it('カスタム優先・未割当は基底のまま', () => {
    const base = { gift: 'sound/effect-gift.mp3' };
    expect(mergeSinglePaths(base, {})).toEqual(base);
    expect(mergeSinglePaths(base, { gift: 'blob:xyz' })).toEqual({ gift: 'blob:xyz' });
  });
});

describe('getUrlForCustomSound', () => {
  it('blob: URLは素通し(chromeGetUrlを呼ばない)', () => {
    const chromeGetUrl = vi.fn();
    expect(getUrlForCustomSound('blob:abcd-1234', chromeGetUrl)).toBe('blob:abcd-1234');
    expect(chromeGetUrl).not.toHaveBeenCalled();
  });

  it('それ以外はchromeGetUrlに委譲する', () => {
    const chromeGetUrl = vi.fn((p) => `chrome-extension://x/${p}`);
    expect(getUrlForCustomSound('sound/effect-gift.mp3', chromeGetUrl)).toBe('chrome-extension://x/sound/effect-gift.mp3');
  });
});

describe('gainForAssignments', () => {
  it('割当済みキーはgain、未割当は既定値', () => {
    const gainFor = gainForAssignments([{ key: 'gift_medium', gain: 0.5 }]);
    expect(gainFor('gift_medium')).toBe(0.5);
    expect(gainFor('ad')).toBe(CUSTOM_SOUND_DEFAULT_GAIN);
  });
});

describe('buildCustomVariantPathsFromAssignments', () => {
  it('idToUrlで解決できたキーだけ含める', () => {
    const idToUrl = new Map([['as_1', 'blob:aaa'], ['as_2', 'blob:bbb']]);
    const assignments = [
      { key: 'gift_medium', ids: ['as_1', 'as_2'] },
      { key: 'ad', ids: ['as_999'] } // 解決不能=空配列になる
    ];
    const result = buildCustomVariantPathsFromAssignments(assignments, idToUrl);
    expect(result).toEqual({ gift_medium: ['blob:aaa', 'blob:bbb'] });
  });
});

describe('rotationRngFor(決定論の順繰りローテーション)', () => {
  it('resolveEffectSoundPathと組み合わせて1→2→3→1…の順繰りになる', () => {
    const variantPaths = { gift_medium: ['v1', 'v2', 'v3'] };
    const rng = rotationRngFor('gift_medium', 3);
    const seq = Array.from({ length: 7 }, () => resolveEffectSoundPath('gift_medium', { variantPaths, rng }));
    expect(seq).toEqual(['v1', 'v2', 'v3', 'v1', 'v2', 'v3', 'v1']);
  });

  it('キーごとにカウンタは独立している', () => {
    const rngA = rotationRngFor('a', 2);
    const rngB = rotationRngFor('b', 2);
    const variantPaths = { a: ['a0', 'a1'], b: ['b0', 'b1'] };
    expect(resolveEffectSoundPath('a', { variantPaths, rng: rngA })).toBe('a0');
    expect(resolveEffectSoundPath('b', { variantPaths, rng: rngB })).toBe('b0');
    expect(resolveEffectSoundPath('a', { variantPaths, rng: rngA })).toBe('a1');
    expect(resolveEffectSoundPath('b', { variantPaths, rng: rngB })).toBe('b1');
  });

  it('Math.randomを一切使わない(同一引数で常に同じ結果)', () => {
    const variantPaths = { x: ['p0', 'p1'] };
    const rng1 = rotationRngFor('x', 2);
    expect(resolveEffectSoundPath('x', { variantPaths, rng: rng1 })).toBe('p0');
    _resetRotationCountersForTest();
    const rng2 = rotationRngFor('x', 2);
    expect(resolveEffectSoundPath('x', { variantPaths, rng: rng2 })).toBe('p0');
  });
});

describe('loadCustomSoundRuntimeState(統合ローダ)', () => {
  it('割当が無ければ空のcustomVariantPathsを返す', async () => {
    const state = await loadCustomSoundRuntimeState();
    expect(state.customVariantPaths).toEqual({});
    expect(state.gainFor('anything')).toBe(CUSTOM_SOUND_DEFAULT_GAIN);
    expect(state.urlsById.size).toBe(0);
  });

  it('割当済みBlobだけblob URLを発行してcustomVariantPathsに含める', async () => {
    const db = await openCustomSoundDb();
    await putSoundBlob(db, { id: 'as_812926', blob: new Blob(['a'], { type: 'audio/mpeg' }), name: 'audiostock_812926.mp3' });
    await putSoundBlob(db, { id: 'as_1587171', blob: new Blob(['b'], { type: 'audio/mpeg' }), name: 'audiostock_1587171.mp3' });
    await setAssignment(db, 'gift_medium', ['as_812926', 'as_1587171'], 0.6);

    const state = await loadCustomSoundRuntimeState();
    expect(state.customVariantPaths.gift_medium).toHaveLength(2);
    expect(state.customVariantPaths.gift_medium[0]).toMatch(/^blob:/);
    expect(state.gainFor('gift_medium')).toBe(0.6);
    expect(state.urlsById.size).toBe(2);
  });

  it('previousUrlsByIdを渡すと旧URLをrevokeする', async () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    const previous = new Map([['as_x', 'blob:old-url']]);
    await loadCustomSoundRuntimeState({ previousUrlsById: previous });
    expect(revokeSpy).toHaveBeenCalledWith('blob:old-url');
    revokeSpy.mockRestore();
  });
});
