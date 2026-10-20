import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ★v0.1.1700: popup が本体キー nls_comments_<lv> へ全件配列を書き戻す箇所は、必ず「チャンク運用では書かない」判定の下にある。
 *
 * 経緯(2026-10-20 設計 docs/handoff/storage-writeback-reduction-DESIGN-2026-10-20.md B-3):
 *   実機 census で nls_comments_<lv> が1回約1.1MB×73回/4分(各ページ約80MB)=通知量最大。コメント書込モードは「チャンク追記」で
 *   記録経路ではなく、popup の書き戻しが書き手だった。v0.1.509 で2か所(正規化 :15759・汚染除去 :15830)にだけ
 *   `!commentsChunked` ガードを付けたが、残る4か所(profile ハイドレート・snapshot 後の汚染除去・intercept merge・自己投稿照合)が付け漏れ。
 *   v0.1.509 以降の配信では本体キーは記録経路が一度も書かない【複製】で、書き戻しを止めても表示(チャンク読み)は変わらない。
 *   停止条件は「書き戻し先=自分が読んだ元」: index が有効(commentsChunked)のときだけ止める。未移行/破損は従来どおり書く。
 *
 * ★手で列挙しない: 書き込みの形を機械で全部拾い、ガードの無いものが1つでもあれば赤にする(登録表は必ず穴が開く)。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(repoRoot, 'src/extension/popup-entry.js'), 'utf8').replace(/\r\n/g, '\n');
const lines = src.split('\n');

/** 本体キーへ全件配列を書く形。 */
const WRITE_RE = /\[key\]: arr|save\[commentsKey\]\s*=|saveIc\[key\]\s*=|save\[key\]\s*=/;
const GUARD_RE = /commentsChunked|mainWriteAllowed/;

describe('★popup の本体キー書き戻しはチャンク運用で止まる', () => {
  const hits = [];
  lines.forEach((ln, i) => {
    if (WRITE_RE.test(ln) && !/^\s*(\/\/|\*)/.test(ln)) hits.push(i);
  });

  it('書き込み箇所を機械で拾えている(0件なら検査が空振り=構造が変わった)', () => {
    expect(hits.length).toBeGreaterThanOrEqual(6);
  });

  it('すべての書き込み行が、同じ行か直前6行以内に commentsChunked / mainWriteAllowed の判定を持つ', () => {
    const bad = hits.filter((i) => {
      const from = Math.max(0, i - 6);
      return !lines.slice(from, i + 1).some((l) => GUARD_RE.test(l));
    });
    expect(bad.map((i) => `popup-entry.js:${i + 1}: ${lines[i].trim()}`)).toEqual([]);
  });

  it('hydrate の ctx は mainWriteAllowed を受け取り、書き戻しはそれを条件にする', () => {
    expect(src).toMatch(/mainWriteAllowed: !commentsChunked/);
    expect(src).toMatch(/if \(prof\.commentsPatched && mainWriteAllowed\) save\[commentsKey\] = prof\.arr;/);
    // 分割代入で受け取っている
    expect(src).toMatch(/const \{ refreshGen, commentsKey, getArr, setArr, paint, mainWriteAllowed \} = ctx;/);
  });

  it('自己投稿照合は main だけ止め、KEY_SELF_POSTED_RECENTS の書き込み(消費)は残す', () => {
    const at = src.indexOf("'refresh_self_posted_storage_set_timeout'");
    expect(at).toBeGreaterThan(-1);
    const block = src.slice(src.lastIndexOf('storageSetSafe({', at), at);
    expect(block).toContain('[KEY_SELF_POSTED_RECENTS]: { items: selfPostedRecentsCache }');
    expect(block).toMatch(/commentsChunked \? \{\} : \{ \[key\]: arr \}/);
  });

  it('既存の2か所のガード(v0.1.509)は不変', () => {
    expect(src).toContain('!commentsChunked &&\n        (normalizedStored.changed || profAfterNormalize.commentsPatched)');
    expect(src).toContain('const saveStrip = commentsChunked ? {} : { [key]: arr };');
  });
});
