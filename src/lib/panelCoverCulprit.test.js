import { describe, it, expect } from 'vitest';
import { judgePanelCover, PANEL_COVER_DARK_LUMA } from './panelCoverCulprit.js';

/**
 * ★「サイドパネル全部が黒い」の【犯人を名指しする】純関数。
 *
 * ■ なぜ要るか(2026-08-21・ユーザー証言「サイドパネル全部」)
 *   ユーザーは何度も「引っ張った瞬間」「スリープでも」「全部黒い」と報告した。
 *   私はそのたびにコードを読んで当てにいき、**2回とも外した**
 *   (v0.1.1452「仕様として受け入れる」/ v0.1.1457「下敷きが追従しない」)。
 *
 * ■ ★既存計器の限界(これが直せなかった理由)
 *   `sidepanel-entry.js:132` の `probeCenterPainter` は
 *   **外側(sidepanel.html)の中央**を見て塗り主を返す。
 *   ところが中央にあるのは常に `iframe` なので、
 *   ★**iframe の【中】で何が覆っているかは永久に分からない**。
 *   速報に「中央の塗り主=iframe」としか出ないのはこのため。
 *
 * ■ この関数の契約
 *   「画面中央にある要素の祖先チェーン」を受け取り、
 *   ★**最初に不透明で暗い色を塗っている要素を名指しする**。
 *   ★推測しない。渡された実測値だけで判定する。
 *   ★測れないときは na(0 や「異常なし」と言わない)。
 */
describe('★パネルを覆っている当人を名指しする', () => {
  const cream = 'rgb(255, 250, 242)';

  it('★測れないときは na(「異常なし」と言わない)', () => {
    for (const bad of [null, undefined, [], {}]) {
      const v = judgePanelCover(bad);
      expect(v.level, `${JSON.stringify(bad)}`).toBe('na');
      expect(v.culprit).toBeNull();
    }
  });

  it('★クリーム色で塗られていれば ok(犯人なし)', () => {
    const v = judgePanelCover([
      { tag: 'div#nl-main', bgColor: 'rgba(0, 0, 0, 0)' },
      { tag: 'body', bgColor: cream }
    ]);
    expect(v.level).toBe('ok');
    expect(v.culprit).toBeNull();
  });

  it('★★暗い不透明な要素があれば【それを名指しする】', () => {
    const v = judgePanelCover([
      { tag: 'div#nl-main', bgColor: 'rgba(0, 0, 0, 0)' },
      { tag: 'div.nl-init-shade', bgColor: 'rgb(10, 14, 20)' },
      { tag: 'body', bgColor: cream }
    ]);
    expect(v.level).toBe('bad');
    expect(v.culprit, '犯人を名指しできていない').toBe('div.nl-init-shade');
  });

  it('★★最初に見つけた暗い塗り主を返す(手前にあるものが見えている)', () => {
    const v = judgePanelCover([
      { tag: 'div.overlay', bgColor: 'rgb(20, 12, 28)' },
      { tag: 'div.nl-init-shade', bgColor: 'rgb(10, 14, 20)' },
      { tag: 'body', bgColor: cream }
    ]);
    expect(v.culprit).toBe('div.overlay');
  });

  it('★透明な要素は犯人にしない(塗っていないので見えない)', () => {
    const v = judgePanelCover([
      { tag: 'div.ghost', bgColor: 'rgba(10, 14, 20, 0)' },
      { tag: 'body', bgColor: cream }
    ]);
    expect(v.level).toBe('ok');
  });

  it('★半透明でも濃ければ犯人(重なると黒く見える)', () => {
    const v = judgePanelCover([
      { tag: 'div.veil', bgColor: 'rgba(20, 12, 28, 0.78)' },
      { tag: 'body', bgColor: cream }
    ]);
    expect(v.level).toBe('bad');
    expect(v.culprit).toBe('div.veil');
  });

  it('★薄い半透明は犯人にしない(下が透ける=黒くない)', () => {
    const v = judgePanelCover([
      { tag: 'div.tint', bgColor: 'rgba(20, 12, 28, 0.12)' },
      { tag: 'body', bgColor: cream }
    ]);
    expect(v.level).toBe('ok');
  });

  it('★どこにも塗り主が居なければ「塗る人が居ない」と言う(黒の別の型)', () => {
    // ★全部透明＝UAの下地が出る＝これも黒く見える。ok にしてはいけない。
    const v = judgePanelCover([
      { tag: 'div#a', bgColor: 'rgba(0, 0, 0, 0)' },
      { tag: 'body', bgColor: 'rgba(0, 0, 0, 0)' }
    ]);
    expect(v.level).toBe('bad');
    expect(v.reason).toContain('塗る人が居ません');
  });

  it('★人が読む1行に犯人の名前が入る(読んで直せること)', () => {
    const v = judgePanelCover([
      { tag: 'div.nl-init-shade', bgColor: 'rgb(10, 14, 20)' },
      { tag: 'body', bgColor: cream }
    ]);
    expect(v.line).toContain('nl-init-shade');
  });

  it('★しきい値は明示された定数(推測で変えない)', () => {
    expect(PANEL_COVER_DARK_LUMA).toBeGreaterThan(0);
    expect(PANEL_COVER_DARK_LUMA).toBeLessThan(255);
  });
});
