import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');
const sidepanelHtml = read('extension/sidepanel.html');

/**
 * ★sidepanel.html の地の色まわりの不変条件を固定する。
 *
 * ■ ★2026-08-21 重要な訂正(このファイルの元の目的は外れていた)
 *   私は「引っ張った瞬間の黒」の真因を「下敷きが幅変更に追従しない」と断定し、
 *   v0.1.1457 を出したが **実機で黒は消えなかった**。
 *   ★その後ユーザーのスクショで正体が判明: **液晶保護アプリ(DISPLAY-002)の
 *   焼き付き防止オーバーレイ**。拡張と無関係の X のタブまで同じ縞に覆われていた。
 *   ＝**拡張のせいではない**([[measure-the-region-you-claim-2026-08-10]])。
 *
 * ■ このテストを残す理由
 *   `body { position: relative }` 自体は正しい(下敷きが親に追従する)。
 *   ★ただし「黒が直る」とは主張しない。ここが固定するのは
 *   **地の色の不変条件**(不透明・透明化禁止・隠さない)だけ。
 *
 * ■ 何を固定しているか(ここが本題)
 *   sidepanel.html が「黒くならない」ための前提4つ:
 *     1. 下敷きの祖先が位置指定されている(absolute の基準がある)
 *     2. html/body 自身が不透明な地の色を持つ(要素に頼らない最後の砦)
 *     3. 下敷きは中身を隠さない(z-index で潜るだけ・幕ではない)
 *     4. iframe を透明にしない(v0.1.1279〜1283 で真っ黒を起こした手口)
 *
 * ■ ★「引っ張った瞬間の黒」について(私の誤診の記録・消さないこと)
 *   ユーザーは「引っ張った瞬間」「導入時はなかった」と**何度も**報告した。
 *   私は上の1を真因と断定して v0.1.1457 を出したが、**実機で消えなかった**。
 *   ★正体は液晶保護アプリのオーバーレイで、**拡張の外**だった。
 *   → ★**症状を聞いたら、まず「拡張の外か中か」を切り分ける**。
 *     このリポには [[check-the-external-dependency-first-2026-08-11]]
 *     (拡張の中を見る前に外部の生死を確かめる・6版空振り)が既にある。**同じ失敗を繰り返した。**
 */
describe('★sidepanel の地の色の不変条件(黒くならない前提を守る)', () => {
  it('★★下敷きの祖先が位置指定されている(でないと古い幅のまま残る)', () => {
    /*
     * `position:absolute` は「位置指定された祖先」基準。body に position が無いと
     * 初期包含ブロック基準になる。★これ自体は直す価値があるが、
     * **引っ張り黒の真因ではなかった**(上の訂正を参照)。
     */
    const withoutComments = sidepanelHtml.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(
      withoutComments,
      'body に position が無い＝下敷き(absolute)が幅変更に追従しない'
    ).toMatch(/body\s*\{[^}]*position:\s*relative/);
  });

  it('★html/body 自身が不透明な地の色を持つ(要素に頼らない最後の砦)', () => {
    // ★ビューポートの背景はブラウザがキャンバス全体へ広げる＝リサイズで遅れない。
    expect(sidepanelHtml).toMatch(/background-color:\s*#fffaf2/);
    // ★インライン属性でも宣言(CSSが読まれる前の瞬間を塞ぐ・v0.1.1294)
    expect(sidepanelHtml).toMatch(/<html[^>]*style="[^"]*background-color:\s*#fffaf2/);
  });

  it('★下敷きは中身を隠さない(z-index で潜るだけ)', () => {
    // ★「隠して後で戻す」は止まる場所で戻せない前科がある(v0.1.1436→1437)。
    expect(sidepanelHtml).toMatch(/#nl-underlay\s*\{[\s\S]*?z-index:\s*0/);
    expect(sidepanelHtml).toMatch(/#nl-underlay\s*\{[\s\S]*?pointer-events:\s*none/);
  });

  it('★iframe は不透明のまま(透明にすると真っ黒になる前科)', () => {
    // v0.1.1279〜1283: 透明にして【真っ黒】になった。sidepanelBlackScreen が禁止済み。
    expect(sidepanelHtml).toMatch(/iframe \{[\s\S]*?background:\s*#fffaf2/);
    expect(sidepanelHtml).not.toMatch(/iframe \{[\s\S]*?background:\s*transparent/);
  });

  it('★透明化クラスは【生きている】(死んだCSSと誤認して消さない)', () => {
    /*
     * ★2026-08-20 の私の誤り(記録として残す):
     *   `iframe.nl-ifr-loading` を「誰も付けない死んだCSS」と判断して撤去しかけた。
     *   ★実際は `sidepanel-entry.js:72` が **定数経由**(`HIDDEN_CLASS`)で付けている。
     *   文字列 `'nl-ifr-loading'` で grep したので**呼び出し側が見つからなかった**。
     *   → `sidepanelIframeReveal.wiring.test.js` が6件赤になって気づけた。
     *
     *   ★教訓: **定数に切り出された名前は、生の文字列 grep では追えない**。
     *     「使われていない」と判断する前に**定数名でも grep する**。
     */
    const lib = read('src/lib/sidepanelIframeReveal.js');
    expect(lib, 'HIDDEN_CLASS の定義が消えた').toContain("HIDDEN_CLASS = 'nl-ifr-loading'");
    const entry = read('src/extension/sidepanel-entry.js');
    expect(entry, '付ける側が消えた=CSSが死ぬ').toContain('classList.add(HIDDEN_CLASS)');
    // ★付ける側が居るなら CSS も在らねばならない(片肺を防ぐ)
    expect(sidepanelHtml).toMatch(/iframe\.nl-ifr-loading\s*\{/);
  });
});
