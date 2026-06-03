import { describe, it, expect } from 'vitest';
import {
  normalizeBroadcasterProfileModel,
  broadcasterNameLinkedHtml,
  broadcasterNameCellHtml,
  buildBroadcasterProfileMarketingCardHtml,
  buildBroadcasterProfileReportRowsHtml
} from './broadcasterProfileCard.js';

describe('normalizeBroadcasterProfileModel', () => {
  it('snapshot 別名キーを吸収して正規化する', () => {
    const m = normalizeBroadcasterProfileModel({
      broadcasterUserId: '5428353',
      broadcasterName: '○●丸',
      broadcasterIconUrl: 'https://x/y/5428353.jpg',
      broadcasterPageUrl: 'https://www.nicovideo.jp/user/5428353',
      broadcasterLevel: 42,
      startAtText: '2026/06/01(月) 20:00'
    });
    expect(m).toMatchObject({
      userId: '5428353',
      nickname: '○●丸',
      avatarUrl: 'https://x/y/5428353.jpg',
      pageUrl: 'https://www.nicovideo.jp/user/5428353',
      level: 42,
      startAtText: '2026/06/01(月) 20:00'
    });
  });

  it('プロフィール詳細フィールドも取り込む', () => {
    const m = normalizeBroadcasterProfileModel({
      userId: '7',
      nickname: 'A',
      isPremium: true,
      followeeCount: 12,
      followerCount: 3400,
      cumulativeBroadcastDays: 365,
      wishlistUrl: 'https://www.amazon.co.jp/hz/wishlist/ls/ABC',
      broadcastRequestEnabled: true
    });
    expect(m?.isPremium).toBe(true);
    expect(m?.followeeCount).toBe(12);
    expect(m?.followerCount).toBe(3400);
    expect(m?.cumulativeBroadcastDays).toBe(365);
    expect(m?.wishlistUrl).toBe('https://www.amazon.co.jp/hz/wishlist/ls/ABC');
    expect(m?.broadcastRequestEnabled).toBe(true);
  });

  it('非 http のアイコン/欲しいものリストは捨てる', () => {
    const m = normalizeBroadcasterProfileModel({
      userId: '7',
      nickname: 'A',
      avatarUrl: 'javascript:alert(1)',
      wishlistUrl: 'ftp://evil/x'
    });
    expect(m?.avatarUrl).toBe('');
    expect(m?.wishlistUrl).toBe('');
  });

  it('意味のある項目が無ければ null', () => {
    expect(normalizeBroadcasterProfileModel({})).toBeNull();
    expect(normalizeBroadcasterProfileModel(null)).toBeNull();
  });
});

describe('broadcasterNameLinkedHtml / cell', () => {
  it('数値 userId はユーザーページへリンク', () => {
    const m = normalizeBroadcasterProfileModel({ userId: '5428353', nickname: 'りんく' });
    const html = broadcasterNameLinkedHtml(/** @type {any} */ (m));
    expect(html).toContain('href="https://www.nicovideo.jp/user/5428353"');
    expect(html).toContain('りんく');
  });

  it('非数値だが pageUrl があれば pageUrl へリンク', () => {
    const m = normalizeBroadcasterProfileModel({
      userId: 'co12345',
      nickname: 'ch名',
      pageUrl: 'https://ch.nicovideo.jp/example'
    });
    const html = broadcasterNameLinkedHtml(/** @type {any} */ (m));
    expect(html).toContain('href="https://ch.nicovideo.jp/example"');
  });

  it('cell はモデルが無ければ素テキストにフォールバック', () => {
    expect(broadcasterNameCellHtml(null, 'なまえ')).toBe('なまえ');
    expect(broadcasterNameCellHtml(null, '')).toBe('-');
  });
});

describe('report renderers', () => {
  it('マーケカードはバッジ/リンクを出す', () => {
    const m = normalizeBroadcasterProfileModel({
      userId: '7',
      nickname: 'A',
      level: 10,
      isPremium: true,
      followerCount: 100,
      wishlistUrl: 'https://www.amazon.co.jp/hz/wishlist/ls/ABC'
    });
    const html = buildBroadcasterProfileMarketingCardHtml(m);
    expect(html).toContain('配信者プロフィール');
    expect(html).toContain('LV10');
    expect(html).toContain('プレミアム会員');
    expect(html).toContain('フォロワー 100');
    expect(html).toContain('欲しいものリスト');
  });

  it('モデルが無ければ空文字', () => {
    expect(buildBroadcasterProfileMarketingCardHtml(null)).toBe('');
    expect(buildBroadcasterProfileReportRowsHtml(null)).toBe('');
  });

  it('レポート行は取得項目だけ出す', () => {
    const m = normalizeBroadcasterProfileModel({
      userId: '7',
      nickname: 'A',
      isPremium: false,
      followerCount: 50
    });
    const rows = buildBroadcasterProfileReportRowsHtml(m);
    expect(rows).toContain('配信者ID');
    expect(rows).toContain('一般会員');
    expect(rows).toContain('フォロワー数');
    expect(rows).not.toContain('累計配信日数');
  });
});
