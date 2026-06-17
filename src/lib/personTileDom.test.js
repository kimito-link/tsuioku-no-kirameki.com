/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { buildPersonTileEl } from './personTileDom.js';

/**
 * characterization test: buildPersonTileEl は renderStoryUserLaneDom.js:fillLaneTier の
 * ループ本体をそのまま切り出したもの。生成 DOM を1バイトも変えないことを固定する。
 */

/** @param {Partial<import('./personTileDom.js').PersonTileIo>} [over] */
function makeIo(over = {}) {
  return {
    // 既定はリクエストをそのまま使う(pickDisplaySrc は表示用差し替えの口だが、
    // 本テストでは「何が呼ばれ何が DOM に乗るか」を見たいので素通し)
    storyAvatarLoadGuard: {
      pickDisplaySrc: (s) => s,
      noteRemoteAttempt: vi.fn()
    },
    isHttpOrHttpsUrl: (u) => /^https?:\/\//.test(String(u)),
    storyTileUsesYukkuriTvStyle: () => false,
    ...over
  };
}

/** @param {Partial<import('./personTileDom.js').PersonTileItem>} [over] */
function makeItem(over = {}) {
  return {
    displaySrc: 'https://example.test/a.png',
    title: 'たろう',
    meta: { idLine: 'ID:123456', nameLine: 'たろう' },
    entry: { userId: '123456' },
    ...over
  };
}

describe('buildPersonTileEl', () => {
  it('数値ID(5〜14桁)は <a> リンクセルになり href/target/rel が付く', () => {
    const cell = buildPersonTileEl(makeItem({ entry: { userId: '123456' } }), makeIo());
    expect(cell.tagName).toBe('A');
    expect(cell.className).toBe('nl-story-userlane-cell nl-story-userlane-cell--linkable');
    expect(cell.getAttribute('href')).toBe('https://www.nicovideo.jp/user/123456');
    expect(cell.getAttribute('target')).toBe('_blank');
    expect(cell.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('匿名(a:xxx)など非数値IDは <span> セルでリンクにしない', () => {
    const cell = buildPersonTileEl(
      makeItem({ entry: { userId: 'a:anon' }, meta: { idLine: 'a:anon', nameLine: '匿名' } }),
      makeIo()
    );
    expect(cell.tagName).toBe('SPAN');
    expect(cell.className).toBe('nl-story-userlane-cell');
    expect(cell.getAttribute('href')).toBeNull();
  });

  // ドリフト検知: リンク可否は domain 正本 isNumericNicoUserId(^\d{5,14}$=本登録)に統一した。
  // venue 席(venueBar)も同基準。緩い nicoUserPageUrl(^\d{1,18}$)へ戻すと境界(4桁以下/15桁以上)で
  // popup と venue がズレ、これらが落ちる。
  it('本登録の境界: 5桁はリンク、4桁以下はリンクにしない', () => {
    const linkable = buildPersonTileEl(makeItem({ entry: { userId: '12345' } }), makeIo());
    expect(linkable.tagName).toBe('A');
    expect(linkable.getAttribute('href')).toBe('https://www.nicovideo.jp/user/12345');
    const tooShort = buildPersonTileEl(makeItem({ entry: { userId: '1234' } }), makeIo());
    expect(tooShort.tagName).toBe('SPAN');
    expect(tooShort.getAttribute('href')).toBeNull();
  });

  it('本登録の境界: 14桁はリンク、15桁以上はリンクにしない', () => {
    const linkable = buildPersonTileEl(makeItem({ entry: { userId: '12345678901234' } }), makeIo());
    expect(linkable.tagName).toBe('A');
    const tooLong = buildPersonTileEl(makeItem({ entry: { userId: '123456789012345' } }), makeIo());
    expect(tooLong.tagName).toBe('SPAN');
    expect(tooLong.getAttribute('href')).toBeNull();
  });

  it('userId が無い行も落ちずに <span> セルになる', () => {
    const cell = buildPersonTileEl(makeItem({ entry: {} }), makeIo());
    expect(cell.tagName).toBe('SPAN');
    expect(cell.className).toBe('nl-story-userlane-cell');
  });

  it('img/meta の構造(class・子の順序・テキスト)が固定どおり', () => {
    const cell = buildPersonTileEl(
      makeItem({ meta: { idLine: 'ID:123456', nameLine: 'たろう' } }),
      makeIo()
    );
    const img = cell.querySelector('img');
    const meta = cell.querySelector('.nl-story-userlane-meta');
    expect(img?.className).toBe('nl-story-userlane-avatar');
    expect(img?.getAttribute('alt')).toBe('');
    expect(img?.getAttribute('decoding')).toBe('async');
    // 子は img → meta の順
    expect(cell.children[0]).toBe(img);
    expect(cell.children[1]).toBe(meta);
    const idRow = meta?.querySelector('.nl-story-userlane-meta__id');
    const nameRow = meta?.querySelector('.nl-story-userlane-meta__name');
    expect(idRow?.textContent).toBe('ID:123456');
    expect(nameRow?.textContent).toBe('たろう');
    // meta の子は id → name の順
    expect(meta?.children[0]).toBe(idRow);
    expect(meta?.children[1]).toBe(nameRow);
  });

  it('表示 src は pickDisplaySrc の戻りを使い、noteRemoteAttempt にはリクエスト元を渡す', () => {
    const note = vi.fn();
    const io = makeIo({
      storyAvatarLoadGuard: {
        pickDisplaySrc: () => 'https://cdn.test/display.png',
        noteRemoteAttempt: note
      }
    });
    const cell = buildPersonTileEl(makeItem({ displaySrc: 'https://origin.test/req.png' }), io);
    const img = cell.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://cdn.test/display.png');
    expect(note).toHaveBeenCalledWith(img, 'https://origin.test/req.png');
  });

  it('tv-fallback 判定が true のとき nl-avatar--tv-fallback class が付く', () => {
    const cell = buildPersonTileEl(makeItem(), makeIo({ storyTileUsesYukkuriTvStyle: () => true }));
    const img = cell.querySelector('img');
    expect(img?.classList.contains('nl-avatar--tv-fallback')).toBe(true);
  });

  it('http(s) 画像のとき referrerPolicy=no-referrer が付く', () => {
    const cell = buildPersonTileEl(makeItem({ displaySrc: 'https://x.test/a.png' }), makeIo());
    expect(cell.querySelector('img')?.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('data: 画像(非http)では referrerPolicy を付けない', () => {
    const io = makeIo();
    const cell = buildPersonTileEl(makeItem({ displaySrc: 'data:image/png;base64,AAAA' }), io);
    expect(cell.querySelector('img')?.getAttribute('referrerpolicy')).toBeNull();
  });

  it('tip: userId が idLine と違うと "title | uid"、同じなら title だけ', () => {
    const diff = buildPersonTileEl(
      makeItem({ title: 'たろう', entry: { userId: '123456' }, meta: { idLine: 'ID:123456', nameLine: 'たろう' } }),
      makeIo()
    );
    expect(diff.querySelector('img')?.getAttribute('title')).toBe('たろう | 123456');
    expect(diff.getAttribute('title')).toBe('たろう | 123456');

    const same = buildPersonTileEl(
      makeItem({ title: 'はな', entry: { userId: 'a:zzz' }, meta: { idLine: 'a:zzz', nameLine: 'はな' } }),
      makeIo()
    );
    expect(same.querySelector('img')?.getAttribute('title')).toBe('はな');
  });

  it('SVG プレースホルダ + userId のとき upgradeAnonymousAvatarImage(img, uid, 64) を呼ぶ', () => {
    const upgrade = vi.fn();
    const io = makeIo({ upgradeAnonymousAvatarImage: upgrade });
    const cell = buildPersonTileEl(
      makeItem({ displaySrc: 'data:image/svg+xml;utf8,<svg/>', entry: { userId: 'a:anon' } }),
      io
    );
    expect(upgrade).toHaveBeenCalledTimes(1);
    expect(upgrade).toHaveBeenCalledWith(cell.querySelector('img'), 'a:anon', 64);
  });

  it('upgradeAnonymousAvatarImage 未提供でも SVG プレースホルダで落ちない', () => {
    const io = makeIo(); // upgrade なし
    expect(() =>
      buildPersonTileEl(makeItem({ displaySrc: 'data:image/svg+xml;utf8,<svg/>' }), io)
    ).not.toThrow();
  });
});
