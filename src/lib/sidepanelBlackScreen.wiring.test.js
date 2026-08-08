import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// CRLF 正規化(アンカー付き regex が改行を跨ぐため)。
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

const popupHtml = read('extension/popup.html');
const sidepanelHtml = read('extension/sidepanel.html');

/**
 * ★サイドパネル真っ黒の再発防止（2026-08-07・v0.1.1285）。
 *
 * 同じ症状を3回直している:
 *   v0.1.1279 iframe にも transparent を足した → 3層すべて透明になり悪化
 *   v0.1.1283 入れ物(sidepanel.html)を不透明にした → 中身(popup.html)が残っていた
 *   v0.1.1285 中身の `transparent !important` を撤去 ← 今回
 *
 * 真因の構造:
 *   `data-nl-popup-primary-cloak` は popup.html の <html> に【静的に】書かれている＝
 *   JS が1行も走らなくても有効。そこへ html/body を transparent にする規則があると、
 *   JS が reveal に到達しない限り「地の色を塗る人が誰も居ない」状態が続き、
 *   下の暗い層が透けて【真っ黒】になる。
 *   CSS の自動 reveal フェイルセーフは opacity しか戻さない＝背景は救えない。
 *
 * ★CSP が `script-src 'self'` なので、head のインライン script で URL を見て
 *   出し分ける案は【使えない】(2026-08-07 実機でブロックを確認済み)。
 *   よって「既定を安全側に倒す」以外の解は取れない。
 */
describe('★サイドパネルが真っ黒にならない(CSSだけで担保する)', () => {
  it('★cloak 中に html/body を透明にする規則が【存在しない】', () => {
    // コメント中の言及は除外して、実際の CSS 宣言だけを見る。
    const withoutComments = popupHtml.replace(/\/\*[\s\S]*?\*\//g, '');
    // `html[data-nl-popup-primary-cloak='1'] ... { background: transparent }` の形が無いこと。
    expect(withoutComments).not.toMatch(
      /html\[data-nl-popup-primary-cloak='1'\][^{]*\{[^}]*background:\s*transparent/
    );
    // body 側も同様(セレクタが2行に分かれている形も潰す)。
    expect(withoutComments).not.toMatch(
      /data-nl-popup-primary-cloak='1'\]\s*body\s*\{[^}]*background:\s*transparent/
    );
  });

  it('★cloak の本体(中身を隠す opacity)は残っている(白フラッシュ防止は失っていない)', () => {
    // 背景の透明化を撤去しても、ちらつき防止の主役はこちら＝これが消えたら別の退行。
    expect(popupHtml).toMatch(
      /html\[data-nl-popup-primary-cloak='1'\] \.nl-popup-primary \{\n\s*opacity: 0;/
    );
    // JS 非依存の自動 reveal フェイルセーフも残っていること。
    expect(popupHtml).toMatch(/animation: nl-popup-primary-cloak-auto-reveal/);
  });

  it('★入れ物(sidepanel.html)の3層が不透明のまま(v0.1.1283 の修正を失っていない)', () => {
    // html/body の既定背景(クリーム)。
    expect(sidepanelHtml).toMatch(/background: linear-gradient\(160deg, #fffaf2, #eef8ff\)/);
    // iframe 自身も塗る(最後の砦)。
    expect(sidepanelHtml).toMatch(/iframe \{[\s\S]*?background: #fffaf2;/);
    // ★transparent に戻す変異を拒否する。
    expect(sidepanelHtml).not.toMatch(/iframe \{[\s\S]*?background: transparent/);
  });

  it('★popup 本体の通常背景(body)が塗る指定を持っている=最後に効く地の色', () => {
    expect(popupHtml).toMatch(/background: linear-gradient\(160deg, var\(--nl-bg\), var\(--nl-bg-soft\)\)/);
  });

  it('★sidepanel.html の <html> がインライン style で先に塗る(v0.1.1294・黒い一瞬の残り)', () => {
    /*
     * 実測(v0.1.1293・ダーク・rAF全フレーム記録):
     *   t=0ms <html> 未生成=何も塗られていない ← Chrome の地(暗色)が出る窓
     *   t=4ms ようやく <style> が効いて cs=light / grad
     * <style> では塞げない(CSS がまだ読まれていない)。塞げるのは html タグの属性だけ。
     * ★popup.html は v0.1.1289 で同じ手当て済み。その【外側の入れ物】が
     *   取り残されていたのが今回の残り。サイドパネルは開くたびここから読まれる。
     */
    expect(sidepanelHtml).toMatch(
      /<html[^>]*\sstyle="[^"]*color-scheme:\s*light[^"]*"/
    );
    expect(sidepanelHtml).toMatch(
      /<html[^>]*\sstyle="[^"]*background:\s*linear-gradient\(160deg, #fffaf2, #eef8ff\)[^"]*"/
    );
  });

  it('★popup.html の <html> も同じくインライン style で先に塗る(v0.1.1289 を失わない)', () => {
    expect(popupHtml).toMatch(/<html[^>]*\sstyle="[^"]*color-scheme:\s*light[^"]*"/);
  });

  it('★CSP が inline script を禁じている(head スクリプト解を復活させない歯止め)', () => {
    const manifest = JSON.parse(read('extension/manifest.json'));
    const csp = String(manifest.content_security_policy?.extension_pages || '');
    expect(csp).toContain("script-src 'self'");
    // popup.html に <script> の直書きが無いこと(あってもCSPで死ぬ=気づかない不具合になる)。
    expect(popupHtml).not.toMatch(/<script>\s*\(function/);
  });
});
