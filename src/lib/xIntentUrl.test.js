import { describe, it, expect } from 'vitest';
import { buildXIntentUrl, X_INTENT_BASE } from './xIntentUrl.js';

const LIVE_URL = 'https://tsuioku-no-kirameki.com/live/?lv=lv1234567';

describe('buildXIntentUrl', () => {
  it('text/url/hashtags を intent URL に載せる(characterization)', () => {
    const text = 'Aの配信「B」を、いま支えている人';
    expect(buildXIntentUrl({ text, url: LIVE_URL, hashtags: ['ニコ生'] })).toBe(
      `${X_INTENT_BASE}?text=${encodeURIComponent(text)}`
      + '&url=https%3A%2F%2Ftsuioku-no-kirameki.com%2Flive%2F%3Flv%3Dlv1234567'
      + '&hashtags=%E3%83%8B%E3%82%B3%E7%94%9F'
    );
  });

  it('空白は %20 にする(+ にしない。X 側の + の解釈は未確認なので曖昧さの無い方を選ぶ)', () => {
    const out = buildXIntentUrl({ text: 'a b', url: LIVE_URL });
    expect(out).toContain('text=a%20b');
    expect(out).not.toContain('+');
  });

  it('hashtags の # を剥がし、空は落とす', () => {
    expect(buildXIntentUrl({ text: 't', hashtags: ['#ニコ生', ' ', ''] })).toContain('hashtags=%E3%83%8B%E3%82%B3%E7%94%9F');
    // ★連結後の , は %2C になる。第1版は 1 タグなので実害なし(複数タグの X 側解釈は未確認)。
    expect(buildXIntentUrl({ text: 't', hashtags: '#a,#b' })).toContain('hashtags=a%2Cb');
  });

  it('hashtags が空なら省略する', () => {
    for (const hashtags of [[], '', undefined]) {
      expect(buildXIntentUrl({ text: 't', hashtags })).not.toContain('hashtags=');
    }
  });

  it('via の @ を剥がし、空なら省略する', () => {
    expect(buildXIntentUrl({ text: 't', via: '@x' })).toContain('via=x');
    expect(buildXIntentUrl({ text: 't', via: '' })).not.toContain('via=');
  });

  it('javascript: などの url は url だけ落とし、text は残す', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', '/live/', '']) {
      const out = buildXIntentUrl({ text: 't', url: bad });
      expect(out).not.toContain('url=');
      expect(out).toContain('text=t');
    }
  });

  it('text も url も空なら \'\' を返す(投げない)', () => {
    expect(buildXIntentUrl({})).toBe('');
    expect(buildXIntentUrl(undefined)).toBe('');
    expect(buildXIntentUrl({ hashtags: ['a'] })).toBe('');
  });

  // ネガティブコントロール: 固定文字列を返す退化を検知する。
  it('ネガコン: text が違えば URL が違う', () => {
    expect(buildXIntentUrl({ text: 'a', url: LIVE_URL })).not.toBe(buildXIntentUrl({ text: 'b', url: LIVE_URL }));
  });

  it('ネガコン: url が違えば URL が違う', () => {
    const a = buildXIntentUrl({ text: 't', url: 'https://tsuioku-no-kirameki.com/live/?lv=lv1234567' });
    const b = buildXIntentUrl({ text: 't', url: 'https://tsuioku-no-kirameki.com/live/?lv=lv1234568' });
    expect(a).not.toBe(b);
  });
});
