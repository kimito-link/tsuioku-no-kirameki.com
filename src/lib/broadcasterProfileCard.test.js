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

describe('配信者プロフィールの全項目(v0.1.1670)', () => {
  const base = { userId: '144967552', nickname: '鈴木働かない', avatarUrl: 'https://img.nicoprofile.nimg.jp/a.jpg', level: 56, isPremium: true, followerCount: 4593, followeeCount: 0,
    description: '切り抜きは<script>alert(1)</script>お願いします\nほしりす https://example.com/x',
    sns: [{ label: 'X', screenName: 'majinojob3150', url: 'https://x.com/majinojob3150' }, { label: 'bad', screenName: 'x', url: 'javascript:alert(1)' }],
    levelExp: { current: 6020, threshold: 11500 } };
  it('★自己紹介・SNS・経験値を正規化して持つ(SNS は http(s) のみ)', () => {
    const m = normalizeBroadcasterProfileModel(base);
    expect(m.description).toContain('切り抜き');
    expect(m.sns).toEqual([{ label: 'X', screenName: 'majinojob3150', url: 'https://x.com/majinojob3150' }]);
    expect(m.levelExp).toEqual({ current: 6020, threshold: 11500 });
  });
  it('★マーケのカードに、名前・自己紹介(エスケープ)・SNSリンク・経験値が出る', () => {
    const html = buildBroadcasterProfileMarketingCardHtml(normalizeBroadcasterProfileModel(base));
    expect(html).toContain('鈴木働かない');
    expect(html).toContain('mkt-bcaster__bio');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('href="https://x.com/majinojob3150"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('6,020');
    expect(html).toContain('11,500');
  });
  it('★HTMLレポートの概要表にも自己紹介とSNSが出る', () => {
    const html = buildBroadcasterProfileReportRowsHtml(normalizeBroadcasterProfileModel(base));
    expect(html).toContain('自己紹介');
    expect(html).toContain('SNS');
    expect(html).toContain('https://x.com/majinojob3150');
    expect(html).not.toContain('javascript:');
  });
  it('項目が無い人では出さない(誤情報ゼロ)', () => {
    const html = buildBroadcasterProfileMarketingCardHtml(normalizeBroadcasterProfileModel({ userId: '1', nickname: 'a' }));
    expect(html).not.toContain('mkt-bcaster__bio');
  });
});

describe('自己紹介の中のURLをリンクにする(v0.1.1671)', () => {
  const mk = (description) => normalizeBroadcasterProfileModel({ userId: '1', nickname: 'a', description });
  it('★http(s) のURLをリンクにする(新しいタブ・noopener noreferrer nofollow)', () => {
    const html = buildBroadcasterProfileMarketingCardHtml(mk('本垢→https://live.nicovideo.jp/watch/user/142924562?ref=x&a=1 です'));
    expect(html).toContain('<a class="mkt-bcaster__bio-link" href="https://live.nicovideo.jp/watch/user/142924562?ref=x&amp;a=1"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain('本垢→');
  });
  it('★URL の直後の句読点・閉じ括弧はリンクに含めない', () => {
    const html = buildBroadcasterProfileMarketingCardHtml(mk('見てね(https://example.com/a)。https://example.com/b、以上'));
    expect(html).toContain('href="https://example.com/a"');
    expect(html).toContain('href="https://example.com/b"');
    expect(html).not.toContain('href="https://example.com/a)');
    expect(html).not.toContain('href="https://example.com/b、');
  });
  it('★javascript: など http(s) 以外はリンクにしない・本文のHTMLはエスケープされたまま', () => {
    const html = buildBroadcasterProfileMarketingCardHtml(mk('javascript:alert(1) <b>x</b> data:text/html,hi'));
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('href="data:');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
  it('★HTMLレポートの概要表の自己紹介でも同じ', () => {
    const html = buildBroadcasterProfileReportRowsHtml(mk('ほしりす https://www.amazon.co.jp/hz/wishlist/ls/X'));
    expect(html).toContain('href="https://www.amazon.co.jp/hz/wishlist/ls/X"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });
  it('URL が無い本文は従来どおり(改行は <br>)', () => {
    const html = buildBroadcasterProfileMarketingCardHtml(mk('1行目\n2行目'));
    expect(html).toContain('1行目<br>2行目');
    expect(html).not.toContain('mkt-bcaster__bio-link');
  });
});
