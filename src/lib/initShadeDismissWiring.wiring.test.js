import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 初回シェードを【必ず畳む】配線の検査。
 *
 * ★守っているのは「幕が畳まれないまま残らないこと」。
 *   実測(2026-08-19 状態速報)で dismissCalls=0 / docHidden=1 のまま
 *   「初回シェード t+801ms まで中身を覆っていた ★主因=初回シェード」だった。
 *   ＝サイドパネルが hidden 扱いのとき visibilitychange を待ち続け、
 *     締切が一度も始まらない = CSSの0.9秒不透明がそのまま黒に見えた。
 */

const read = (rel) => readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
const entry = () => read('src/extension/popup-entry.js');

describe('見えていなくても締切を開始する', () => {
  it('★visibilitychange を待つだけで終わらせない(hidden でも締切を開始)', () => {
    const s = entry();
    const at = s.indexOf('function armInlineShadeDeadlineOnFirstVisible');
    expect(at).toBeGreaterThan(-1);
    const body = s.slice(at, at + 2600);
    // visibilitychange の購読は残す(見えた瞬間に早く畳むため)
    expect(body).toContain("'visibilitychange'");
    /*
     * ★購読登録の【直後】に arm() があることを見る。
     *   ※回数だけ・広い範囲だけだと、別の arm() を拾って
     *     変異が素通りした(2回実際に素通りさせてしまった)。
     *   [[mutation-test-needs-anchored-regex-2026-08-05]]
     */
    const anchor = body.indexOf('{ once: true }');
    expect(anchor).toBeGreaterThan(-1);
    const tail = body.slice(anchor, anchor + 1400);
    // 閉じ括弧のあと、次の関数に入る前に arm() が居ること
    const beforeCatch = tail.split('} catch')[0];
    expect(beforeCatch).toMatch(/^\s*arm\(\);/m);
  });

  it('★判定は純関数に切り出してある(entry に閾値を直書きしない)', () => {
    const lib = read('src/lib/initShadeDismissPolicy.js');
    expect(lib).toContain('export function shouldDismissInitShade');
    expect(lib).toContain('HIDDEN_DISMISS_CAP_MS');
  });

  it('★見えていないときの上限は1秒以内(人が気づく長さにしない)', () => {
    const lib = read('src/lib/initShadeDismissPolicy.js');
    const m = /HIDDEN_DISMISS_CAP_MS\s*=\s*(\d+)/.exec(lib);
    expect(m).toBeTruthy();
    expect(Number(m[1])).toBeLessThanOrEqual(1000);
  });

  it('★CSS側の保険も残っている(JSが動けない場合の最後の砦)', () => {
    const html = read('extension/popup.html');
    expect(html).toMatch(/@keyframes nl-init-shade-css-failsafe/);
  });
});
