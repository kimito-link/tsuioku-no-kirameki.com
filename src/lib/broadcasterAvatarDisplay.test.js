import { describe, it, expect, beforeEach } from 'vitest';
import { officialDomRankBadgeThumb } from './topSupportRankStripLines.js';
import { anonymousIdenticonDataUrl } from './anonymousIdenticon.js';
import {
  isYukkuriOrIdenticonSrc,
  pickBroadcasterDisplaySrc,
  pickBroadcasterErrorFallbackSrc,
  rememberBroadcasterAvatar,
  lastKnownBroadcasterAvatar,
  resetBroadcasterAvatarMemoryForTests,
  broadcasterMemoryKey,
  extractBroadcasterUid
} from './broadcasterAvatarDisplay.js';

const USERICON = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/123/12345678.jpg';
const OTHER_ICON = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/123/12345678.0.jpg';
const YUKKURI = 'images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png';
const IDENTICON = anonymousIdenticonDataUrl('12345678', 64);

describe('broadcasterAvatarDisplay', () => {
  beforeEach(() => {
    resetBroadcasterAvatarMemoryForTests();
  });

  it('identicon とゆっくり画像を見分け、未取得バッジは除外する', () => {
    expect(isYukkuriOrIdenticonSrc(IDENTICON)).toBe(true);
    expect(isYukkuriOrIdenticonSrc(YUKKURI)).toBe(true);
    expect(isYukkuriOrIdenticonSrc(officialDomRankBadgeThumb(1, '12345678'))).toBe(false);
    expect(isYukkuriOrIdenticonSrc(USERICON)).toBe(false);
    expect(isYukkuriOrIdenticonSrc('')).toBe(false);
  });

  it('プローブ未完了（guard が identicon を返す）ときはゆっくり顔を出さず未取得バッジにする', () => {
    const src = pickBroadcasterDisplaySrc({
      requestedSrc: USERICON,
      guardDisplaySrc: IDENTICON,
      placeNumber: 1,
      userKey: '12345678'
    });
    expect(isYukkuriOrIdenticonSrc(src)).toBe(false);
    expect(src).toBe(officialDomRankBadgeThumb(1, '12345678'));
    expect(decodeURIComponent(src)).toContain('未取得');
  });

  it('guard がゆっくり画像パスを返しても本人アイコンやバッジへ倒す', () => {
    const src = pickBroadcasterDisplaySrc({
      requestedSrc: USERICON,
      guardDisplaySrc: YUKKURI,
      placeNumber: 3,
      userKey: '12345678'
    });
    expect(src).not.toContain('yukkuri');
    expect(src).toBe(officialDomRankBadgeThumb(3, '12345678'));
  });

  it('succeededKeys 相当（guard が本人 HTTP URL を返す）ときは本人アイコンを出し、覚える', () => {
    const src = pickBroadcasterDisplaySrc({
      requestedSrc: USERICON,
      guardDisplaySrc: USERICON,
      placeNumber: 1,
      userKey: '12345678'
    });
    expect(src).toBe(USERICON);
    expect(lastKnownBroadcasterAvatar('12345678')).toBe(USERICON);
  });

  it('描き直しで guard がまた identicon を返しても、最後の本人アイコンを残す', () => {
    rememberBroadcasterAvatar('12345678', USERICON);
    const src = pickBroadcasterDisplaySrc({
      requestedSrc: USERICON,
      guardDisplaySrc: IDENTICON,
      placeNumber: 2,
      userKey: '12345678'
    });
    expect(src).toBe(USERICON);
    expect(isYukkuriOrIdenticonSrc(src)).toBe(false);
  });

  it('配信者カードで iconUrl が空のとき identicon にしない', () => {
    const src = pickBroadcasterDisplaySrc({
      requestedSrc: '',
      guardDisplaySrc: '',
      placeNumber: null,
      userKey: 'あいたん'
    });
    expect(isYukkuriOrIdenticonSrc(src)).toBe(false);
    expect(src).toBe(officialDomRankBadgeThumb(null, 'あいたん'));
  });

  it('onerror では失敗した URL と同じ最後の本人アイコンを使わず、未取得バッジへ倒す', () => {
    rememberBroadcasterAvatar('12345678', USERICON);
    const src = pickBroadcasterErrorFallbackSrc({
      failedSrc: USERICON,
      userKey: '12345678',
      placeNumber: null
    });
    expect(src).toBe(officialDomRankBadgeThumb(null, '12345678'));
    expect(isYukkuriOrIdenticonSrc(src)).toBe(false);
  });

  it('onerror で別の最後の本人アイコンがあればそれを使う', () => {
    rememberBroadcasterAvatar('12345678', OTHER_ICON);
    const src = pickBroadcasterErrorFallbackSrc({
      failedSrc: USERICON,
      userKey: '12345678',
      placeNumber: null
    });
    expect(src).toBe(OTHER_ICON);
  });

  it('pageUrl から uid を取り、同じ人として覚える', () => {
    expect(extractBroadcasterUid('https://www.nicovideo.jp/user/12345678')).toBe('12345678');
    expect(broadcasterMemoryKey({ pageUrl: 'https://www.nicovideo.jp/user/12345678', name: 'あいたん' })).toBe(
      '12345678'
    );
    rememberBroadcasterAvatar('https://www.nicovideo.jp/user/12345678', USERICON);
    expect(lastKnownBroadcasterAvatar('12345678')).toBe(USERICON);
  });
});
