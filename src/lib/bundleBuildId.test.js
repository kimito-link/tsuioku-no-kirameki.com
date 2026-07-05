import { describe, it, expect } from 'vitest';
import { extractBundleBuildId } from './bundleBuildId.js';

describe('extractBundleBuildId', () => {
  it('MMDD-HHmmss 形式を抽出する', () => {
    expect(extractBundleBuildId('...var BUILD_ID_LIKE="0706-014824"...')).toBe('0706-014824');
  });

  it('本文中の最初の一致だけを返す', () => {
    expect(extractBundleBuildId('a 0101-000000 b 0202-111111 c')).toBe('0101-000000');
  });

  it('見つからなければ 不明 を返す', () => {
    expect(extractBundleBuildId('no build id here')).toBe('不明');
  });

  it('空文字/非文字列は 不明 を返す', () => {
    expect(extractBundleBuildId('')).toBe('不明');
    expect(extractBundleBuildId(null)).toBe('不明');
    expect(extractBundleBuildId(undefined)).toBe('不明');
    expect(extractBundleBuildId(123)).toBe('不明');
  });

  it('日付っぽくても桁数が違えば誤検知しない', () => {
    expect(extractBundleBuildId('version 1.2.3-456 not a build id')).toBe('不明');
  });
});
