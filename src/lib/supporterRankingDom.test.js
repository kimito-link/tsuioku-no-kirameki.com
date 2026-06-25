/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { buildSupporterRankingRows } from './supporterRankingDom.js';
import { supporterRowToPersonTile } from './supporterRowToPersonTile.js';
import { buildPersonTileEl } from './personTileDom.js';
import { deriveAvatarUrlFromUid } from './deriveAvatarUrlFromUid.js';
import { anonymousIdenticonDataUrl } from './anonymousIdenticon.js';
import { storyUserLaneMetaLines } from './storyUserLaneMeta.js';

/**
 * P3(応援者ランキング): status の buildSupporterExpander の行描画を src/lib へ無挙動抽出する前提テスト。
 * 本物 supporterRowToPersonTile→buildPersonTileEl を再利用(似せて自作しない・v0.1.937 と同一見た目)。
 *   - 🥇🥈🥉 + 4. のランクバッジ / 件数千区切り / 数値uid はリンク・匿名は identicon
 */

const tileIo = {
  deriveAvatarUrlFromUid: (uid) => deriveAvatarUrlFromUid(uid),
  anonymousIdenticonDataUrl,
  storyUserLaneMetaLines: (entry, http) => storyUserLaneMetaLines(entry, http)
};
const domIo = {
  storyAvatarLoadGuard: { pickDisplaySrc: (s) => s, noteRemoteAttempt: vi.fn() },
  isHttpOrHttpsUrl: (u) => /^https?:\/\//.test(String(u)),
  storyTileUsesYukkuriTvStyle: () => false
};
const io = { supporterRowToPersonTile, buildPersonTileEl, tileIo, domIo };

const ROWS = [
  { rank: 1, userId: '12345678', name: 'みやび', avatarUrl: '', count: 42, isAnonymous: false },
  { rank: 2, userId: '87654321', name: 'たっつん', avatarUrl: '', count: 30, isAnonymous: false },
  { rank: 3, userId: 'a:abc123', name: '', avatarUrl: '', count: 12, isAnonymous: true },
  { rank: 4, userId: '11112222', name: 'よんい', avatarUrl: '', count: 8, isAnonymous: false }
];

describe('buildSupporterRankingRows', () => {
  it('行数ぶんの行を作る', () => {
    const host = buildSupporterRankingRows(ROWS, io);
    const rows = host.querySelectorAll(':scope > div');
    expect(rows.length).toBe(4);
  });

  it('ランクバッジ: 1-3 は 🥇🥈🥉・4 以降は "N."', () => {
    const host = buildSupporterRankingRows(ROWS, io);
    const t = host.textContent;
    expect(t).toContain('🥇');
    expect(t).toContain('🥈');
    expect(t).toContain('🥉');
    expect(t).toContain('4.');
  });

  it('件数を千区切りで出す', () => {
    const host = buildSupporterRankingRows([{ rank: 1, userId: '12345678', name: 'x', count: 1234 }], io);
    expect(host.textContent).toContain('1,234件');
  });

  it('数値uid はリンク(<a>)・名前が出る', () => {
    const host = buildSupporterRankingRows([ROWS[0]], io);
    expect(host.querySelector('a')).toBeTruthy();
    expect(host.querySelector('a').getAttribute('href')).toContain('nicovideo.jp/user/12345678');
    expect(host.textContent).toContain('みやび');
  });

  it('匿名: identicon の img(リンクしない)', () => {
    const host = buildSupporterRankingRows([ROWS[2]], io);
    const cells = host.querySelectorAll('.nl-story-userlane-cell');
    expect(cells.length).toBe(1);
    const img = cells[0].querySelector('img');
    expect(img.getAttribute('src')).toContain('data:image/svg+xml');
  });

  // ネガコン: 空配列で空 host(投げない)。
  it('ネガコン: 空配列で行ゼロ(投げない)', () => {
    const host = buildSupporterRankingRows([], io);
    expect(host.querySelectorAll(':scope > div').length).toBe(0);
    expect(() => buildSupporterRankingRows(null, io)).not.toThrow();
  });

  // ネガコン: rank が無い行でも連番フォールバックで出る。
  it('ネガコン: rank 欠落でも行は出る', () => {
    const host = buildSupporterRankingRows([{ userId: '12345678', name: 'x', count: 5 }], io);
    expect(host.querySelectorAll(':scope > div').length).toBe(1);
  });
});
