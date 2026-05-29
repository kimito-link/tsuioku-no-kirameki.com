import { describe, expect, it } from 'vitest';
import { escapeHtml, escapeAttr } from '../shared/html/escape.js';
import { buildKiramekiAwardsSectionHtml } from './kiramekiAwardsSectionHtml.js';

const helpers = {
  resolveAvatarSrc: (room) => room?.avatarUrl || '',
  escapeHtml,
  escapeAttr
};

const makeAward = (overrides = {}) => ({
  id: 'tomoshibi',
  name: 'ともしびのきらめき',
  emoji: '🕯️',
  category: 'all',
  description: 'この配信に参加してくれたすべての人へ。',
  userKeys: ['u1'],
  ...overrides
});

const makeRoom = (userKey, overrides = {}) => ({
  userKey,
  nickname: `ユーザー${userKey}`,
  avatarUrl: `https://example.com/${userKey}.jpg`,
  count: 9999,
  totalChars: 8888,
  ...overrides
});

describe('buildKiramekiAwardsSectionHtml', () => {
  it('受賞者ありのとき賞名・絵文字・説明が含まれる', () => {
    const html = buildKiramekiAwardsSectionHtml(
      [
        makeAward({
          name: 'ひかりのきらめき',
          emoji: '✨',
          category: 'daily',
          description: '今日の配信でいちばん場を照らした人へ。'
        })
      ],
      [makeRoom('u1', { nickname: 'アリス' })],
      helpers
    );

    expect(html).toContain('ひかりのきらめき');
    expect(html).toContain('✨');
    expect(html).toContain('今日の配信でいちばん場を照らした人へ。');
    expect(html).toContain('アリス');
  });

  it('受賞者0人のとき「該当者なし」が含まれる', () => {
    const html = buildKiramekiAwardsSectionHtml(
      [makeAward({ userKeys: [] })],
      [],
      helpers
    );

    expect(html).toContain('今回は該当者なし');
  });

  it('14人受賞のとき「他 2 人」が含まれる', () => {
    const userKeys = Array.from({ length: 14 }, (_, i) => `u${i + 1}`);
    const html = buildKiramekiAwardsSectionHtml(
      [makeAward({ category: 'fixed', userKeys })],
      userKeys.map((key) => makeRoom(key)),
      helpers
    );

    expect(html).toContain('他 2 人');
    expect(html.match(/class="kirameki-award__recipient"/g)).toHaveLength(12);
  });

  it('スコア数字は表示しない', () => {
    const html = buildKiramekiAwardsSectionHtml(
      [makeAward({ userKeys: ['alice', 'bob'] })],
      [
        makeRoom('alice', { nickname: 'アリス', count: 12345, totalChars: 67890 }),
        makeRoom('bob', { nickname: 'ボブ', count: 24680, totalChars: 13579 })
      ],
      helpers
    );

    expect(html).toContain('2人');
    expect(html).not.toContain('12345');
    expect(html).not.toContain('67890');
    expect(html).not.toContain('24680');
    expect(html).not.toContain('13579');
  });

  it('XSS: <script> を含む nickname が &lt;script&gt; に変換される', () => {
    const html = buildKiramekiAwardsSectionHtml(
      [makeAward({ userKeys: ['evil'] })],
      [makeRoom('evil', { nickname: '<script>alert(1)</script>' })],
      helpers
    );

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});
