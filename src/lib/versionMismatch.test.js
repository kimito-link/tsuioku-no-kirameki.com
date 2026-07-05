import { describe, it, expect } from 'vitest';
import { detectVersionMismatch } from './versionMismatch.js';

describe('detectVersionMismatch', () => {
  it('一致していれば mismatch なし', () => {
    const r = detectVersionMismatch('0.1.1082', '0.1.1082');
    expect(r).toEqual({ mismatch: false, message: '' });
  });

  it('不一致なら mismatch あり+版番号入りメッセージ', () => {
    const r = detectVersionMismatch('0.1.1080', '0.1.1077');
    expect(r.mismatch).toBe(true);
    expect(r.message).toContain('chrome://extensions');
    expect(r.message).toContain('0.1.1077');
    expect(r.message).toContain('0.1.1080');
  });

  it('bundledVersion が空なら判定不能=mismatch なし(誤警報防止)', () => {
    expect(detectVersionMismatch('', '0.1.1082')).toEqual({ mismatch: false, message: '' });
    expect(detectVersionMismatch(undefined, '0.1.1082')).toEqual({ mismatch: false, message: '' });
  });

  it('manifestVersion が空/取得失敗なら判定不能=mismatch なし', () => {
    expect(detectVersionMismatch('0.1.1082', '')).toEqual({ mismatch: false, message: '' });
    expect(detectVersionMismatch('0.1.1082', null)).toEqual({ mismatch: false, message: '' });
  });

  it('両方空なら mismatch なし', () => {
    expect(detectVersionMismatch('', '')).toEqual({ mismatch: false, message: '' });
  });

  it('前後空白はトリムして比較する', () => {
    expect(detectVersionMismatch(' 0.1.1082 ', '0.1.1082')).toEqual({ mismatch: false, message: '' });
  });

  it('非文字列(数値等)は空文字扱い', () => {
    expect(detectVersionMismatch(123, 123)).toEqual({ mismatch: false, message: '' });
  });
});
