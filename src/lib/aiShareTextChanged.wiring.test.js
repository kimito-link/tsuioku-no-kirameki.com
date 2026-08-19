/**
 * ★v0.1.1447: 「コピーがスムーズにとれない」を二度と再発させない配線。
 *
 * ■ 実際に起きていたこと(2026-08-19 ユーザー報告)
 *   `if (ta && ta.value !== fullText) ta.value = fullText;`
 *   本文1行目に `生成: <ISO時刻>` が入るので **比較が常に true**。
 *   ＝数十KBの textarea を2秒ごとに丸ごと書き換え、
 *   **そのたびにユーザーの選択が解除**されてコピーできなかった。
 *
 * ★このリポは「判定に時刻を混ぜる」を **5回** 踏んでいる
 *   (v1320 / v1409 / v1412 / v1445 / 今回)。素の `!==` に戻る変異を必ず殺す。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
/** ★CRLF 正規化は必須(2026-08-18 に同じ罠で別の検査が死んでいた)。 */
const read = (rel) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

const entrySrc = read('src/extension/status-entry.js');
const libSrc = read('src/lib/aiShareTextChanged.js');

/**
 * コメント行を落として「実際に動くコード」だけにする。
 * ★これが無いと、旧実装を**説明するコメント**を書いただけで検査が赤くなる
 *   (実際に踏んだ: 経緯を残すコメントに `ta.value !== fullText` を引用していた)。
 */
const codeOnly = (src) =>
  src
    .split('\n')
    .filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l))
    .join('\n');

const entryCode = codeOnly(entrySrc);

describe('AI共有テキストの書き換え判定の配線', () => {
  it('★純関数を出荷経路が import している', () => {
    expect(entrySrc).toMatch(
      /import \{ shouldUpdateAiShareText \} from '\.\.\/lib\/aiShareTextChanged\.js';/
    );
  });

  it('★素の `ta.value !== fullText` に戻っていない(5回踏んだ罠)', () => {
    // これが復活したら「時刻で毎回書き換わる」＝コピーが取れない状態に逆戻り。
    // ★コメントは除外して【実際のコード】だけを見る(経緯の引用で赤くしない)。
    expect(entryCode).not.toContain('ta.value !== fullText');
  });

  it('★書き換えは判定関数を通る1箇所だけ(数で断言)', () => {
    const hits = entryCode.match(/shouldUpdateAiShareText\(/g) || [];
    expect(hits).toHaveLength(1);
    // 代入も1箇所(条件の外にコピーが残っていない)。
    expect(entryCode.match(/ta\.value = fullText;/g) || []).toHaveLength(1);
  });

  it('★選択中かどうかを実際に渡している(アンカー付き)', () => {
    /*
     * 直前直後まで固定する。緩めると `selecting: false` 固定や
     * 引数ごと削る変異が素通りする([[wiring-test-must-assert-counts-2026-08-04]])。
     */
    expect(entrySrc).toMatch(
      /const selecting =\n\s*document\.activeElement === ta && Number\(ta\.selectionEnd\) > Number\(ta\.selectionStart\);/
    );
    expect(entrySrc).toMatch(
      /if \(shouldUpdateAiShareText\(ta\.value, fullText, \{ selecting \}\)\) ta\.value = fullText;/
    );
    expect(entrySrc).not.toMatch(/selecting: false/);
  });

  it('★純関数側: 選択中は書かない・時刻行だけ潰す(実装の芯)', () => {
    expect(libSrc).toMatch(/if \(opts\?\.selecting === true\) return false;/);
    expect(libSrc).toMatch(/const GENERATED_AT_LINE_RE = \/\^生成: \.\*\$\/m;/);
  });
});
