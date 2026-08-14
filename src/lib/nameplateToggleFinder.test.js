// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import {
  findNameplateToggle, readToggleState, decideNameplateClick,
  isToggle, looksLikeNameplateLabel
} from './nameplateToggleFinder.js';

function dom(html) {
  document.body.innerHTML = html;
  return document;
}

describe('nameplateToggleFinder', () => {
  it('★公式に近い構造(ラベル+トグルが同じ行)から見つける', () => {
    const d = dom(`
      <div><span>リセット</span></div>
      <li><span>なふだを表示</span>
        <span>ONにすると放送者のみにあなたのアイコンやニックネームが表示されます</span>
        <input type="checkbox" />
      </li>
    `);
    const el = findNameplateToggle(d);
    expect(el).toBeTruthy();
    expect(isToggle(el)).toBe(true);
  });

  it('aria-label 経路でも見つける', () => {
    const d = dom(`<div role="switch" aria-label="なふだを表示" aria-checked="false"></div>`);
    expect(findNameplateToggle(d)).toBeTruthy();
  });

  it('★無関係なトグルを拾わない(「なふだ」を含まない行)', () => {
    const d = dom(`<li><span>コメントを表示</span><input type="checkbox" /></li>`);
    expect(findNameplateToggle(d)).toBeNull();
  });

  it('★巨大な祖先で誤ヒットしない(textContent は子孫を全部含む)', () => {
    const d = dom(`
      <div>${'あ'.repeat(300)}なふだ
        <li><span>べつの設定</span><input type="checkbox" id="wrong" /></li>
      </div>
    `);
    // 200文字超の要素は見ない=間違ったトグルを返さない
    const el = findNameplateToggle(d);
    expect(el === null || el.id !== 'wrong').toBe(true);
  });

  it('状態を読む(checked / aria-checked)', () => {
    const d = dom(`<input type="checkbox" id="a" checked /><div id="b" role="switch" aria-checked="false"></div>`);
    expect(readToggleState(d.getElementById('a'))).toBe(true);
    expect(readToggleState(d.getElementById('b'))).toBe(false);
  });

  it('★読めないときは null(false と混同しない)', () => {
    const d = dom(`<div id="c" role="switch"></div>`);
    expect(readToggleState(d.getElementById('c'))).toBeNull();
    expect(readToggleState(null)).toBeNull();
  });

  it('★状態が不明なら押さない(逆に切り替える事故を防ぐ)', () => {
    expect(decideNameplateClick(null, true)).toEqual({ shouldClick: false, reason: 'unknown-state' });
  });

  it('すでに目的の状態なら押さない', () => {
    expect(decideNameplateClick(true, true).shouldClick).toBe(false);
    expect(decideNameplateClick(false, false).shouldClick).toBe(false);
  });

  it('違えば押す', () => {
    expect(decideNameplateClick(false, true).shouldClick).toBe(true);
    expect(decideNameplateClick(true, false).shouldClick).toBe(true);
  });

  it('表記ゆれ(名札)も拾う', () => {
    expect(looksLikeNameplateLabel('名札を表示')).toBe(true);
    expect(looksLikeNameplateLabel('コメント')).toBe(false);
  });
});
