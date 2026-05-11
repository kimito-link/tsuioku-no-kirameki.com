import { describe, it, expect } from 'vitest';
import { buildUserContributionRankingHtml } from './userContributionRankingFallback.js';

describe('buildUserContributionRankingHtml', () => {
  it('rooms が空なら null', () => {
    expect(buildUserContributionRankingHtml([])).toBeNull();
    expect(buildUserContributionRankingHtml(null)).toBeNull();
    expect(buildUserContributionRankingHtml(undefined)).toBeNull();
  });

  it('nickname あり 1 件で正しい HTML', () => {
    const rooms = [
      { userKey: '12345', nickname: 'パジャマP', count: 3, avatarUrl: '' }
    ];
    const html = buildUserContributionRankingHtml(rooms);
    expect(html).toContain('class="ns-contrib-list"');
    expect(html).toContain('class="ns-contrib-rank">1<');
    expect(html).toContain('class="ns-contrib-name">パジャマP<');
    expect(html).toContain('class="ns-contrib-count">3 回<');
    expect(html).toContain('ns-contrib-avatar--placeholder');
  });

  it('複数件、上位 topN で打ち切る', () => {
    const rooms = Array.from({ length: 10 }, (_, i) => ({
      userKey: String(1000 + i),
      nickname: `user${i}`,
      count: 10 - i,
      avatarUrl: ''
    }));
    const html = buildUserContributionRankingHtml(rooms, { topN: 3 });
    expect(html).toContain('>user0<');
    expect(html).toContain('>user1<');
    expect(html).toContain('>user2<');
    expect(html).not.toContain('>user3<');
  });

  it('avatarUrl があれば <img> を出す', () => {
    const rooms = [
      {
        userKey: '12345',
        nickname: 'パジャマP',
        count: 1,
        avatarUrl: 'https://example.jp/avatar.jpg'
      }
    ];
    const html = buildUserContributionRankingHtml(rooms);
    expect(html).toContain('<img class="ns-contrib-avatar"');
    expect(html).toContain('src="https://example.jp/avatar.jpg"');
    expect(html).not.toContain('ns-contrib-avatar--placeholder');
  });

  it('nickname 空なら「ニコ生ユーザー (uid)」表記', () => {
    // memory feedback_ndgr_field6_silence.md の沈黙原則・正直化と同じ哲学
    const rooms = [
      { userKey: '97045586', nickname: '', count: 5, avatarUrl: '' }
    ];
    const html = buildUserContributionRankingHtml(rooms);
    expect(html).toContain('ニコ生ユーザー (97045586)');
  });

  it('userKey も nickname も空なら「名無し」', () => {
    const rooms = [
      { userKey: '', nickname: '', count: 1, avatarUrl: '' }
    ];
    const html = buildUserContributionRankingHtml(rooms);
    expect(html).toContain('>名無し<');
  });

  it('XSS: nickname に <script> が入っていてもエスケープされる', () => {
    const rooms = [
      { userKey: '1', nickname: '<script>alert(1)</script>', count: 1, avatarUrl: '' }
    ];
    const html = buildUserContributionRankingHtml(rooms);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('XSS: avatarUrl に " が入っていてもエスケープされる', () => {
    const rooms = [
      { userKey: '1', nickname: 'a', count: 1, avatarUrl: 'x" onerror="alert(1)' }
    ];
    const html = buildUserContributionRankingHtml(rooms);
    expect(html).not.toContain('onerror="');
    expect(html).toContain('&quot;');
  });

  it('count が負の値でも 0 にクランプ', () => {
    const rooms = [
      { userKey: '1', nickname: 'a', count: -5, avatarUrl: '' }
    ];
    const html = buildUserContributionRankingHtml(rooms);
    expect(html).toContain('>0 回<');
  });

  it('unitSuffix を pt に変えられる（将来 totalPoints 順に切り替えるとき用）', () => {
    const rooms = [
      { userKey: '1', nickname: 'a', count: 1500, avatarUrl: '' }
    ];
    const html = buildUserContributionRankingHtml(rooms, { unitSuffix: 'pt' });
    expect(html).toContain('>1500 pt<');
  });
});
