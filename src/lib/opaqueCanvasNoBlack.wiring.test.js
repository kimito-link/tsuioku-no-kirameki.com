import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * サイドパネルが【横縞つきの真っ黒】になるのを防ぐ、地の色の検査。
 *
 * ■ 真因(2026-08-18・実機計測 + 世界の事例で仕様まで裏取り)
 *   実測: html/body とも background-color が rgba(0,0,0,0)=【透明】で、
 *         グラデーション(background-image)だけで塗っていた。
 *   → 再描画が1フレーム間に合わないと【塗るものが何も無い】=下の暗い層が出る。
 *
 *   ★CSS Color Adjust Level 1(仕様条文):
 *     iframe と親の color-scheme が食い違うと、UA は「透明キャンバス」でなく
 *     【不透明キャンバス(ダークなら黒系)】を敷かなければならない。
 *     https://drafts.csswg.org/css-color-adjust-1/#color-scheme-effect
 *   ＝色の指定が無ければ、仕様どおりに黒が出る。バグではなく設計の穴だった。
 *
 * ★ユーザーの証言「サイドパネル導入時はなかった」とも整合する
 *   (あとから背景がグラデーション【のみ】になった経路がある)。
 *
 * ★この検査は「グラデーションが間に合わなくても必ず何かが塗られる」ことを固定する。
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');

describe('地の色(不透明な background-color)が必ず在る', () => {
  it('★popup.html の html 属性に background-color が在る(最速で効く)', () => {
    const head = read('extension/popup.html').slice(0, 400);
    expect(head).toContain('background-color:');
    // グラデーションだけに戻すと黒が出る=両方在ることを固定
    expect(head).toContain('background-image: linear-gradient');
  });

  it('★sidepanel.html(親)にも在る', () => {
    const head = read('extension/sidepanel.html').slice(0, 400);
    expect(head).toContain('background-color:');
  });

  it('★埋め込み時(html.nl-inline)の CSS にも地の色が在る', () => {
    const css = read('extension/popup.html');
    const at = css.indexOf('html.nl-inline {');
    expect(at).toBeGreaterThan(-1);
    const block = css.slice(at, css.indexOf('}', at));
    expect(block).toContain('background-color:');
  });

  it('★body 側にも在る(html だけだと body が透明で透ける)', () => {
    const css = read('extension/popup.html');
    const at = css.indexOf('html.nl-inline body {');
    expect(at).toBeGreaterThan(-1);
    const block = css.slice(at, css.indexOf('}', at));
    expect(block).toContain('background-color:');
  });

  it('★color-scheme は親子で揃っている(食い違うと不透明キャンバスが敷かれる)', () => {
    expect(read('extension/popup.html').slice(0, 400)).toContain('color-scheme: light');
    expect(read('extension/sidepanel.html').slice(0, 400)).toContain('color-scheme: light');
  });
});
