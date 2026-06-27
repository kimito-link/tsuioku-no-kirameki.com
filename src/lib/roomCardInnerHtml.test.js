/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { buildRoomCardInnerHtml } from './roomCardInnerHtml.js';

// characterization（黄金値）テスト: 抽出前の popup-entry.js:renderUserRooms の挙動を固定する。
//   文字列一致だけに頼らず DOMParser で構造/属性も検証（plan の戦略どおり）。

const parse = (html) => {
  // li.innerHTML 相当の断片を <ul><li> に包んでパース。
  const doc = new DOMParser().parseFromString(`<ul><li>${html}</li></ul>`, 'text/html');
  return doc.querySelector('li');
};

const base = {
  userKey: '12345',
  label: 'りんく',
  displayThumb: 'https://example.com/a.png',
  count: 10,
  recentCount: 3,
  lastText: 'がんばれ',
  isUnknown: false,
  maxTotal: 20,
  maxRecent: 5,
  compactRooms: false
};

describe('buildRoomCardInnerHtml', () => {
  it('数値IDユーザー: サムネと名前が同じ user ページアンカーで括られる', () => {
    const li = parse(buildRoomCardInnerHtml(base));
    const links = li.querySelectorAll('a.room-card__id-link');
    expect(links.length).toBe(2); // avatar アンカー + name アンカー
    for (const a of links) {
      expect(a.getAttribute('href')).toBe('https://www.nicovideo.jp/user/12345');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
      expect(a.getAttribute('target')).toBe('_blank');
    }
    expect(li.querySelector('.room-name').textContent).toBe('りんく');
  });

  it('数値IDユーザー: avatar img の属性（src/referrerpolicy/fallback）', () => {
    const li = parse(buildRoomCardInnerHtml(base));
    const img = li.querySelector('img.room-card__avatar');
    expect(img.getAttribute('src')).toBe('https://example.com/a.png');
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer'); // http(s) サムネ
    expect(img.getAttribute('data-on-error-fallback')).toBe('blank');
    expect(img.getAttribute('alt')).toBe('');
  });

  it('匿名ユーザー(isUnknown): リンクなし・hint が出る', () => {
    const li = parse(buildRoomCardInnerHtml({ ...base, isUnknown: true, userKey: 'a:xxxxx' }));
    expect(li.querySelector('a.room-card__id-link')).toBeNull();
    expect(li.querySelector('.room-name').tagName.toLowerCase()).toBe('span');
    expect(li.querySelector('.room-hint')).not.toBeNull();
  });

  it('非数値キー(数値IDでない)はリンク化しない', () => {
    const li = parse(buildRoomCardInnerHtml({ ...base, userKey: 'nico_handle' }));
    expect(li.querySelector('a.room-card__id-link')).toBeNull();
    expect(li.querySelector('.room-name').tagName.toLowerCase()).toBe('span');
  });

  it('compactRooms=true は棒グラフ行を出さない', () => {
    const full = parse(buildRoomCardInnerHtml({ ...base, compactRooms: false }));
    const compact = parse(buildRoomCardInnerHtml({ ...base, compactRooms: true }));
    expect(full.querySelector('.room-bar-row')).not.toBeNull();
    expect(compact.querySelector('.room-bar-row')).toBeNull();
  });

  it('recentCount>0 は +N / 5分・up クラス、0 は ±0 / 5分・up なし', () => {
    const up = parse(buildRoomCardInnerHtml({ ...base, recentCount: 7 }));
    const delta = up.querySelector('.room-delta');
    expect(delta.textContent).toBe('+7 / 5分');
    expect(delta.classList.contains('up')).toBe(true);

    const flat = parse(buildRoomCardInnerHtml({ ...base, recentCount: 0 }));
    const delta0 = flat.querySelector('.room-delta');
    expect(delta0.textContent).toBe('±0 / 5分');
    expect(delta0.classList.contains('up')).toBe(false);
  });

  it('バー幅: totalPercent は max6/min100・recentPercent は recent>0 で max4', () => {
    // count/maxTotal=10/20=50% → 50.00、recent 3/5=60% → 60.00
    const html = buildRoomCardInnerHtml(base);
    expect(html).toContain('width:50.00%'); // room-bar-total
    expect(html).toContain('width:60.00%'); // room-bar-recent
    // 下限クランプ: count=1/maxTotal=100 → 1% だが max6 で 6.00
    const tiny = buildRoomCardInnerHtml({ ...base, count: 1, maxTotal: 100 });
    expect(tiny).toContain('width:6.00%');
    // recent=0 のとき recentPercent=0
    const noRecent = buildRoomCardInnerHtml({ ...base, recentCount: 0 });
    expect(noRecent).toContain('width:0.00%');
  });

  it('lastText 空ならプレビューを出さない', () => {
    const withText = parse(buildRoomCardInnerHtml(base));
    expect(withText.querySelector('.room-preview')).not.toBeNull();
    const noText = parse(buildRoomCardInnerHtml({ ...base, lastText: '' }));
    expect(noText.querySelector('.room-preview')).toBeNull();
  });

  it('XSS: label / lastText / displayThumb はエスケープされる', () => {
    const li = parse(
      buildRoomCardInnerHtml({
        ...base,
        userKey: 'evil"name',
        label: '<script>x</script>',
        lastText: '<img src=x onerror=alert(1)>',
        displayThumb: 'https://e.com/a.png" onerror="alert(1)',
        isUnknown: true // span 経路で title=userKey もエスケープ確認
      })
    );
    // 生 <script> が要素として現れない
    expect(li.querySelector('script')).toBeNull();
    // プレビュー本文はテキストとして入る（生 img 注入されない）
    const preview = li.querySelector('.room-preview');
    expect(preview.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(preview.querySelector('img')).toBeNull();
    // img src は属性として無害化（onerror 属性が分離して付かない）
    const img = li.querySelector('img.room-card__avatar');
    expect(img.hasAttribute('onerror')).toBe(false);
  });

  it('絵文字を含む label/本文をそのまま保持', () => {
    const li = parse(buildRoomCardInnerHtml({ ...base, label: '🎉りんく', lastText: '✨応援✨' }));
    expect(li.querySelector('.room-name').textContent).toBe('🎉りんく');
    expect(li.querySelector('.room-preview').textContent).toBe('✨応援✨');
  });

  it('non-http サムネ（data: 等）には referrerpolicy を付けない', () => {
    const li = parse(buildRoomCardInnerHtml({ ...base, displayThumb: 'data:image/png;base64,AAAA' }));
    const img = li.querySelector('img.room-card__avatar');
    expect(img.hasAttribute('referrerpolicy')).toBe(false);
  });

  it('堅牢性: null 入力でも投げずに span 経路の最小 HTML を返す', () => {
    const html = buildRoomCardInnerHtml(null);
    const li = parse(html);
    expect(li.querySelector('a.room-card__id-link')).toBeNull();
    expect(li.querySelector('.room-name')).not.toBeNull();
  });
});
