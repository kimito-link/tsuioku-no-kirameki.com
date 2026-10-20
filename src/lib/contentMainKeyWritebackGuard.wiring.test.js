import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ★v0.1.1701: content が本体キー nls_comments_<lv> へコメント全件を書き戻す箇所は、チャンクから読んだ配列を書かない。
 *
 * 経緯(2026-10-20 設計 docs/handoff/storage-writeback-reduction-DESIGN-2026-10-20.md B-4 / 前版 popup は v0.1.1700):
 *   maybeResolveNamedUserProfilesOnce は v0.1.807 で読みをチャンク優先(readChunkedComments)にしたが、書きは
 *   `save[commentsKey] = comments` のまま取り残された。チャンク配信では【チャンクから読んだ配列】を本体キーへ丸ごと書き戻し、
 *   全ページへ約1.1MBの通知を配っていた(実機 census で4分に約80MBの一部)。
 *   v0.1.509 以降の配信では本体キーは記録経路が一度も書かない複製で、profile patch は表示時に毎回再適用される
 *   (popup は applyStoredCommentEntries が allowWrite に関係なく適用・content 自身も added 行にだけ適用して過去行を永続化しない)
 *   ので、書き戻しを止めても表示は変わらない。停止条件は「書き戻し先=読んだ元」: `chunkRead.fromChunks === true` のとき止める。
 *   未移行/index破損(fromChunks=false=main から読んだ)は従来どおり書く。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(repoRoot, 'src/extension/content-entry.js'), 'utf8').replace(/\r\n/g, '\n');

function functionBody(name) {
  const start = src.indexOf(`async function ${name}(`);
  expect(start, `${name} が見つからない(構造が変わったら本テストを見直すこと)`).toBeGreaterThan(-1);
  const ends = [src.indexOf('\nasync function ', start + 10), src.indexOf('\nfunction ', start + 10)].filter((n) => n > -1);
  return src.slice(start, ends.length ? Math.min(...ends) : undefined);
}

describe('★content の本体キー書き戻しは、チャンクから読んだときは止まる', () => {
  const body = functionBody('maybeResolveNamedUserProfilesOnce');

  it('save[commentsKey] への書き込みが fromChunks の判定の下にある', () => {
    const lines = body.split('\n');
    const hits = lines.map((l, i) => (/save\[commentsKey\]\s*=/.test(l) ? i : -1)).filter((i) => i >= 0);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    for (const i of hits) {
      const window = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
      expect(window, `行 ${i}: ${lines[i].trim()}`).toMatch(/fromChunks/);
    }
  });

  it('止める条件は「チャンクから読んだ」=fromChunks が true のとき(false/未移行は従来どおり書く)', () => {
    expect(body).toMatch(/applied\.patched > 0 && chunkRead\?\.fromChunks !== true\) save\[commentsKey\] = comments;/);
  });

  it('読みは readChunkedComments のまま(読んだ元=書く先の規則の前提)・profile cache の書き込みは不変', () => {
    expect(body).toContain('readChunkedComments(lid, commentsKey, chunkGetMany)');
    expect(body).toContain('save[KEY_USER_COMMENT_PROFILE_CACHE] = pruned;');
  });

  it('content-entry.js 全体で、チャンク由来でない本体キー書き込みを新たに足していない(save[commentsKey] は1か所だけ)', () => {
    const all = src.match(/save\[commentsKey\]\s*=/g) || [];
    expect(all.length).toBe(1);
  });
});
