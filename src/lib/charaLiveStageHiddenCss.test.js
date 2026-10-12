/**
 * キャラの「…」と空の吹き出しが常に見えていた不具合の再発防止(2026-10-12)。
 *
 * ■ 実測(Playwright・放送中の watch ページ・会場を開いて計測)
 *   3体とも `hidden` 属性は付いているのに、`.nlcl-chara__think`(「…」の枠)と `.nlcl-chara__bubble`(吹き出し)が
 *   画面に出ていた(計算済み display ≠ none・実寸あり: 3/3)。→ しゃべらせない設定(#311)でも枠だけ残り、
 *   「浮かんでるだけ」にならなかった。
 * ■ 真因
 *   author CSS の `display: flex / -webkit-box` が、`hidden` 属性の既定 `display: none` に勝つ。
 *   同じファイルの `.nlcl-chara-stage` には対策(2026-08-25 発見)があったが、この2つが漏れていた。
 * ■ 守ること(一般則)
 *   `display` を指定するクラスのうち、JS が `hidden` 属性で出し入れするものは、必ず `[hidden]` を打ち消す。
 */
import { describe, it, expect } from 'vitest';
import { charaLiveStageCss } from './charaLiveStage.js';

const css = charaLiveStageCss();

describe('キャラの部品は hidden 属性が効く', () => {
  it('★「…」の枠(.nlcl-chara__think)の hidden を打ち消している', () => {
    expect(css).toMatch(/\.nlcl-chara__think\[hidden\]\s*\{\s*display:\s*none;?\s*\}/);
  });

  it('★吹き出し(.nlcl-chara__bubble)の hidden を打ち消している', () => {
    expect(css).toMatch(/\.nlcl-chara__bubble\[hidden\]\s*\{\s*display:\s*none;?\s*\}/);
  });

  it('既存の対策(.nlcl-stage[hidden])は残っている', () => {
    expect(css).toMatch(/\.nlcl-stage\[hidden\]\s*\{\s*display:\s*none;?\s*\}/);
  });

  it('★一般則: JS が hidden で出し入れする3クラスは、display を持つなら必ず [hidden] を打ち消している', () => {
    // buildCharaLiveStageDom / applyCharaLiveFrame が hidden を触るクラス。
    const toggled = ['nlcl-chara__bubble', 'nlcl-chara__think'];
    for (const cls of toggled) {
      const rule = new RegExp(`\\.${cls}\\s*\\{[^}]*\\bdisplay:`).test(css);
      const guard = new RegExp(`\\.${cls}\\[hidden\\]\\s*\\{[^}]*display:\\s*none`).test(css);
      expect(rule ? guard : true, `${cls} は display を指定しているので [hidden] の打ち消しが要る`).toBe(true);
    }
  });
});
