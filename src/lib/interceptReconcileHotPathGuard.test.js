/**
 * v0.1.606: content-entry.js の runInterceptReconcile から「comments key の全件 read/write」
 *   経路が消えたことを構造的に保護する回帰テスト。
 *
 * 真因(Codex 調査 docs/codex-watch-frozen-investigation-v0606.md・容疑 ε):
 *   旧実装は WS 高頻度の userId reconcile 経路で、nls_comments_<lv> の 12000 件級配列を
 *   毎回 get → mergeStoredCommentsWithIntercept → set し、Chrome の structured clone で
 *   renderer main thread を 5 秒以上ブロックして「ページが応答しません」を誘発していた。
 *
 * 守りたい invariant:
 *   1) content-entry.js は mergeStoredCommentsWithIntercept を import しない
 *      (hot path から完全に外した目印・将来の「うっかり呼び戻し」を git で検知する)。
 *   2) runInterceptReconcile 周辺のコメントが「コメント配列の全件 read/write を撤去した」
 *      と明記している(設計意図の保護)。
 *
 * mergeStoredCommentsWithIntercept ライブラリ自体は残しているので、その unit test は
 * 別ファイル(mergeStoredCommentsWithIntercept.test.js)で引き続き機能を保証している。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const contentEntryPath = join(__dirname, '..', 'extension', 'content-entry.js');

describe('runInterceptReconcile hot-path guard (v0.1.606)', () => {
  const source = readFileSync(contentEntryPath, 'utf8');

  it('content-entry.js は mergeStoredCommentsWithIntercept を import しない', () => {
    // import 文を直接禁止する。コメント内の言及は許可(設計判断の説明として残るため)。
    const importPattern =
      /^\s*import\s+\{[^}]*mergeStoredCommentsWithIntercept[^}]*\}\s+from\s+['"][^'"]+['"];?\s*$/m;
    expect(source).not.toMatch(importPattern);
  });

  it('runInterceptReconcile は comments storage key を set しない設計である旨を明記する', () => {
    // ホットパスから巨大配列 write を撤去した意図を将来も読めるようにする。
    // 文言は揺らぐので「v0.1.606」と「reconcile」を含む説明ブロックがあることだけ確認。
    // 大文字小文字許容(runInterceptReconcile / reconcile 両方 OK)。
    expect(source).toMatch(/v0\.1\.606[\s\S]{0,200}reconcile/i);
  });

  it('runInterceptReconcile は KEY_USER_COMMENT_PROFILE_CACHE だけを get/set する', () => {
    // runInterceptReconcile 関数本体の周辺を抜き出し、commentsStorageKey の get/set が
    // 含まれていないことを確認する(関数本体の正確な範囲を文字列マッチで取る)。
    const startIdx = source.indexOf('async function runInterceptReconcile');
    expect(startIdx).toBeGreaterThan(0);
    // 関数の終端を「次の `async function ` か `function ` の出現位置」で推定。
    const afterStart = source.slice(startIdx + 1);
    const nextFnIdx = afterStart.search(/\n(async\s+function|function)\s+\w/);
    const body = nextFnIdx > 0 ? afterStart.slice(0, nextFnIdx) : afterStart.slice(0, 8000);
    // 旧実装の悪い兆候: storage.local.get に commentsStorageKey で取った key 変数を渡す。
    //   現実装は KEY_USER_COMMENT_PROFILE_CACHE 単独の get のみ。
    expect(body).not.toMatch(/chrome\.storage\.local\.get\(\[\s*key\s*,/);
    // saveBag[key] = next; 旧実装の痕跡。これが再現したら直ちに fail。
    expect(body).not.toMatch(/saveBag\[key\]\s*=\s*next/);
    // mergeStoredCommentsWithIntercept 呼び出しが本体内に復活していないこと。
    expect(body).not.toMatch(/\bmergeStoredCommentsWithIntercept\s*\(/);
  });
});
