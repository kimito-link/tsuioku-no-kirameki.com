import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { UNDERLAY_COLOR, UNDERLAY_ID, judgeUnderlaySpec } from './sidepanelUnderlay.js';

/**
 * ★この検査が守っているのは「黒を消すこと」ではなく
 *   【下敷きが"幕"に退化しないこと】。
 *   このリポは幕(中身を隠す・JSで解除)で12版・200行を空振りし、
 *   解除が遅れて t+917ms まで隠れたのが黒の正体だった
 *   [[cloakNotForSidePanel]]。同じものを別名で作らない。
 */

const read = (rel) => readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');

describe('judgeUnderlaySpec — 幕に退化していないか', () => {
  it('中身を覆わず・JS解除を持たず・色があるなら OK', () => {
    expect(judgeUnderlaySpec({ hasColor: true })).toEqual({ ok: true, reason: 'ok' });
  });

  it('★中身を覆うなら不可(それは幕)', () => {
    expect(judgeUnderlaySpec({ hasColor: true, coversContent: true }))
      .toEqual({ ok: false, reason: 'covers-content' });
  });

  it('★JSで解除するなら不可(JSが動けない時間帯に効かない=作る意味が無い)', () => {
    expect(judgeUnderlaySpec({ hasColor: true, revealedByJs: true }))
      .toEqual({ ok: false, reason: 'js-reveal' });
  });

  it('色が無いなら不可(黒の代わりに見せるものが無い)', () => {
    expect(judgeUnderlaySpec({}).reason).toBe('no-color');
  });

  it('壊れた入力でも落ちない', () => {
    expect(() => judgeUnderlaySpec(null)).not.toThrow();
    expect(judgeUnderlaySpec(null).ok).toBe(false);
  });
});

describe('実物の sidepanel.html との照合', () => {
  const html = () => read('extension/sidepanel.html');

  it('下敷きの要素がある', () => {
    expect(html()).toMatch(new RegExp(`id="${UNDERLAY_ID}"`));
  });

  it('★下敷きは iframe より【先】に置く(iframeの読込前に地の色が塗られる)', () => {
    const h = html();
    const u = h.indexOf(`id="${UNDERLAY_ID}"`);
    const f = h.indexOf('<iframe');
    expect(u).toBeGreaterThan(-1);
    expect(f).toBeGreaterThan(-1);
    expect(u).toBeLessThan(f);
  });

  it('★下敷きの色は地の色と同じ(3箇所で一致)', () => {
    const rule = /#nl-underlay\s*\{([\s\S]*?)\}/.exec(html())?.[1] ?? '';
    expect(rule).toContain(UNDERLAY_COLOR);
    expect(UNDERLAY_COLOR).toBe('#fffaf2');
  });

  it('★下敷きは iframe より【下】に潜る(中身を隠さない)', () => {
    const u = /#nl-underlay\s*\{([\s\S]*?)\}/.exec(html())?.[1] ?? '';
    const uz = Number(/z-index:\s*(-?\d+)/.exec(u)?.[1] ?? NaN);
    const fRule = /(?:^|\n)\s*iframe\s*\{([\s\S]*?)\}/.exec(html())?.[1] ?? '';
    const fz = Number(/z-index:\s*(-?\d+)/.exec(fRule)?.[1] ?? NaN);
    expect(Number.isFinite(uz)).toBe(true);
    expect(Number.isFinite(fz)).toBe(true);
    expect(uz).toBeLessThan(fz);
  });

  it('★下敷きは操作を奪わない(pointer-events:none)', () => {
    const rule = /#nl-underlay\s*\{([\s\S]*?)\}/.exec(html())?.[1] ?? '';
    expect(rule).toMatch(/pointer-events:\s*none/);
  });

  it('★★下敷きを JS で消す処理が【どこにも無い】(解除漏れ事故を作らない)', () => {
    const entry = read('src/extension/sidepanel-entry.js');
    expect(entry).not.toContain(UNDERLAY_ID);
    // HTML 内のインライン script でも触っていない
    const scripts = [...html().matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)]
      .map((m) => m[1]).join('\n');
    expect(scripts).not.toContain(UNDERLAY_ID);
  });

  it('★既存の色宣言を消していない(唯一効いている守り)', () => {
    const h = html();
    expect(h).toMatch(/<meta name="color-scheme" content="light"/);
    expect(h).toMatch(/color-scheme:\s*light/);
  });
});

describe('★リサイズ中の黒(v0.1.1440・ユーザー「引っ張る瞬間くろくなる」)', () => {
  /*
   * ■ 世界調査で分かった仕組み(2026-08-19)
   *   リサイズ中、コンポジタは未描画の帯(gutter)を埋める。
   *   Chromium はその領域を【透明で塗る】修正を入れているので、
   *   透明の下に何も無ければ OS がダークのとき黒く見える。
   *   ★iframe 自身が不透明だと下敷きが透けないので、iframe は透明にする。
   *
   * ★この検査が守っているのは【地の色の連鎖を切らないこと】。
   *   iframe を透明にした以上、下敷きと html/body の地が
   *   【消えたら本当に黒くなる】。だから三重とも機械で固定する。
   */
  const html = () => read('extension/sidepanel.html');

  /*
   * ★v0.1.1440 の判断(記録として残す)
   *   世界調査は「iframe を透明にして下敷きを gutter に透かせよ」と推奨した。
   *   ★しかし調査自身が「この主張は実測で裏取れていない」と明記していた。
   *   一方このリポには v0.1.1279〜1283 で
   *   【iframe を透明にしたことが真っ黒の原因だった】という実体験がある。
   *   ★実測済の過去の失敗 > 未検証の推論。よって iframe は不透明のまま。
   *   (sidepanelBlackScreen.wiring.test.js がこの禁を機械照合している)
   */
  it('★iframe は不透明のまま(v0.1.1283 の禁を破らない)', () => {
    const src = html();
    const at = src.indexOf('iframe {');
    const rule = src.slice(at, src.indexOf('      }', at));
    const body = rule.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(body).toMatch(/background:\s*#fffaf2/);
    expect(body).not.toMatch(/background:\s*transparent/);
  });

  it('★下敷きは fixed ではなく absolute(別の合成レイヤにしない)', () => {
    const rule = /#nl-underlay\s*\{([\s\S]*?)\}/.exec(html())?.[1] ?? '';
    const body = rule.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(body).toMatch(/position:\s*absolute/);
    expect(body).not.toMatch(/position:\s*fixed/);
  });

  it('★★地の色は【三重】で持つ(どれか1つが欠けても黒くならない)', () => {
    const h = html();
    // 1) 下敷き
    // ★下敷きの【規則の中だけ】を見る(ファイル内の別の #fffaf2 を拾わない)
    const uRule = /#nl-underlay\s*\{([\s\S]*?)\}/.exec(h)?.[1] ?? '';
    expect(uRule.replace(/\/\*[\s\S]*?\*\//g, '')).toMatch(/background-color:\s*#fffaf2/);
    // 2) html インライン(パース最初に効く)
    expect(h).toMatch(/<html[^>]*background-color:\s*#fffaf2/);
    // 3) html,body の規則
    const cssBlock = h.slice(h.indexOf('html,'), h.indexOf('iframe {'));
    expect(cssBlock).toMatch(/background-color:\s*#fffaf2/);
  });

  it('★中身(popup.html)の根にも地の色がある(iframeが透明でも中身側で塗る)', () => {
    const popup = read('extension/popup.html').slice(0, 600);
    expect(popup).toMatch(/<html[^>]*background-color:\s*#fffaf2/);
  });
});
