import { describe, it, expect } from 'vitest';
import { judgeMemoryPressure, MEMORY_PRESSURE_WARN_PCT, MEMORY_PRESSURE_BAD_PCT } from './memoryPressureProbe.js';

/**
 * ★メモリ消費を計器に入れる(2026-08-19 ユーザー指示「メモリの消費とかも計器にいれて」)。
 *
 * ■ なぜ要るか(実機の症状)
 *   watch ページに Chrome の「ページが応答しません」ダイアログが出た。
 *   ★これは【拡張のパネル】ではなく **watch ページ本体の凍結**。
 *   同じ速報で会場モードのタイルが たぬ姉332枚 出ており、
 *   `中身LOD 枠だけ0枚/全0枚`＝**LODが一度も効いていない**。
 *
 *   ★このリポには **DOM数・メモリを測る計器が1つも無かった**(grep で確認)。
 *   ＝「重い」「凍る」と言われても**数字で答えられない**状態だった。
 *
 * ■ 判定の考え方
 *   `performance.memory` は Chrome 限定・**同一プロセスのJSヒープだけ**を返す。
 *   ★絶対値(MB)は端末とタブ構成で意味が変わるので、**上限に対する割合**で判定する。
 *   実測(この環境): limit 4,192MB / device 32GB。
 *   ★取れない環境(Firefox 等)では **na** を返す。0 と混同しない
 *   ([[unobserved-must-not-hide-the-cell-2026-08-15]])。
 */
describe('★メモリ逼迫の判定(純関数)', () => {
  const mk = (usedMB, limitMB) => ({
    usedJSHeapSize: usedMB * 1048576,
    jsHeapSizeLimit: limitMB * 1048576
  });

  it('★測れない環境は na(0%と言い張らない)', () => {
    for (const bad of [null, undefined, {}, { usedJSHeapSize: 0 }]) {
      const v = judgeMemoryPressure(bad);
      expect(v.level, `${JSON.stringify(bad)} で na にならなかった`).toBe('na');
      expect(v.usedMB).toBeNull();
    }
  });

  it('★余裕があれば ok', () => {
    const v = judgeMemoryPressure(mk(200, 4192));
    expect(v.level).toBe('ok');
    expect(v.usedMB).toBe(200);
    expect(v.pct).toBe(5);
  });

  it('★上限に近づいたら warn', () => {
    const v = judgeMemoryPressure(mk(4192 * (MEMORY_PRESSURE_WARN_PCT / 100), 4192));
    expect(v.level).toBe('warn');
  });

  it('★★上限に迫ったら bad(このままだとタブが落ちる/凍る)', () => {
    const v = judgeMemoryPressure(mk(4192 * (MEMORY_PRESSURE_BAD_PCT / 100), 4192));
    expect(v.level).toBe('bad');
  });

  it('★しきい値は warn < bad(逆転していたら判定が壊れる)', () => {
    expect(MEMORY_PRESSURE_WARN_PCT).toBeLessThan(MEMORY_PRESSURE_BAD_PCT);
  });

  it('★DOM数も一緒に返す(凍結の主因候補=業界基準1,500)', () => {
    const v = judgeMemoryPressure(mk(200, 4192), { domNodes: 13682 });
    expect(v.domNodes).toBe(13682);
    // ★業界基準(1,500)の9倍。DOMが多いだけでも凍る＝メモリがokでも警告する。
    expect(v.domLevel).toBe('bad');
  });

  it('★健全な水準(実測15.6ms)で警告を出さない — 誤警告の再発防止', () => {
    /*
     * ★2026-08-31: 旧基準 1,500 は Lighthouse 13.0 で廃止された監査の値で、
     *   実測(Chrome)では 7,053要素でも recalc+layout 15.6ms(閾値40msの半分以下)。
     *   ＝ 健全な状態で「⚠DOMが推奨(1,500)を超えています」と出していた。
     *   ★これを 1,500 に戻すと、また嘘の警告が出る。
     */
    for (const n of [1_600, 2_500, 3_000]) {
      const v = judgeMemoryPressure(mk(200, 4192), { domNodes: n });
      expect(v.domLevel, `domNodes=${n}`).toBe('ok');
      expect(v.text).not.toContain('推奨');
    }
  });

  it('★過去に実際に凍った水準(3,984要素/29.3秒)は今も検知できる', () => {
    // ★信号を消したのではなく、根拠を「業界推奨」から「自分の実測」へ移した。
    expect(judgeMemoryPressure(mk(200, 4192), { domNodes: 3_984 }).domLevel).toBe('warn');
    expect(judgeMemoryPressure(mk(200, 4192), { domNodes: 13_682 }).domLevel).toBe('bad');
  });

  it('★DOMが基準内なら ok / 測っていなければ na', () => {
    expect(judgeMemoryPressure(mk(200, 4192), { domNodes: 900 }).domLevel).toBe('ok');
    expect(judgeMemoryPressure(mk(200, 4192)).domLevel).toBe('na');
  });

  it('★人が読める1行を返す(数字だけ出して解釈を丸投げしない)', () => {
    const v = judgeMemoryPressure(mk(3800, 4192), { domNodes: 13682 });
    expect(v.text).toContain('3800');
    expect(v.text).toContain('13682');
  });

  it('★na のときは「使っていない0」と読めない文言にする', () => {
    expect(judgeMemoryPressure(null).text).toMatch(/測れ|不明|未計測/);
  });
});
