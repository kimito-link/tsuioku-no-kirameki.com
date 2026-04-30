import { describe, it, expect } from 'vitest';
import { resolveBroadcasterFollowTarget } from './broadcasterFollowTarget.js';

describe('resolveBroadcasterFollowTarget - 通常ユーザー放送', () => {
  it('数値 uid + name → kind=user / userIconCDN URL（bucket = floor(uid/10000)）', () => {
    const r = resolveBroadcasterFollowTarget({
      broadcasterName: 'ぼんこつ',
      broadcasterUserId: '134268998',
      broadcasterLevel: 12
    });
    expect(r.kind).toBe('user');
    expect(r.name).toBe('ぼんこつ');
    expect(r.level).toBe(12);
    expect(r.pageUrl).toBe('https://www.nicovideo.jp/user/134268998');
    expect(r.iconUrl).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/13426/134268998.jpg'
    );
    expect(r.followLabel).toBe('フォロー');
  });

  it('小さい uid（5 桁）も bucket 計算', () => {
    const r = resolveBroadcasterFollowTarget({
      broadcasterName: 'a',
      broadcasterUserId: '12345'
    });
    expect(r.kind).toBe('user');
    expect(r.iconUrl).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/1/12345.jpg'
    );
  });

  it('level が無いときは null', () => {
    const r = resolveBroadcasterFollowTarget({
      broadcasterName: 'foo',
      broadcasterUserId: '1234567'
    });
    expect(r.level).toBeNull();
  });
});

describe('resolveBroadcasterFollowTarget - 公式チャンネル / 業者放送', () => {
  it('broadcasterPageUrl が ch.nicovideo.jp の URL → kind=channel / pageUrl をそのまま', () => {
    const r = resolveBroadcasterFollowTarget({
      broadcasterName: 'ニコニコ競馬',
      broadcasterUserId: '',
      broadcasterPageUrl: 'https://ch.nicovideo.jp/nicokeiba'
    });
    expect(r.kind).toBe('channel');
    expect(r.name).toBe('ニコニコ競馬');
    expect(r.pageUrl).toBe('https://ch.nicovideo.jp/nicokeiba');
    expect(r.followLabel).toBe('チャンネルを見る');
  });

  it('channel の iconUrl は broadcasterIconUrl を優先', () => {
    const r = resolveBroadcasterFollowTarget({
      broadcasterName: 'ニコニコ競馬',
      broadcasterUserId: '',
      broadcasterPageUrl: 'https://ch.nicovideo.jp/nicokeiba',
      broadcasterIconUrl: 'https://secure-dcdn.cdn.nimg.jp/comch/channel-icon/512x512/ch12345.jpg'
    });
    expect(r.iconUrl).toBe(
      'https://secure-dcdn.cdn.nimg.jp/comch/channel-icon/512x512/ch12345.jpg'
    );
  });

  it('channel で broadcasterIconUrl 未指定 → iconUrl は空（タイル側で fallback 表示）', () => {
    const r = resolveBroadcasterFollowTarget({
      broadcasterName: 'ニコニコ競馬',
      broadcasterPageUrl: 'https://ch.nicovideo.jp/nicokeiba'
    });
    expect(r.kind).toBe('channel');
    expect(r.iconUrl).toBe('');
  });

  it('broadcasterUserId が非数値（"ch12345" 等）でも channel 経路に流れる（数値強制ではない）', () => {
    const r = resolveBroadcasterFollowTarget({
      broadcasterName: 'チャンネル名',
      broadcasterUserId: 'ch12345',
      broadcasterPageUrl: 'https://ch.nicovideo.jp/foo'
    });
    expect(r.kind).toBe('channel');
    expect(r.pageUrl).toBe('https://ch.nicovideo.jp/foo');
  });
});

describe('resolveBroadcasterFollowTarget - none（タイル非表示）', () => {
  it('broadcasterName 無し → kind=none', () => {
    const r = resolveBroadcasterFollowTarget({
      broadcasterName: '',
      broadcasterUserId: '12345',
      broadcasterPageUrl: 'https://www.nicovideo.jp/user/12345'
    });
    expect(r.kind).toBe('none');
  });

  it('broadcasterName が "-" だけ → kind=none', () => {
    const r = resolveBroadcasterFollowTarget({
      broadcasterName: '-',
      broadcasterUserId: '12345'
    });
    expect(r.kind).toBe('none');
  });

  it('uid 無 + pageUrl 無 → kind=none', () => {
    const r = resolveBroadcasterFollowTarget({
      broadcasterName: 'foo',
      broadcasterUserId: '',
      broadcasterPageUrl: ''
    });
    expect(r.kind).toBe('none');
  });

  it('uid 非数値 + pageUrl も channel ではなく user 形式で uid 抽出失敗 → none', () => {
    const r = resolveBroadcasterFollowTarget({
      broadcasterName: 'foo',
      broadcasterUserId: 'bogus',
      broadcasterPageUrl: 'https://example.com/random'
    });
    expect(r.kind).toBe('none');
  });

  it('引数なし → none', () => {
    expect(resolveBroadcasterFollowTarget()).toEqual({
      kind: 'none',
      name: '',
      level: null,
      pageUrl: '',
      iconUrl: '',
      followLabel: ''
    });
  });

  it('null 引数 → none', () => {
    expect(resolveBroadcasterFollowTarget(null).kind).toBe('none');
  });
});

describe('resolveBroadcasterFollowTarget - URL の安全性', () => {
  it('javascript: スキームの broadcasterPageUrl は無視（XSS 防止）', () => {
    const r = resolveBroadcasterFollowTarget({
      broadcasterName: 'evil',
      broadcasterPageUrl: 'javascript:alert(1)'
    });
    expect(r.pageUrl).toBe('');
    expect(r.kind).toBe('none');
  });

  it('http(s) 以外の broadcasterIconUrl は無視', () => {
    const r = resolveBroadcasterFollowTarget({
      broadcasterName: 'foo',
      broadcasterPageUrl: 'https://ch.nicovideo.jp/foo',
      broadcasterIconUrl: 'data:image/svg+xml,<svg onload=alert(1)/>'
    });
    expect(r.iconUrl).toBe('');
  });

  it('user 経路では pageUrl 引数は使われない（uid から CDN URL を合成するため、外部 URL 注入の余地なし）', () => {
    const r = resolveBroadcasterFollowTarget({
      broadcasterName: 'foo',
      broadcasterUserId: '12345',
      broadcasterPageUrl: 'javascript:1'
    });
    expect(r.kind).toBe('user');
    expect(r.pageUrl).toBe('https://www.nicovideo.jp/user/12345');
  });
});

describe('resolveBroadcasterFollowTarget - 数値 uid 優先', () => {
  it('uid 数値 + channel pageUrl 両方ある場合は user 経路を優先', () => {
    // 通常の user 放送で念のため pageUrl に user URL が入っているケース
    const r = resolveBroadcasterFollowTarget({
      broadcasterName: 'foo',
      broadcasterUserId: '999',
      broadcasterPageUrl: 'https://www.nicovideo.jp/user/999'
    });
    expect(r.kind).toBe('user');
    expect(r.pageUrl).toBe('https://www.nicovideo.jp/user/999');
  });
});
