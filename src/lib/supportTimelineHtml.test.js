import { describe, it, expect } from 'vitest';
import {
  buildTimelineRowHtml,
  buildSupportTimelineBodyHtml
} from './supportTimelineHtml.js';

const cItem = (over = {}) => ({
  kind: 'comment',
  at: over.at ?? 100,
  key: 'c:1',
  userId: over.userId ?? '100',
  nickname: over.nickname ?? 'なまえ',
  text: over.text ?? 'こめんと',
  commentNo: over.commentNo ?? '1',
  avatarUrl: over.avatarUrl ?? '',
  selfPosted: over.selfPosted ?? false
});

const gItem = (over = {}) => ({
  kind: 'gift',
  at: over.at ?? 100,
  key: 'g:1',
  userId: over.userId ?? '200',
  nickname: over.nickname ?? 'おくりぬし',
  itemName: over.itemName ?? 'スパチャ',
  point: over.point ?? 500,
  message: over.message ?? '',
  avatarUrl: over.avatarUrl ?? ''
});

describe('buildTimelineRowHtml', () => {
  it('記名コメントは user ページへの <a>・本文と名前を出す', () => {
    const html = buildTimelineRowHtml(cItem({ userId: '4046119', text: 'やっほー' }));
    expect(html).toContain('href="https://www.nicovideo.jp/user/4046119"');
    expect(html).toContain('やっほー');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('nl-tl-row');
  });

  it('匿名コメント（a:xxx）はリンクにせず div', () => {
    const html = buildTimelineRowHtml(cItem({ userId: 'a:abc' }));
    expect(html).toContain('<div class="nl-tl-row');
    expect(html).not.toContain('nicovideo.jp/user');
  });

  it('ギフト行は🎁・名前・item・pt を出し記名はリンク', () => {
    const html = buildTimelineRowHtml(gItem({ userId: '5', itemName: 'かしわもち', point: 1200 }));
    expect(html).toContain('🎁');
    expect(html).toContain('かしわもち');
    expect(html).toContain('1,200pt');
    expect(html).toContain('href="https://www.nicovideo.jp/user/5"');
    expect(html).toContain('nl-tl-gift');
  });

  it('無料ギフト（pt0）は pt 表示を出さない', () => {
    const html = buildTimelineRowHtml(gItem({ point: 0 }));
    expect(html).not.toContain('pt</span>');
  });

  it('送信者アバターありのギフト行は avatar img + 🎁バッジを出す（v0.1.342）', () => {
    const html = buildTimelineRowHtml(
      gItem({ userId: 'a:x', avatarUrl: 'https://x/y.jpg' })
    );
    expect(html).toContain('nl-tl-gift__avatar');
    expect(html).toContain('src="https://x/y.jpg"');
    expect(html).toContain('nl-tl-gift__badge');
    expect(html).toContain('referrerpolicy="no-referrer"');
  });

  it('v0.1.655: アバターなし匿名は userId から identicon を出す(りんく/🎁にしない)', () => {
    const html = buildTimelineRowHtml(gItem({ userId: 'a:x', avatarUrl: '' }));
    expect(html).toContain('nl-tl-gift__avatar');
    expect(html).toContain('data:image/svg+xml'); // identicon data URL
  });

  it('v0.1.655: コメント行も匿名は identicon(りんくにしない)', () => {
    const html = buildTimelineRowHtml(cItem({ userId: 'a:x', avatarUrl: '' }));
    expect(html).toContain('nl-tl-row__avatar');
    expect(html).toContain('data:image/svg+xml');
  });

  it('v0.1.655: userId が違えば identicon も違う(見分けられる)', () => {
    const a = buildTimelineRowHtml(cItem({ userId: 'a:aaa', avatarUrl: '' }));
    const b = buildTimelineRowHtml(cItem({ userId: 'a:bbb', avatarUrl: '' }));
    const srcA = a.match(/src="([^"]+)"/)?.[1];
    const srcB = b.match(/src="([^"]+)"/)?.[1];
    expect(srcA).toBeTruthy();
    expect(srcA).not.toBe(srcB);
  });

  it('v0.1.655: userId も無いときだけ defaultAvatar にフォールバック', () => {
    const html = buildTimelineRowHtml(gItem({ userId: '', avatarUrl: '' }), {
      defaultAvatar: '/img/tile.png'
    });
    expect(html).toContain('src="/img/tile.png"');
  });

  it('記名アバター(avatarUrl)があればそれを優先(identiconにしない)', () => {
    const html = buildTimelineRowHtml(cItem({ userId: 'a:x', avatarUrl: 'https://x/y.jpg' }));
    expect(html).toContain('src="https://x/y.jpg"');
    expect(html).not.toContain('data:image/svg+xml');
  });

  it('XSS: テキスト・名前をエスケープ', () => {
    const html = buildTimelineRowHtml(
      cItem({ userId: 'a:x', text: '<img src=x onerror=alert(1)>', nickname: '<b>悪</b>' })
    );
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;b&gt;悪');
  });

  it('selfPosted コメントに self クラス', () => {
    const html = buildTimelineRowHtml(cItem({ userId: 'a:x', selfPosted: true }));
    expect(html).toContain('nl-tl-row--self');
  });

  it('本文なしコメントは代替文言（No.付き）', () => {
    const html = buildTimelineRowHtml(cItem({ userId: 'a:x', text: '', commentNo: '42' }));
    expect(html).toContain('本文なし・No.42');
  });

  it('http アバターに referrerpolicy no-referrer', () => {
    const html = buildTimelineRowHtml(cItem({ userId: 'a:x', avatarUrl: 'https://x/y.jpg' }));
    expect(html).toContain('referrerpolicy="no-referrer"');
    expect(html).toContain('src="https://x/y.jpg"');
  });
});

describe('buildSupportTimelineBodyHtml', () => {
  it('空なら案内文', () => {
    expect(buildSupportTimelineBodyHtml([])).toContain('まだコメントもギフトもありません');
    expect(buildSupportTimelineBodyHtml(null)).toContain('記録ON');
  });

  it('複数要素を連結（コメント＋ギフト混在）', () => {
    const html = buildSupportTimelineBodyHtml([
      gItem({ userId: 'a:x', itemName: 'ギフトA' }),
      cItem({ userId: 'a:y', text: 'コメB' })
    ]);
    expect(html).toContain('ギフトA');
    expect(html).toContain('コメB');
    expect(html.indexOf('ギフトA')).toBeLessThan(html.indexOf('コメB'));
  });
});

describe('相対時刻（now 渡し・v0.1.341）', () => {
  const now = 1_000_000_000_000;
  it('コメント行に相対時刻 span が出る', () => {
    const html = buildTimelineRowHtml(cItem({ userId: 'a:x', at: now - 5 * 60_000 }), { now });
    expect(html).toContain('nl-tl-time');
    expect(html).toContain('5分前');
  });
  it('ギフト行に相対時刻 span が出る', () => {
    const html = buildTimelineRowHtml(gItem({ userId: 'a:x', at: now - 30_000 }), { now });
    expect(html).toContain('nl-tl-time');
    expect(html).toContain('30秒前');
  });
  it('now 未指定や未来は時刻 span を出さない', () => {
    // at が大きな未来 → 空
    const html = buildTimelineRowHtml(cItem({ userId: 'a:x', at: now + 600_000 }), { now });
    expect(html).not.toContain('nl-tl-time');
  });
  it('body 全体に now を伝播', () => {
    const html = buildSupportTimelineBodyHtml(
      [gItem({ userId: 'a:x', at: now - 60_000, itemName: 'ギ' })],
      { now }
    );
    expect(html).toContain('1分前');
  });
});
