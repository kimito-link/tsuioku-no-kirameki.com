import { describe, it, expect } from 'vitest';
import { buildBuriedCells } from './buriedInstrumentCells.js';
import { DIAGNOSIS_REGISTRY } from './diagnosisRegistry.js';

/**
 * ★「値は作ったのに画面に出ない」= コードの地図が言う【断線】を塞ぐ。
 *
 * ■ ★ユーザー指摘(2026-08-21)
 *   「みためかわってないような」→「セルにも反映させて視覚的にもりかいしたい」
 *   さらに「この資産も活用できてない気がする」(コードの地図のスクショ)
 *
 * ■ ★コードの地図(docs/code-tree.html)が既に警告している型だった
 *     「1 取得 → 2 記録 → 3 集計 → 4 表示。
 *       値が作られても次の段へ届かない【断線】を feature-map --check が検知する」
 *   ★私は v0.1.1456〜1462 で3つの計器を作ったが、
 *     **どれもコピー文にしか出しておらず、4 表示 が断線**していた:
 *       panelCover(v0.1.1458) / domTreeCensus(v0.1.1461) / autoSection(v0.1.1462)
 *   ＝ ユーザーの画面では何も変わらない＝**作っていないのと同じ**
 *     ([[screen-only-info-never-reaches-the-report-2026-08-11]] の逆方向)。
 *
 * ■ このテストが固定すること
 *   3つの計器が **セルとして画面に出る**こと。registry にも登録されていること。
 */
describe('★DOM系の計器がセルとして画面に出る(断線を塞ぐ)', () => {
  /** 記録中の配信がある入力(na セルが出る条件)。 */
  const withLive = (probe) => ({
    livesData: [{ recording: true }],
    popupDiag: { popup: { storyUserLaneRenderProbe: probe } }
  });
  const find = (cells, id) => cells.find((c) => c && c.id === id);

  it('★★拡張の処理時間がセルに出る(カバー率つき)', () => {
    const cells = buildBuriedCells(withLive({
      autoSection: {
        level: 'warn', coveragePct: 12, uncoveredMs: 8800,
        worstName: 'rebuildStoryGrowth', line: 'x'
      }
    }));
    const c = find(cells, 'auto-section');
    expect(c, 'セルが出ていない=画面で何も変わらない').toBeTruthy();
    expect(c.text).toContain('12%');
    expect(c.level).toBe('warn');
  });

  it('★カバー率が十分なら「誰が使っているか」を名前で出す', () => {
    const cells = buildBuriedCells(withLive({
      autoSection: {
        level: 'ok', coveragePct: 80, uncoveredMs: 2000,
        worstName: 'rebuildStoryGrowth', line: 'x'
      }
    }));
    const c = find(cells, 'auto-section');
    expect(c.level).toBe('ok');
    expect(c.text, '犯人の名前が出ない').toContain('rebuildStoryGrowth');
  });

  it('★★DOMの木がセルに出る(一番太い親を名指し)', () => {
    const cells = buildBuriedCells(withLive({
      domTreeCensus: {
        level: 'warn', total: 2844, maxDepth: 14,
        widest: { id: 'sceneStoryUserLaneTanu', tag: 'div', childCount: 86 },
        topTags: [], line: 'x'
      }
    }));
    const c = find(cells, 'dom-tree');
    expect(c, 'セルが出ていない').toBeTruthy();
    expect(c.text).toContain('2844');
    expect(c.text, '直す場所が分からない').toContain('sceneStoryUserLaneTanu');
  });

  it('★★パネルの覆いがセルに出る(黒の当人)', () => {
    const cells = buildBuriedCells(withLive({
      panelCover: { level: 'bad', culprit: 'div#shade', reason: 'x', line: 'x' }
    }));
    const c = find(cells, 'panel-cover');
    expect(c, 'セルが出ていない').toBeTruthy();
    expect(c.level).toBe('bad');
    expect(c.text).toContain('div#shade');
  });

  it('★覆いが無いのも正常として出す(黒く塗る人は居ない)', () => {
    const cells = buildBuriedCells(withLive({
      panelCover: { level: 'ok', culprit: null, reason: 'x', line: 'x' }
    }));
    expect(find(cells, 'panel-cover').level).toBe('ok');
  });

  it('★★観測が無くても記録中なら枠を出す(「使っていない0」と混同しない)', () => {
    /*
     * ★[[unobserved-must-not-hide-the-cell-2026-08-15]]
     *   出さないと「異常なし」に見えてしまう。
     */
    const cells = buildBuriedCells(withLive({}));
    for (const id of ['auto-section', 'dom-tree', 'panel-cover']) {
      const c = find(cells, id);
      expect(c, `${id} の枠が消えている`).toBeTruthy();
      expect(c.level).toBe('na');
    }
  });

  it('★★3つとも計器台帳(registry)に登録されている', () => {
    /*
     * ★新セルは diagnosisRegistry 登録必須(完全性スコアの母数に入る)。
     *   登録漏れは「あるのに数えられない」計器になる。
     */
    for (const id of ['auto-section', 'dom-tree', 'panel-cover']) {
      expect(DIAGNOSIS_REGISTRY.some((r) => r.id === id), `${id} が registry に無い`).toBe(true);
    }
  });
});
