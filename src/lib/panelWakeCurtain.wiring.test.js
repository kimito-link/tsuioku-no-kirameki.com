import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 「いつでも出せる幕」の配線検査。
 *
 * ■ なぜ要るか(2026-08-18 ユーザー報告)
 *   「まだひっぱたときくろいのでる」「しばらく閲覧してないとスリープモードっぽくなる」
 *   ＝復帰・幅変更のあとに黒が見える。初回の幕(3キャラ+台詞)を出し直して覆う。
 *
 * ★いちばん大事なのは【幕が DOM から消えないこと】。
 *   消すと二度と出せず、この対処そのものが成立しない(それが v0.1.1431 までの状態)。
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const ENTRY = 'src/extension/popup-entry.js';

describe('幕を消さない(再利用できる形になっているか)', () => {
  it('★幕を DOM から remove していない', () => {
    const code = strip(read(ENTRY));
    // shade.remove() が残っていると二度と出せない
    expect(code).not.toMatch(/shade\.remove\(\)/);
  });

  it('畳むときは hidden にするだけ', () => {
    const code = strip(read(ENTRY));
    expect(code).toMatch(/shade\.setAttribute\('hidden', ''\)/);
  });
});

describe('復帰・幅変更で出し直す配線', () => {
  it('★popup-entry から1行で仕掛けている', () => {
    const code = strip(read(ENTRY));
    expect(code).toContain('installPanelWakeCurtain');
    expect(code).toContain("from '../lib/panelWakeCurtainDom.js'");
  });

  it('★描けたかを数える手段を渡している(渡さないと上限まで覆いっぱなしになる)', () => {
    const code = strip(read(ENTRY));
    const at = code.indexOf('installPanelWakeCurtain(');
    expect(at).toBeGreaterThan(-1);
    expect(code.slice(at, at + 160)).toContain('countTiles');
  });

  it('復帰と幅変更の両方を見張っている', () => {
    const dom = strip(read('src/lib/panelWakeCurtainDom.js'));
    expect(dom).toContain("addEventListener('visibilitychange'");
    expect(dom).toContain("addEventListener('resize'");
  });

  it('★必ず自分で開ける(閉じ込めない)', () => {
    const dom = strip(read('src/lib/panelWakeCurtainDom.js'));
    expect(dom).toContain('hideWakeCurtain');
    expect(dom).toContain('shouldHideCurtain');
  });
});

describe('3キャラの幕をそのまま使う', () => {
  it('幕の markup に りんく/こん太/たぬ姉 が居る', () => {
    const html = read('extension/popup.html');
    const at = html.indexOf('nlInitialLoadShade');
    expect(at).toBeGreaterThan(-1);
    const block = html.slice(at, at + 1800);
    expect(block).toContain('data-who="link"');
    expect(block).toContain('data-who="konta"');
    expect(block).toContain('data-who="tanunee"');
  });

  it('台詞を差し替える口がある', () => {
    expect(read('extension/popup.html')).toContain('nlInitShadeSerif');
  });
});
