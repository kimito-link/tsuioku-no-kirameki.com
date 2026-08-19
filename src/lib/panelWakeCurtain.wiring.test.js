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

describe('★出し直しは不透明でなければ意味がない(実機で踏んだ)', () => {
  /*
   * 実機(2026-08-18): 幕を出し直しても opacity:0 のままで【透けていた】。
   * 初回の 5s CSS 保険が forwards なので、一度終わると opacity:0 で固定される。
   * hidden を外すだけでは黒を隠せない=対処が成立していなかった。
   * ★テストが緑でも実機で見るまで分からなかった代表例。
   */
  it('出すときに保険を打ち切るクラスを付ける', () => {
    const dom = strip(read('src/lib/panelWakeCurtainDom.js'));
    expect(dom).toContain('nl-init-shade--rearm');
    const at = dom.indexOf('removeAttribute');
    expect(at).toBeGreaterThan(-1);
    expect(dom.slice(at, at + 260)).toContain('REARM_CLASS');
  });

  it('★CSS がそのクラスで不透明に戻す(2画面とも)', () => {
    for (const f of ['extension/popup.html', 'app/live-view.html']) {
      const css = read(f);
      const at = css.indexOf('.nl-init-shade--rearm');
      expect(at).toBeGreaterThan(-1);
      const block = css.slice(at, css.indexOf('}', at));
      expect(block).toContain('animation: none');
      expect(block).toContain('opacity: 1');
    }
  });

  it('畳むときにクラスを外す(次の初回保険を邪魔しない)', () => {
    const dom = strip(read('src/lib/panelWakeCurtainDom.js'));
    expect(dom).toMatch(/classList\.remove\(REARM_CLASS\)/);
  });
});

describe('★★幕は【出たら必ず数字に出る】(v0.1.1441+)', () => {
  /*
   * ■ なぜこの検査が要るか(ユーザー要望の本体)
   *   「幕自体を診断に入れてださないように。
   *    もちろん構造的に出さない方が正解」
   *
   *   幕は position:fixed / inset:0 / z-index:99999 で【画面全部を覆う】。
   *   覆っている間はユーザーから見て「黒い影」に見える。
   *   ★その幕が【出たこと自体を隠していた】のが今回の真因:
   *     panelWakeCurtainDom.js は shownResize を数えていたが、
   *     getPanelWakeCurtainDiag() の呼び手がリポ全体でゼロだった。
   *     [[unwired-judgement-is-systemic-2026-08-12]]
   */
  it('★幅変更で幕を出す経路は kill スイッチで止まっている', () => {
    const lib = read('src/lib/panelWakeCurtain.js');
    expect(lib).toContain('export const RESIZE_CURTAIN_ENABLED = false;');
    expect(lib).toMatch(/if \(!RESIZE_CURTAIN_ENABLED\) return false;/);
  });

  it('★幕を出したら storage に書く(数えているその場で書く)', () => {
    const dom = read('src/lib/panelWakeCurtainDom.js');
    expect(dom).toContain('KEY_PANEL_WAKE_CURTAIN_DIAG');
    expect(dom).toMatch(/function publishCurtainDiag\(\)/);
    // ★呼び出しは【出したときと畳んだときの2箇所】
    const calls = dom.match(/publishCurtainDiag\(\);/g) || [];
    expect(calls.length).toBe(2);
  });

  it('★状態速報がその値を読む(読み手が居ない計器を作らない)', () => {
    const extras = read('src/lib/statusExtrasBatch.js');
    expect(extras).toContain('KEY_PANEL_WAKE_CURTAIN_DIAG');
    expect(extras).toMatch(/panelWakeCurtainDiag: b\[KEY_PANEL_WAKE_CURTAIN_DIAG\]/);
  });
});
