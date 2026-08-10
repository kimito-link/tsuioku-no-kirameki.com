import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const popupHtml = readFileSync(join(root, 'extension/popup.html'), 'utf8');

/**
 * ★画面全体を覆う要素に「変数が未定義なら暗い色」を書かせない(v0.1.1319)。
 *
 * ■ 経緯(2026-08-10)
 *   初回ロードシェード(.nl-init-shade)は position:fixed inset:0 z-index:99999 で
 *   【画面全部を覆う】。ここに
 *       background: linear-gradient(180deg, var(--nl-bg, #0b1220), var(--nl-bg-soft, #111827));
 *   と書かれていた。`#0b1220` は v0.1.1279 で「事実上の黒」と判定して撤去した色そのもの。
 *   通常は <html> のインライン style が --nl-bg を定義するので発火しないが、
 *   その定義が間に合わない/失われた瞬間だけ【全画面が濃紺=黒】になる。
 *   ★このアプリに実質ダークモードは無い(v0.1.51 で light 強制)ので、
 *     ダーク時だけ色を変える理由が無い＝規則ごと撤去した。
 *
 * ■ この検査が守ること
 *   「変数のフォールバックに暗い色」を全画面要素へ再び書かない。
 *   書くなら明るい既定色にする(未定義時に黒くなる経路を作らない)。
 *   [[css-default-should-be-the-safe-state-2026-08-05]]
 */
describe('全画面を覆う要素に暗いフォールバック色を書かない', () => {
  it('★.nl-init-shade のダーク上書き規則が無い', () => {
    // `.nl-init-shade {` がダークメディアクエリの中に現れないこと。
    const darkBlocks = [...popupHtml.matchAll(/@media \(prefers-color-scheme: dark\)\s*\{([\s\S]*?)\n {6}\}/g)];
    for (const [, body] of darkBlocks) {
      expect(body, 'ダーク規則に .nl-init-shade を入れない').not.toMatch(/\.nl-init-shade\b/);
    }
  });

  it('★v0.1.1279 で撤去した濃紺 #0b1220 が popup.html に無い', () => {
    // コメント中の言及(経緯の説明)は許す=CSS 値としての出現だけを禁じる。
    const cssValueUse = /background[^;]*#0b1220|#0b1220[^*\n]*;/i.test(popupHtml);
    expect(cssValueUse, '#0b1220 を CSS 値として使わない').toBe(false);
  });

  it('★初回ロードシェードの既定背景はライト(クリーム)のまま', () => {
    // 撤去しても既定規則は生きている必要がある(塗る人が必ず居る)。
    expect(popupHtml).toMatch(
      /\.nl-init-shade\s*\{[\s\S]{0,400}?background:\s*linear-gradient\(180deg,\s*var\(--nl-bg,\s*#f6fff8\)/
    );
  });

  it('★シェードは全画面を覆う設計のまま(この検査の前提)', () => {
    // inset:0 / z-index が消えていたら、この検査の意味が変わるので一緒に固定する。
    expect(popupHtml).toMatch(/\.nl-init-shade\s*\{[\s\S]{0,200}?position:\s*fixed/);
    expect(popupHtml).toMatch(/\.nl-init-shade\s*\{[\s\S]{0,200}?inset:\s*0/);
  });
});
