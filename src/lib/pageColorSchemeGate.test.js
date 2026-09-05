/**
 * pageColorSchemeGate.test.js — 全ページに黒画面対策が入っているかを機械で保証する。
 *
 * ★なぜ要るか(2026-08-16 実機・診断ページが【全面真っ黒】)
 *   sidepanel.html は v0.1.1299〜1316 の **7版**かけて対策を確立した:
 *     ① <html> のインライン style に color-scheme: light
 *     ② <meta name="color-scheme" content="light">
 *   ところが **status.html には1つも入っていなかった**(実測: meta 0件)。
 *   comeview / live-view / venue も同様に素通しだった。
 *   ＝ **1枚直して、兄弟を放置していた**。このリポが繰り返してきた型
 *     ([[fail-open-recurs-under-new-names-2026-08-12]]:
 *      同じ穴が別名で再発する。個別に塞がず数で固定する)。
 *
 * ■ 何を保証するか
 *   拡張の全 HTML が、CSS 適用前の区間でも暗色にならないこと。
 *   ★新しいページを足した人が忘れたら、ここが赤くなる。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const EXT_DIR = join(process.cwd(), 'extension');

/**
 * ★背景を塗ってはいけないページ。
 *   comeview は OBS 透過用なので不透明にすると配信の合成が壊れる。
 *   offscreen は画面に出ない(音声処理用)。
 */
const NO_BACKGROUND = new Set(['comeview.html', 'offscreen.html']);

/** 画面に出ないページ(色の宣言そのものが不要)。 */
const NOT_VISIBLE = new Set(['offscreen.html']);

function listPages() {
  return readdirSync(EXT_DIR).filter((f) => f.endsWith('.html'));
}

describe('黒画面対策の網羅(全ページ)', () => {
  const pages = listPages();

  it('拡張のHTMLを実際に見つけている(検査が空振りしていない)', () => {
    expect(pages.length).toBeGreaterThan(4);
    expect(pages).toContain('status.html');
    expect(pages).toContain('sidepanel.html');
  });

  for (const page of listPages()) {
    if (NOT_VISIBLE.has(page)) continue;

    describe(page, () => {
      const html = readFileSync(join(EXT_DIR, page), 'utf8');
      const firstLine = html.split('\n')[0];

      it('★<html> のインライン style に color-scheme がある(CSS適用後に効く層)', () => {
        expect(
          /<html[^>]*style=["'][^"']*color-scheme/i.test(firstLine),
          `${page} の1行目に color-scheme のインライン指定が無い`
        ).toBe(true);
      });

      it('★<meta name="color-scheme"> がある(パース初期に効く層)', () => {
        expect(
          /<meta\s+name=["']color-scheme["']/i.test(html),
          `${page} に meta color-scheme が無い`
        ).toBe(true);
      });

      it('★light 固定である(light dark だとダーク環境で同じ穴に戻る)', () => {
        const m = html.match(/<meta\s+name=["']color-scheme["']\s+content=["']([^"']+)["']/i);
        expect(m, `${page} の meta content が読めない`).toBeTruthy();
        expect(String(m?.[1]).trim()).toBe('light');
      });

      if (!NO_BACKGROUND.has(page)) {
        it('地の色を <html> に置いている(何も描かれていない間の地)', () => {
          expect(
            /<html[^>]*style=["'][^"']*background/i.test(firstLine),
            `${page} の1行目に background が無い`
          ).toBe(true);
        });
      } else {
        it('★透過が要るページは background を置かない(OBS合成を壊さない)', () => {
          expect(
            /<html[^>]*style=["'][^"']*background/i.test(firstLine),
            `${page} は透過が必要なので background を置いてはいけない`
          ).toBe(false);
        });
      }
    });
  }
});
