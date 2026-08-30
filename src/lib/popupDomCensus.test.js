import { describe, it, expect } from 'vitest';
import { summarizePopupDomCensus, POPUP_DOM_EMPTY_BASELINE } from './popupDomCensus.js';

/**
 * ★popup.html(iframe)側の DOM を数える計器(2026-08-20・調査計画 Step 1)。
 *
 * ■ なぜ要るか
 *   実機で watch ページに「ページが応答しません」が出た。
 *   v0.1.1454 の `dom-nodes` 計器は **watch ページ本体**を数えており、
 *   ★**DOMが膨らむ popup.html 側は誰も測っていなかった**。
 *   実測記録 13,682 はこちらの数字（`kb-web-perf-diagnosis.md`）。
 *
 * ■ ★台帳(`instrumentSpec.js`)の宣言に合わせる
 *   `dom-nodes @ popup` … unit:'elements' / window:'instant' /
 *   resetTrigger:'popup_reopen' / normal:'<=1500'
 *   ★同じ id が watch と popup の2行に分かれているのは**意図的**。
 *     混ぜると誤診①(文書の取り違え)が再発する。
 *
 * ■ 掟
 *   - 純関数。DOM は呼び出し側が数えて渡す(この lib は document を触らない)
 *   - ★storage read を増やさない(既存の計器バッチに相乗りする)
 *     [[instrument-can-kill-the-page-it-measures-2026-08-16]]
 *   - 測れないときは **na**。0 と混同しない
 *     [[unobserved-must-not-hide-the-cell-2026-08-15]]
 */
describe('★popup側のDOM census(Step 1 の実測を製品に載せる)', () => {
  it('★空の基準値が実測どおり(タイル0枚で約1,092)', () => {
    // 2026-08-20 実測: 1,092 / 1,093(±1は描画タイミング)
    expect(POPUP_DOM_EMPTY_BASELINE).toBe(1092);
  });

  it('★総DOM・タイル数・段ごとを返す', () => {
    const v = summarizePopupDomCensus({
      total: 5540, tiles: 800, hollow: 0,
      perLane: { tanu: { tiles: 700, nodes: 3500 }, link: { tiles: 100, nodes: 500 } }
    });
    expect(v.total).toBe(5540);
    expect(v.tiles).toBe(800);
    expect(v.perLane.tanu.tiles).toBe(700);
  });

  it('★★1タイルあたりの実要素数を出す(「5要素」の想定を検算できる)', () => {
    // タイル700枚・段の全要素3500 → 1タイル5要素
    const v = summarizePopupDomCensus({
      total: 5000, tiles: 700, hollow: 0,
      perLane: { tanu: { tiles: 700, nodes: 3500 } }
    });
    expect(v.perLane.tanu.perTile).toBe(5);
  });

  it('★タイル0枚のとき perTile は na(0除算で嘘をつかない)', () => {
    const v = summarizePopupDomCensus({
      total: 1092, tiles: 0, hollow: 0, perLane: { tanu: { tiles: 0, nodes: 0 } }
    });
    expect(v.perLane.tanu.perTile).toBeNull();
  });

  it('★★タイルが説明する分と、それ以外を分ける(LODで解けるかが決まる)', () => {
    /*
     * ★これが Step 1 の判定そのもの。
     *   total - baseline ≈ tiles × 5 なら「タイルが主因」＝LODで解ける。
     *   大きく超えるならタイル以外に膨らむ主因がある＝LODでは解けない。
     */
    const v = summarizePopupDomCensus({ total: 6592, tiles: 1100, hollow: 0, perLane: {} });
    expect(v.aboveBaseline).toBe(6592 - 1092);
    expect(v.explainedByTiles).toBe(1100 * 5);
    expect(v.unexplained).toBe(6592 - 1092 - 1100 * 5);
  });

  it('★要素数では判定しない(どれだけ多くても warn/bad にしない)', () => {
    /*
     * ★2026-08-31: 要素数での判定をやめた。
     *   ・判定の根拠だった Lighthouse の `dom-size` 監査は 13.0(2025-10)で【廃止】
     *     → `dom-size-insight` は静的な要素数ではなく
     *       「recalc/layout が 40ms 超か」で判定する
     *   ・★実測: 7,053要素でも recalc+layout は 15.6ms(閾値40msの半分以下)
     *   ・新基準で判定するには recalc を測る計器が要るが、この製品には無い
     *     (longtask は iframe に配送されない= mainThreadBlockerBoot.js:12)
     *   ⟹ 測れない基準で判定しない。数字は出すが色は付けない。
     *   ★これを warn/bad に戻すなら、先に recalc を測る計器を作ること。
     */
    expect(summarizePopupDomCensus({ total: 1400, tiles: 0, hollow: 0, perLane: {} }).level).toBe('ok');
    expect(summarizePopupDomCensus({ total: 3000, tiles: 300, hollow: 0, perLane: {} }).level).toBe('ok');
    expect(summarizePopupDomCensus({ total: 13682, tiles: 1108, hollow: 0, perLane: {} }).level).toBe('ok');
  });

  it('★「多すぎる」と断じる文言を出さない(誤警告の再発防止)', () => {
    // ★健全(実測15.6ms)なのに「⚠推奨1,500を超過」と出していたのが直した当のもの。
    for (const total of [1400, 3000, 13682]) {
      const line = summarizePopupDomCensus({ total, tiles: 0, hollow: 0, perLane: {} }).line;
      expect(line).not.toContain('超過');
      expect(line).not.toContain('推奨');
      expect(line).not.toContain('⚠');
      expect(line).not.toContain('🔴');
      // ★数字そのものは残す(桁違いの異常を人が見つける材料)。
      expect(line).toContain(String(total));
    }
  });

  it('★測れないときは na(0と言い張らない)', () => {
    for (const bad of [null, undefined, {}, { total: 'x' }]) {
      const v = summarizePopupDomCensus(bad);
      expect(v.level, `${JSON.stringify(bad)}`).toBe('na');
      expect(v.total).toBeNull();
    }
  });

  it('★人が読む1行を返す(数字だけ出して解釈を丸投げしない)', () => {
    const v = summarizePopupDomCensus({ total: 13682, tiles: 1108, hollow: 0, perLane: {} });
    expect(v.line).toContain('13682');
    expect(v.line).toContain('1108');
  });

  it('★hollow(枠だけ)の枚数も持つ=LODが効いているかが読める', () => {
    const v = summarizePopupDomCensus({ total: 3000, tiles: 1100, hollow: 900, perLane: {} });
    expect(v.hollow).toBe(900);
  });
});
