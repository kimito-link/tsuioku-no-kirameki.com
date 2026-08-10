import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const sidepanelHtml = readFileSync(join(root, 'extension/sidepanel.html'), 'utf8');
const popupHtml = readFileSync(join(root, 'extension/popup.html'), 'utf8');
const manifest = JSON.parse(readFileSync(join(root, 'extension/manifest.json'), 'utf8'));

/**
 * ★パネル枠の地色が3箇所でずれないことを機械で固定する。
 *
 * 経緯(2026-08-10・実データで測って確定):
 *   黒画面は拡張の中身ではなく、Chrome が【パネル枠を滑り出させている間】の地色だった。
 *   ・幕(cloak)は t+1,082〜1,285ms で解除(修正前後で差が無い＝cloak は犯人ではない)
 *   ・page.goto で直接開くと t=16ms から既にクリーム色＝黒は一度も出ない
 *   HTML の背景は【パース前】のフレームに効かないので、枠を描く側(ブラウザ)に
 *   theme-color / manifest.theme_color で教えるしかない。
 *
 * ★この種の「複数箇所に同じ色を書く」規約はコメントで注意しても必ずずれる
 *   (sidepanel.html:14 が実際に「3箇所とも」と書いていたのにずれた実績がある)ので、
 *   検査で固定する。
 */
const EXPECTED = '#fffaf2';

describe('パネル枠の地色(theme-color)の一致', () => {
  /*
   * ★v0.1.1311(2026-08-10): manifest の `theme_color` は【拡張では認識されない】。
   *   一度これを追加して実機で
   *     Unrecognized manifest key 'theme_color'.
   *   の警告を出した(拡張カードに黄色い「警告」ボタンが付く)。
   *   Chrome 拡張の manifest は許可キーのみ受理する＝Web App Manifest とは別物。
   *   ★確認せずに追加した私の誤り。以後、増やしたキーは実機の警告まで見ること。
   */
  it('★manifest.json に theme_color を入れない(拡張では未対応キー＝警告になる)', () => {
    expect(manifest.theme_color).toBeUndefined();
  });

  it('sidepanel.html に <meta name="theme-color"> がある', () => {
    expect(sidepanelHtml).toMatch(/<meta name="theme-color" content="#fffaf2" \/>/);
  });

  it('★HTML パース前に効くよう <head> の先頭側(charset の直後)に置く', () => {
    // viewport より後ろに落とすと意味が薄れるので、順序ごと固定する。
    expect(sidepanelHtml).toMatch(
      /<meta charset="utf-8" \/>[\s\S]{0,2000}?<meta name="theme-color"[\s\S]{0,200}?<meta name="viewport"/
    );
  });

  it('sidepanel.html の <html> インライン背景と同じ色', () => {
    const m = sidepanelHtml.match(/<html[^>]*style="[^"]*background:\s*linear-gradient\([^)]*?(#[0-9a-f]{6})/i);
    expect(m, '<html> のインライン背景が読めること').toBeTruthy();
    expect(m[1].toLowerCase()).toBe(EXPECTED);
  });

  it('popup.html(中身)の <html> インライン背景とも同じ色', () => {
    const m = popupHtml.match(/<html[^>]*style="[^"]*background:\s*linear-gradient\([^)]*?(#[0-9a-f]{6})/i);
    expect(m, 'popup.html の <html> インライン背景が読めること').toBeTruthy();
    expect(m[1].toLowerCase()).toBe(EXPECTED);
  });
});
