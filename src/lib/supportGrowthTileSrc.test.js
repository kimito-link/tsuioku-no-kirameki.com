import { describe, it, expect } from 'vitest';
import {
  isHttpOrHttpsUrl,
  resolveSupportGrowthTileSrc
} from './supportGrowthTileSrc.js';

describe('isHttpOrHttpsUrl', () => {
  it('https を許可', () => {
    expect(isHttpOrHttpsUrl('https://cdn.example/nicoaccount/usericon/1.jpg')).toBe(
      true
    );
  });
  it('http を許可', () => {
    expect(isHttpOrHttpsUrl('http://x.test/a.png')).toBe(true);
  });
  it('相対パスは不可', () => {
    expect(isHttpOrHttpsUrl('/path/x.png')).toBe(false);
  });
  it('空は不可', () => {
    expect(isHttpOrHttpsUrl('')).toBe(false);
  });
});

describe('resolveSupportGrowthTileSrc', () => {
  const rink = 'images/default-rink.png';

  it('entryAvatarUrl が https なら最優先', () => {
    expect(
      resolveSupportGrowthTileSrc({
        entryAvatarUrl: 'https://u.example/icon.jpg',
        isOwnPosted: true,
        viewerAvatarUrl: 'https://me.example/me.jpg',
        defaultSrc: rink
      })
    ).toBe('https://u.example/icon.jpg');
  });

  it('自分投稿で entry なしなら viewerAvatarUrl', () => {
    expect(
      resolveSupportGrowthTileSrc({
        entryAvatarUrl: '',
        isOwnPosted: true,
        viewerAvatarUrl: 'https://me.example/me.jpg',
        defaultSrc: rink
      })
    ).toBe('https://me.example/me.jpg');
  });

  it('他人投稿は viewer を使わない', () => {
    expect(
      resolveSupportGrowthTileSrc({
        entryAvatarUrl: '',
        isOwnPosted: false,
        viewerAvatarUrl: 'https://me.example/me.jpg',
        defaultSrc: rink
      })
    ).toBe(rink);
  });

  it('他人で entry にアイコンがあれば採用', () => {
    expect(
      resolveSupportGrowthTileSrc({
        entryAvatarUrl: 'https://other.example/o.png',
        isOwnPosted: false,
        viewerAvatarUrl: 'https://me.example/me.jpg',
        defaultSrc: rink
      })
    ).toBe('https://other.example/o.png');
  });

  it('自分投稿で viewer も無ければ default', () => {
    expect(
      resolveSupportGrowthTileSrc({
        entryAvatarUrl: '',
        isOwnPosted: true,
        viewerAvatarUrl: '',
        defaultSrc: rink
      })
    ).toBe(rink);
  });
});
