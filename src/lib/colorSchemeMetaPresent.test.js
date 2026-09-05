import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');

/**
 * ★`<meta name="color-scheme">` が【両方の文書に】あることを固定する(v0.1.1316)。
 *
 * ■ なぜ必要か（2026-08-10・実ブラウザで実測して分かったこと）
 *   `<html style="color-scheme: light">` は【CSS が適用された後】にしか効かない。
 *   `<meta name="color-scheme">` は【パースの初期段階】でブラウザに伝わる。
 *   その差の区間で、ユーザー環境がダークだとブラウザはキャンバス(まだ何も描かれて
 *   いない地)を暗色で塗る＝「パネルを開いた瞬間だけ黒い」。
 *
 *   ★出荷ビルドを実ブラウザ(prefers-color-scheme: dark)で開いて調べたところ、
 *     sidepanel.html / popup.html の【どちらにも meta が無かった】。
 *     インライン style は両方にあるため、CSS 適用後(=settled state)を測ると
 *     毎回「正常」に見えていた([[settled-state-hides-flash-bugs-2026-08-07]])。
 *
 * ■ light 固定である理由
 *   このアプリに実質ダークモードは無い(popup-entry.js が nl-skin-panel-dark を
 *   無条件 remove する=v0.1.51)。`light dark` と書くとダーク環境でキャンバス既定が
 *   暗色になり、同じ穴に戻る([[settled-state-hides-flash-bugs-2026-08-07]] の真因)。
 */
const TARGETS = [
  ['extension/sidepanel.html', 'サイドパネルの入れ物'],
  ['extension/popup.html', 'サイドパネルの中身(iframe)']
];

describe('color-scheme の meta 宣言', () => {
  for (const [rel, label] of TARGETS) {
    const html = readFileSync(join(root, rel), 'utf8');

    it(`★${label}(${rel}) に <meta name="color-scheme"> がある`, () => {
      expect(html).toMatch(/<meta\s+name="color-scheme"\s+content="light"\s*\/?>/);
    });

    it(`★${label} の meta は light 固定('light dark' にしない)`, () => {
      const m = html.match(/<meta\s+name="color-scheme"\s+content="([^"]*)"/);
      expect(m, 'meta が読めること').toBeTruthy();
      expect(m[1].trim()).toBe('light');
    });

    it(`★${label} の meta は charset の直後(パース初期に効かせる)`, () => {
      // charset より前に置くと文字化けの危険、遠くに置くと効き始めが遅れる。
      expect(html).toMatch(
        /<meta\s+charset="[^"]*"\s*\/?>[\s\S]{0,2500}?<meta\s+name="color-scheme"/i
      );
    });

    it(`★${label} の <html> インライン color-scheme も light のまま(二重防衛)`, () => {
      // meta だけに頼らない。CSS 適用後はこちらが効く。
      expect(html).toMatch(/<html[^>]*style="[^"]*color-scheme:\s*light/i);
    });
  }
});
