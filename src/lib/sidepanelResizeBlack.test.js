import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');
const sidepanelHtml = read('extension/sidepanel.html');

/**
 * ★「引っ張った瞬間に黒くなる」— ユーザーが何度も報告している症状。
 *
 * ■ ユーザーの証言(一次情報・複数回)
 *   「くろいのがきえない」「引っ張った瞬間」
 *   ★「サイドパネル導入時はなかった」
 *
 * ■ git で裏が取れる
 *   導入時(795c41b3)の sidepanel.html は **25行・script無し・下敷き無し**。
 *   黒は v0.1.1279 から始まり、以後「黒を消す工夫」を積み続けた。
 *   ＝**足したものの中に原因がある**。
 *
 * ■ ★真因(2026-08-20 コードで特定)
 *   `#nl-underlay { position: absolute; inset: 0 }` は
 *   **位置指定された祖先**を基準に大きさが決まる。
 *   ところが `body` に `position` の指定が【無い】ので、
 *   基準は**初期包含ブロック**になる。
 *   ★**パネルを引っ張って広げた瞬間、下敷きは古い幅のまま**＝
 *   新しく現れた帯に地の色が無く、そこが黒く見える。
 *
 * ■ ★直し方(足すのではなく、依存を消す)
 *   下敷きという「追従が遅れうる要素」に頼らず、
 *   **html/body 自身の背景**で塗る。ビューポートの背景は
 *   ブラウザがキャンバス全体へ広げるので、**リサイズで遅れる余地が無い**。
 *   ★下敷きは残すが、**祖先に position を与えて確実に追従させる**。
 */
describe('★引っ張った瞬間の黒(リサイズで下敷きが追従しない)', () => {
  it('★★下敷きの祖先が位置指定されている(でないと古い幅のまま残る)', () => {
    /*
     * ★これが今回の真因。`position:absolute` は「位置指定された祖先」基準。
     *   body に position が無いと初期包含ブロック基準になり、
     *   幅変更に追従しない＝新しい帯に地の色が届かない。
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
