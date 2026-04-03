import { describe, it, expect } from 'vitest';
import { buildStorageWriteErrorPayload } from './storageErrorState.js';

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
});
