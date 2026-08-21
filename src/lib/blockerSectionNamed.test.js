import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { markBlockerSection } from './mainThreadBlockerBoot.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

/**
 * ★計器が「(拡張の外)」としか言えなかったのを直す。
 *
 * ■ ★これが「黒い」を直せなかった本当の理由(2026-08-21 実機速報で確定)
 *   ユーザー実機: **16.7秒のうち 15.9秒(95%)がメインスレッド停止**(最悪4,776ms)。
 *   ★止まっている間は何も描けない＝画面はUAの下地のまま＝**それが「黒」**。
 *   ＝ 黒く塗っている要素は存在しない(新計器 `panelCover` も ✅正常 と出た)。
 *
 * ■ ★ところが計器は犯人を名指しできなかった
 *   `mainThreadBlockerBoot.js:54` の `markBlockerSection` は
 *   **定義されているだけで呼び出しが0箇所**だった(grep 済み)。
 *   → `_currentSection` が常に空 → 速報には必ず **「(拡張の外)」** と出る。
 *   ★これは「拡張は無実」という意味ではない。**既定のラベル**でしかない。
 *   ＝ 計器が嘘をついていた([[instrument-must-name-the-cause-2026-08-01]])。
 *
 * ■ ★v0.1.1462: さらに構造的な欠陥が見つかったので実測へ移した
 *   `markBlockerSection` は **ラベルを置くだけで自分では測っていない**。
 *   実測は250msごとのハートビートが行い、遅れを見つけた時点の区間名を読む。
 *   ところが `finally` で ★**区間を抜けた瞬間にラベルを戻す**(`:60`)ので、
 *   ハートビートが鳴る頃には抜けていて **囲んでいても「(拡張の外)」と出る**。
 *   → `_measuredSection`(popup-entry.js)が**区間そのものを実測**するように変えた。
 *   ★このテストはその包みを数えるように更新済み(断言の中身は変えていない)。
 *
 * ■ このテストが固定すること
 *   popup の重い処理が **区間名で囲まれている**こと。
 *   これで次に止まったとき、速報が **当人の名前**を出せる。
 */
describe('★メインスレッドを止めた当人を名指しできる', () => {
  it('★markBlockerSection は戻り値をそのまま返す(囲んでも挙動を変えない)', () => {
    expect(markBlockerSection('x', () => 42)).toBe(42);
  });

  it('★例外が出ても区間名を戻す(finally で必ず復帰する)', () => {
    expect(() => markBlockerSection('boom', () => { throw new Error('e'); })).toThrow('e');
    // 直後に別区間を測っても汚染されていない
    expect(markBlockerSection('after', () => 'ok')).toBe('ok');
  });

  it('★★popup の重い処理が区間名で囲まれている(0箇所だと必ず「拡張の外」になる)', () => {
    const src = read('src/extension/popup-entry.js');
    expect(src, 'markBlockerSection を import していない')
      .toContain("from '../lib/mainThreadBlockerBoot.js'");
    /*
     * ★速報の実測で「重い」と名前が挙がった3つを囲む。
     *   ここが0だと `_currentSection` が空のままで、
     *   計器は永久に「(拡張の外)」としか言えない。
     */
    const calls = (src.match(/_measuredSection\(/g) || []).length;
    expect(calls, `囲みが ${calls} 箇所しかない`).toBeGreaterThanOrEqual(3);
  });

  it('★区間名が具体的(「重い処理」のような無意味な名前にしない)', () => {
    const src = read('src/extension/popup-entry.js');
    const names = [...src.matchAll(/_measuredSection\(\s*'([^']+)'/g)].map((m) => m[1]);
    expect(names.length, '区間名が採れない').toBeGreaterThanOrEqual(3);
    for (const n of names) {
      // ★読んだ人が「どこを直せばいいか」分かる名前であること
      expect(n.length, `区間名が短すぎる: ${n}`).toBeGreaterThan(3);
      expect(n, `無意味な区間名: ${n}`).not.toMatch(/^(heavy|slow|work|task)$/i);
    }
  });

  it('★★本体を検査している関数は包まない(既存のwiringテストを壊さない)', () => {
    /*
     * ★2026-08-21 に実際に踏んだ地雷:
     *   `renderStoryUserLane` を委譲関数で包んだら
     *   `laneMirrorPublishNotSkipped.wiring.test.js` が **5件赤**になった。
     *   あのテストは `function renderStoryUserLane(` から**本体を切り出して**
     *   publish の位置を検査するので、本体が4行のラッパになると空振りする。
     *   ★包む対象は「本体を切り出す検査が無い関数」から選ぶ。
     */
    const src = read('src/extension/popup-entry.js');
    // 本体検査を持つ関数が委譲関数化されていないこと
    const guarded = 'function renderStoryUserLane() {';
    const at = src.indexOf(guarded);
    expect(at, 'renderStoryUserLane が見つからない').toBeGreaterThan(-1);
    const body = src.slice(at, at + 400);
    expect(body, 'renderStoryUserLane を包むと本体検査が空振りする')
      .not.toContain('_measuredSection(');
  });

  it('★同じ名前を重複して使っていない(どれが犯人か分からなくなる)', () => {
    const src = read('src/extension/popup-entry.js');
    const names = [...src.matchAll(/_measuredSection\(\s*'([^']+)'/g)].map((m) => m[1]);
    expect(new Set(names).size, `重複した区間名: ${names.join(', ')}`).toBe(names.length);
  });
});
