import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ★v0.1.1699: フォロー先一覧の取得が「本体キー nls_comments_<lv> の直読み」をやめ、チャンクを読むことの配線固定。
 *
 * 経緯(2026-10-20 設計 docs/handoff/storage-writeback-reduction-DESIGN-2026-10-20.md B-2):
 *   v0.1.509 以降に始まった配信では、本体キーは記録経路が一度も書かない。中身は popup/content の
 *   書き戻しが作った【複製】にすぎず、この複製を止める(V2・V3)と、本体キーを直読みする
 *   maybeFetchCommenterFollowingListBatchOnce だけが「コメント0件」になって黙って死ぬ。
 *   → 先に表示経路と同じ readChunkedComments(チャンク優先・無ければ main)へ移す。
 *   隣の maybeFetchCommenterFollowBatchOnce / maybeResolveNamedUserProfilesOnce は v0.1.807 で移行済み。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(repoRoot, 'src/extension/content-entry.js'), 'utf8').replace(/\r\n/g, '\n');

/** 関数本体(次の関数宣言の手前まで)を切り出す。 */
function functionBody(name) {
  const start = src.indexOf(`async function ${name}(`);
  expect(start, `${name} が見つからない(構造が変わったら本テストを見直すこと)`).toBeGreaterThan(-1);
  const next = src.indexOf('\nasync function ', start + 10);
  const nextSync = src.indexOf('\nfunction ', start + 10);
  const ends = [next, nextSync].filter((n) => n > -1);
  return src.slice(start, ends.length ? Math.min(...ends) : undefined);
}

describe('★フォロー先一覧の取得はチャンクを読む(本体キーを直読みしない)', () => {
  it('maybeFetchCommenterFollowingListBatchOnce は readChunkedComments を呼ぶ', () => {
    const body = functionBody('maybeFetchCommenterFollowingListBatchOnce');
    expect(body).toContain('readChunkedComments(');
  });

  it('maybeFetchCommenterFollowingListBatchOnce は本体キーの値(bag[commentsKey])を使わず、get の対象にも入れない', () => {
    const body = functionBody('maybeFetchCommenterFollowingListBatchOnce');
    expect(body).not.toContain('bag[commentsKey]');
    // get([...]) の引数に commentsKey を直接並べていない(本体キーを get しない)
    const getAt = body.indexOf('chrome.storage.local.get([');
    expect(getAt).toBeGreaterThan(-1);
    const getArgs = body.slice(getAt, body.indexOf(']);', getAt));
    expect(getArgs).not.toMatch(/\bcommentsKey\b/);
  });

  it('content-entry.js 全体で bag[commentsKey] を値として読む箇所が無い(別の直読みを増やさない)', () => {
    expect(src.includes('bag[commentsKey]')).toBe(false);
  });

  it('コメント一覧の変数名・以降の処理は不変(stats の入力は comments)', () => {
    const body = functionBody('maybeFetchCommenterFollowingListBatchOnce');
    expect(body).toMatch(/const comments = Array\.isArray\(chunkRead\?\.rows\) \? chunkRead\.rows : \[\];/);
    expect(body).toContain('collectNumericCommentersFromComments(comments');
  });
});
