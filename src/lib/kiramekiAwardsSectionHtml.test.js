import { describe, expect, it } from 'vitest';
import { escapeAttr, escapeHtml } from '../shared/html/escape.js';
import { buildKiramekiAwardsSectionHtml } from './kiramekiAwardsSectionHtml.js';

const deps = {
  resolveAvatarSrc: (room) => room?.avatarSrc || '',
  escapeHtml,
  escapeAttr
};

const award = (overrides = {}) => ({
  id: 'tomoshibi',
  category: 'all',
  emoji: '🌟',
  name: 'ともしびのきらめき',
  description: '配信をあたためてくれたみなさんです。',
  userKeys: ['alpha'],
  ...overrides
});

const room = (overrides = {}) => ({
  userKey: 'alpha',
  nickname: 'りんく推し',
  avatarSrc: 'https://example.test/avatar-alpha.png',
  ...overrides
});

describe('buildKiramekiAwardsSectionHtml', () => {
  it('受賞者ありのとき賞名・絵文字・説明が含まれる', () => {
    const html = buildKiramekiAwardsSectionHtml(
      [award()],
      [room()],
      deps
    );

    expect(html).toContain('ともしびのきらめき');
    expect(html).toContain('🌟');
    expect(html).toContain('配信をあたためてくれたみなさんです。');
    expect(html).toContain('りんく推し');
  });

  it('受賞者0人のとき「該当者なし」が含まれる', () => {
    const html = buildKiramekiAwardsSectionHtml(
      [award({ userKeys: [] })],
      [],
      deps
    );

    expect(html).toContain('今回は該当者なし');
  });

  it('13人以上のとき「他N人」が含まれる', () => {
    const userKeys = [
      'ua',
      'ub',
      'uc',
      'ud',
      'ue',
      'uf',
      'ug',
      'uh',
      'ui',
      'uj',
      'uk',
      'ul',
      'um',
      'un'
    ];
    const rooms = userKeys.map((userKey) =>
      room({ userKey, nickname: `参加者-${userKey}`, avatarSrc: '' })
    );
    const html = buildKiramekiAwardsSectionHtml(
      [award({ category: 'daily', id: 'today', userKeys })],
      rooms,
      deps
    );

    expect(html).toContain('14人');
    expect(html).toContain('他 2 人');
  });

  it('スコア数字は含まず人数だけを表示する', () => {
    const html = buildKiramekiAwardsSectionHtml(
      [
        award({
          score: 98765,
          commentCount: 54321,
          userKeys: ['alpha', 'bravo']
        })
      ],
      [
        room({ userKey: 'alpha', totalComments: 12345 }),
        room({ userKey: 'bravo', nickname: 'こん太推し' })
      ],
      deps
    );

    expect(html).toContain('2人');
    expect(html).toContain('人');
    expect(html).not.toContain('98765');
    expect(html).not.toContain('54321');
    expect(html).not.toContain('12345');
  });

  it('nicknameに含まれる<script>はエスケープされる', () => {
    const html = buildKiramekiAwardsSectionHtml(
      [award()],
      [room({ nickname: '<script>alert("x")</script>' })],
      deps
    );

    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('</script>');
  });
});
