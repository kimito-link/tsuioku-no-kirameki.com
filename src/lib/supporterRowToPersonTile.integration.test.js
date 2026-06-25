/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { supporterRowToPersonTile } from './supporterRowToPersonTile.js';
import { buildPersonTileEl } from './personTileDom.js';
import { deriveAvatarUrlFromUid } from './deriveAvatarUrlFromUid.js';
import { anonymousIdenticonDataUrl } from './anonymousIdenticon.js';
import { storyUserLaneMetaLines } from './storyUserLaneMeta.js';

/**
 * 統合テスト: 応援者ランキングの実描画パス(SupporterRow → supporterRowToPersonTile →
 * 本物 buildPersonTileEl)が、§3.5「サムネ・ID・ハンドル・リンクをセット」を満たす DOM を
 * 出すことを固定する。status-entry.js の buildSupporterExpander が使うのと同じ部品の組み合わせ。
 */

// status-entry.js の _supporterTileIo と同じ注入。
const tileIo = {
  deriveAvatarUrlFromUid: (uid) => deriveAvatarUrlFromUid(uid),
  anonymousIdenticonDataUrl,
  storyUserLaneMetaLines: (entry, http) => storyUserLaneMetaLines(entry, http)
};

// status-entry.js の _laneMirrorDomIo 相当(描画 I/O)。pickDisplaySrc は素通し。
const domIo = {
  storyAvatarLoadGuard: { pickDisplaySrc: (s) => s, noteRemoteAttempt: vi.fn() },
  isHttpOrHttpsUrl: (u) => /^https?:\/\//.test(String(u)),
  storyTileUsesYukkuriTvStyle: () => false,
  upgradeAnonymousAvatarImage: vi.fn()
};

function render(row) {
  return buildPersonTileEl(supporterRowToPersonTile(row, tileIo), domIo);
}

describe('応援者ランキングの人物タイル描画(統合)', () => {
  it('数値uid: リンク付き <a> + 公式サムネ + ID/名前が出る(§3.5 セット表示)', () => {
    const cell = render({ rank: 1, userId: '12345678', name: 'みやび', avatarUrl: '', count: 42, isAnonymous: false });
    expect(cell.tagName).toBe('A');
    expect(cell.getAttribute('href')).toContain('nicovideo.jp/user/12345678');
    const img = cell.querySelector('img');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toContain('12345678'); // 数値uid から導出したサムネ
    expect(cell.textContent).toContain('みやび'); // ハンドル名が出る
  });

  it('avatarUrl があればそれを使う(既存サムネ優先)', () => {
    const cell = render({ rank: 1, userId: '12345678', name: 'x', avatarUrl: 'https://real.example/a.jpg', count: 5, isAnonymous: false });
    expect(cell.querySelector('img').getAttribute('src')).toBe('https://real.example/a.jpg');
  });

  it('匿名(a:): 非リンク <span> + identicon(一律グレー化しない)', () => {
    const cell = render({ rank: 3, userId: 'a:abc123', name: '', avatarUrl: '', count: 2, isAnonymous: true });
    expect(cell.tagName).toBe('SPAN'); // 匿名は数値uidでない=リンクしない
    const src = cell.querySelector('img').getAttribute('src');
    expect(src).toContain('data:image/svg+xml'); // identicon で識別できる形
  });

  // ネガコン: 全行が同じ見た目に退化していないこと(数値uidは a、匿名は span)。
  it('ネガコン: 数値uid と匿名で要素タグが分かれる(全部リンク/全部spanの退化を検知)', () => {
    const numeric = render({ rank: 1, userId: '12345678', name: 'a', avatarUrl: '', isAnonymous: false });
    const anon = render({ rank: 2, userId: 'a:zzz', name: '', avatarUrl: '', isAnonymous: true });
    expect(numeric.tagName).not.toBe(anon.tagName);
  });
});
