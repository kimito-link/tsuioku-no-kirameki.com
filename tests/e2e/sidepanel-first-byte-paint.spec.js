/**
 * サイドパネル「出た直後だけ黒い」の 6 度目の根治を実測する spec。
 *
 * ■ 実機が名指しした症状(v0.1.1298 の自己診断・2026-08-09)
 *     🔴黒くなりうる / 0x0 / 外✅ iframe✅ 中✅ / 原因=iframeが潰れている(0x0)
 *     ★出た直後だけ黒い(immediate時点で検知・今は正常)
 *   3層とも【正しく塗っている】のに黒い = 塗る人が居ないのではなく
 *   塗る【面積がゼロ】= まだ <html> が生まれていない瞬間がある。
 *
 * ■ 真因(バイト単位で計測)
 *   <!DOCTYPE html> と <html style="..."> のあいだに約1,045バイト(popup.html は1,233)の
 *   コメントが挟まっており、ブラウザがそれを読み終わるまで地の色が効かなかった。
 *   → <html> を DOCTYPE の直後(1行目)へ移し、コメントは <html> の【後ろ】へ。
 *
 * ■ この spec が測ること
 *   「最初のバイトで地が塗られるか」を、実ファイルのバイト位置で断言する。
 *   ★既存の sidepanel-flash-capture.spec.js は setViewportSize 済みで開くため
 *     0x0 の瞬間を再現できない(=この穴を検出できなかった)。だからバイトで測る。
 */

import { test, expect } from './fixtures.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

/** 地の色(background)が効くまでに読まねばならないバイト数。 */
function bytesUntilPainted(file) {
  const s = fs.readFileSync(path.join(repoRoot, file), 'utf8');
  const styleAt = s.indexOf('style=');
  if (styleAt < 0) return Infinity;
  // ★style 値の閉じ引用符まで読めば地の色が確定する。`>` を探すと
  //   linear-gradient(...) 内には `>` が無いので行末まで飛ぶ実装ミスを招く。
  const q = s.indexOf('"', styleAt + 'style='.length);
  const end = q < 0 ? -1 : s.indexOf('"', q + 1);
  if (end < 0) return Infinity;
  return Buffer.byteLength(s.slice(0, end + 1), 'utf8');
}

/** 実タグだけ数える(コメント/CSSコメント内の散文を除外)。 */
function realTagCount(file, tag) {
  const s = fs
    .readFileSync(path.join(repoRoot, file), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
  return (s.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length;
}

const PAGES = ['extension/sidepanel.html', 'extension/popup.html'];

test.describe('サイドパネル: 最初のバイトで地を塗る', () => {
  for (const page of PAGES) {
    test(`${page} は 200 バイト以内に地の色が効く`, () => {
      const n = bytesUntilPainted(page);
      // 修正前: sidepanel=1045 / popup=1233。DOCTYPE直後に置けば 200 未満に収まる。
      expect(n).toBeLessThan(200);
    });

    test(`${page} の <html> はちょうど1つ(移設で重複させていない)`, () => {
      expect(realTagCount(page, 'html')).toBe(1);
      expect(realTagCount(page, 'head')).toBe(1);
      expect(realTagCount(page, 'body')).toBe(1);
    });
  }

  test('popup.html は移設後も cloak/recording/terms-ack 属性を保っている', () => {
    const s = fs.readFileSync(path.join(repoRoot, 'extension/popup.html'), 'utf8');
    // ★1行目まるごとを見る。`>` で切ると gradient の `)` より手前の `>` に当たらず、
    //   逆に style 値の途中で切れて属性を見落とす(実際にこれで一度誤検知した)。
    const firstTag = s.slice(0, s.indexOf('\n'));
    // ★属性を落とすと別の不具合になる(cloak が無いと段階描画のちらつきが戻る)。
    expect(firstTag).toContain('data-nl-popup-primary-cloak="1"');
    expect(firstTag).toContain('data-nl-recording="on"');
    expect(firstTag).toContain('data-nl-usage-terms-ack="1"');
    expect(firstTag).toMatch(/color-scheme:\s*light/);
  });

  test('★実ブラウザで開いて documentElement が塗られている(構造が壊れていない)', async ({
    context
  }) => {
    let sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
    if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    const extensionId = new URL(sw.url()).hostname;

    const p = await context.newPage();
    await p.emulateMedia({ colorScheme: 'dark' }); // 実機はダーク
    await p.goto(`chrome-extension://${extensionId}/sidepanel.html`, { waitUntil: 'load' });

    const got = await p.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return {
        tag: document.documentElement.tagName,
        colorScheme: cs.colorScheme,
        paints: cs.backgroundImage !== 'none' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)',
        heads: document.querySelectorAll('head').length,
        bodies: document.querySelectorAll('body').length,
        hasIframe: Boolean(document.querySelector('iframe'))
      };
    });

    expect(got.tag).toBe('HTML');
    expect(got.colorScheme).toBe('light');
    expect(got.paints).toBe(true);
    expect(got.heads).toBe(1);
    expect(got.bodies).toBe(1);
    expect(got.hasIframe).toBe(true);
    await p.close();
  });
});
