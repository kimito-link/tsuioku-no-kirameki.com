import { describe, it, expect } from 'vitest';
import {
  buildStorageWriteErrorPayload,
  storageErrorRelevantToLiveId
} from './storageErrorState.js';

describe('buildStorageWriteErrorPayload', () => {
  it('Error から message を短く取る', () => {
    const p = buildStorageWriteErrorPayload('lv1', new Error('quota'));
    expect(p.liveId).toBe('lv1');
    expect(p.message).toBe('quota');
    expect(typeof p.at).toBe('number');
  });

  it('message を持つプレーンオブジェクトから取る', () => {
    const p = buildStorageWriteErrorPayload(null, { message: 'plain' });
    expect(p.message).toBe('plain');
  });

  it('liveId が空なら省略', () => {
    const p = buildStorageWriteErrorPayload('', new Error('x'));
    expect(p.liveId).toBeUndefined();
  });

  it('文字列エラーにも対応', () => {
    const p = buildStorageWriteErrorPayload(null, 'failed');
    expect(p.message).toBe('failed');
  });

  it('長い message は切り詰め', () => {
    const long = 'a'.repeat(300);
    const p = buildStorageWriteErrorPayload('lv9', new Error(long));
    expect(p.message?.length).toBe(200);
  });

  it('liveId は前後空白を trim（ペイロードの安定化）', () => {
    const p = buildStorageWriteErrorPayload('  lv88  ', new Error('x'));
    expect(p.liveId).toBe('lv88');
  });
});

describe('storageErrorRelevantToLiveId', () => {
  it('payload に liveId が無ければ常に表示対象', () => {
    expect(storageErrorRelevantToLiveId({ at: 1 }, 'lv1')).toBe(true);
    expect(storageErrorRelevantToLiveId({ at: 1, message: 'x' }, 'lv2')).toBe(
      true
    );
  });

  it('viewer が空なら別 lv のエラーも表示（文脈不明時は隠さない）', () => {
    expect(
      storageErrorRelevantToLiveId(
        { at: 1, liveId: 'lv999' },
        ''
      )
    ).toBe(true);
  });

  it('同一 lv（大文字混在）なら表示対象', () => {
    expect(
      storageErrorRelevantToLiveId({ at: 1, liveId: 'LV100' }, 'lv100')
    ).toBe(true);
  });

  it('別 lv なら非表示', () => {
    expect(
      storageErrorRelevantToLiveId({ at: 1, liveId: 'lv1' }, 'lv2')
    ).toBe(false);
  });
});
