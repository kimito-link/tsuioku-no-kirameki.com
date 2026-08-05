import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const contentSrc = read('extension/content-entry.js');

function fnBody(src, decl) {
  const i = src.indexOf(decl);
  if (i < 0) return '';
  const end = src.indexOf(String.fromCharCode(10) + '}' + String.fromCharCode(10), i);
  return end < 0 ? src.slice(i) : src.slice(i, end + 2);
}

describe('inlinePanelShowGate の配線', () => {
  it('純関数を import している', () => {
    expect(contentSrc).toContain("from '../lib/inlinePanelShowGate.js'");
  });

  it('★旧ゲート(3フラグ直書き)が残っていない(判定が二重にならない)', () => {
    expect(contentSrc).not.toMatch(
      /!inlinePanelAutoshowEnabled &&\n\s*!toolbarInitiatedShowThisSession &&\n\s*!inlinePanelAutoshowActivatedThisSession/
    );
  });

  it('★4つの材料を全部渡している(1つでも欠けると判定が変わる)', () => {
    const i = contentSrc.indexOf('shouldHideInlinePanelByAutoshow({');
    expect(i).toBeGreaterThan(-1);
    const block = contentSrc.slice(i, contentSrc.indexOf('}).hide', i));
    for (const k of ['autoshowEnabled:', 'toolbarPressed:', 'activatedThisSession:', 'everShown:']) {
      expect(block).toContain(k);
    }
    expect(block).toMatch(/everShown:\s*_inlineHostEverShown/);
  });

  it('★判定が hide のときだけ消す(無条件に戻していない)', () => {
    // ★v0.1.1263: 二分実験で判定と実行の間に行が入った。
    //   断言すべきは「判定 .hide を経てからでないと消さない」であって、
    //   間に何行あるかではない(行数を固定すると正当な変更で赤になる)。
    const gate = contentSrc.indexOf('}).hide');
    const hide = contentSrc.indexOf("hidePageFrameOverlay('autoshow_off')");
    expect(gate).toBeGreaterThan(-1);
    expect(hide).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(hide); // 判定が先
    // 判定を経ない裸の呼び出しが無いこと(出所は1箇所のまま)。
    const calls = contentSrc.match(/hidePageFrameOverlay\('autoshow_off'\)/g) || [];
    expect(calls.length).toBe(1);
  });

  it('★everShown を「見せる入口」で無条件に立てている(呼ばれるかを断言)', () => {
    // 会議の指摘: これまでのテストは「書いてあるか」しか見ておらず
    //   「実際に呼ばれるか」を測っていなかった。ここは無条件の文であることまで見る。
    const body = fnBody(contentSrc, 'function setInlineHostVisible(');
    expect(body).toMatch(/\n\s*if \(visible === true\) _inlineHostEverShown = true;/);
    // if(false) 等で無効化されていないこと。
    expect(body).not.toMatch(/if \(false[^)]*\) _inlineHostEverShown/);
  });

  it('★見せる経路4つが全部その入口を通る(everShown が漏れなく立つ根拠)', () => {
    const shows = contentSrc.match(/setInlineHostVisible\(host, true, '/g) || [];
    expect(shows.length).toBe(4);
  });

  it('★everShown を false に戻していない(一度出した事実は覆らない)', () => {
    // 宣言の初期値(let ... = false)は正当。それ以外で false に戻していないことを見る。
    expect(contentSrc).not.toMatch(/(?<!let )_inlineHostEverShown\s*=\s*false/);
    // 立てるのは1箇所だけ(見せる入口)。宣言の初期値 false は別物なので除外して数える。
    const sets = contentSrc.match(/_inlineHostEverShown = true/g) || [];
    expect(sets.length).toBe(1);
    // ★消す側と復帰側で同じ判定を使っていること(食い違うと競り合いに戻る)。
    const uses = contentSrc.match(/shouldHideInlinePanelByAutoshow\(\{/g) || [];
    expect(uses.length).toBe(2);
  });
});
