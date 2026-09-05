// extensionCspInlineScript.test.js
// ★拡張ページの CSP 違反を【出荷前に】止める関所。
//
// ■ なぜ要るか(2026-08-12・v0.1.1353 の実機エラー)
//   幕を外す保険を popup.html にインライン <script> で書いて出荷した。
//   拡張の CSP は manifest.json で `script-src 'self'` と宣言されており、
//   インライン実行はブラウザにブロックされる:
//     Executing inline script violates the following Content Security Policy
//     directive "script-src 'self'". ... The action has been blocked.
//   ＝**保険は一度も実行されなかった**。しかもテストは全部緑・verify:cc も OK で、
//   ユーザーが chrome://extensions のエラー画面を見つけて初めて分かった。
//
//   ★これは「動くはずのコードが実は1行も動いていない」型の事故で、
//     [[unwired-judgement-is-systemic-2026-08-12]] と同じ穴(配線したつもり)。
//     単体テストは JS を直接 import するので CSP を通らず、永久に気づけない。
//
// ■ この関所が見るもの(静的検査・実ブラウザ不要)
//   1. 拡張の HTML に中身入りの <script> が無いこと(=CSP違反そのもの)
//   2. <script src> が拡張内(self)を指すこと(外部CDNはCSP違反)
//   3. インラインのイベントハンドラ属性(onclick= 等)が無いこと(同じくブロックされる)
//   4. javascript: URL が無いこと
//   ★manifest の宣言を読み、'unsafe-inline' が入っていないことも確認する
//     (宣言が緩められたらこの検査の前提が変わるので、そこも固定する)。

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const EXT_DIR = path.join(REPO_ROOT, 'extension');

/** 拡張ページとして読み込まれる HTML(=CSPが効く対象)。 */
const EXTENSION_HTML_FILES = readdirSync(EXT_DIR).filter((f) => f.endsWith('.html'));

/** @param {string} file */
function readExtHtml(file) {
  return readFileSync(path.join(EXT_DIR, file), 'utf8');
}

/**
 * <script ...>...</script> を全部取り出す。
 * @param {string} html
 * @returns {Array<{ tag: string, body: string }>}
 */
function findScripts(html) {
  /** @type {Array<{ tag: string, body: string }>} */
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    out.push({ tag: m[1] || '', body: m[2] || '' });
  }
  return out;
}

describe('manifest の CSP 宣言(この関所の前提)', () => {
  const manifest = JSON.parse(readFileSync(path.join(EXT_DIR, 'manifest.json'), 'utf8'));
  const csp = String(manifest?.content_security_policy?.extension_pages || '');

  it('extension_pages の script-src が self 限定(unsafe-inline を含まない)', () => {
    expect(csp).toContain("script-src 'self'");
    // ★ここが緩められると「インラインでも動く」ようになり、本ファイルの検査の意味が変わる。
    //   緩めること自体は審査リスクなので、宣言ごと固定する。
    expect(csp).not.toContain('unsafe-inline');
  });
});

describe('★拡張HTMLに CSP でブロックされる書き方が無い(出荷前に止める)', () => {
  it('検査対象の HTML が1つ以上ある(空回りしていない)', () => {
    // ★0件だと以下の for が1件も検査せず緑になる(zero-count-may-mean-unmeasured)。
    expect(EXTENSION_HTML_FILES.length).toBeGreaterThan(0);
  });

  for (const file of EXTENSION_HTML_FILES) {
    describe(file, () => {
      const html = readExtHtml(file);
      const scripts = findScripts(html);

      it('★中身入りの <script> が無い(インライン実行はブロックされる)', () => {
        const inline = scripts.filter((s) => s.body.trim().length > 0);
        const detail = inline.map((s) => s.body.trim().slice(0, 80)).join(' | ');
        expect(inline.length, `インライン script: ${detail}`).toBe(0);
      });

      it('<script> は必ず src を持ち、拡張内(self)を指す', () => {
        for (const s of scripts) {
          const src = /src\s*=\s*["']([^"']+)["']/i.exec(s.tag);
          expect(src, `src の無い <script> がある: <script${s.tag}>`).toBeTruthy();
          const url = src[1];
          expect(/^https?:\/\//i.test(url), `外部URL は CSP 違反: ${url}`).toBe(false);
          expect(url.startsWith('//'), `プロトコル相対URL は CSP 違反: ${url}`).toBe(false);
        }
      });

      it('インラインのイベントハンドラ属性が無い(onclick= 等もブロックされる)', () => {
        // 一般的なものを網羅。属性名の直後が = であることまで見る。
        const m = html.match(
          /\s(onclick|onload|onerror|onchange|oninput|onsubmit|onmouseover|onfocus|onblur|onkeydown|onkeyup)\s*=/gi
        );
        expect(m ? m.join(', ') : '').toBe('');
      });

      it('javascript: URL が無い', () => {
        expect(/["'\s]javascript:/i.test(html)).toBe(false);
      });
    });
  }
});

/*
 * ★v0.1.1354: 幕の保険が「CSPを通る形で・バンドルより前に」置かれていることを固定する。
 *   インラインに戻すと上の検査が赤になり、順序が逆になるとここが赤になる。
 */
describe('★幕の保険は別ファイルかつ popup.js より前(CSP を通る最速の起点)', () => {
  const html = readExtHtml('popup.html');

  it('dist/cloak-failsafe.js を読み込んでいる', () => {
    expect(html).toContain('<script src="dist/cloak-failsafe.js"></script>');
  });

  it('★その読み込みは dist/popup.js より前(後ろだと起点が遅れて無意味)', () => {
    const failsafeIdx = html.indexOf('<script src="dist/cloak-failsafe.js"');
    const bundleIdx = html.indexOf('<script src="dist/popup.js"');
    expect(failsafeIdx).toBeGreaterThan(0);
    expect(bundleIdx).toBeGreaterThan(0);
    expect(failsafeIdx).toBeLessThan(bundleIdx);
  });

  it('保険の実体がビルド対象に登録されている(HTMLだけ足して404を出さない)', () => {
    const buildSrc = readFileSync(path.join(REPO_ROOT, 'scripts', 'build.mjs'), 'utf8');
    expect(buildSrc).toContain('src/extension/cloak-failsafe-entry.js');
    expect(buildSrc).toContain('extension/dist/cloak-failsafe.js');
  });
});
