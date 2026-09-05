import { describe, it, expect } from 'vitest';
import {
  HEALTH_CELL_GROUPS,
  FALLBACK_GROUP,
  groupIdForCell,
  groupHealthCells,
  summarizeGroup
} from './healthCellGroups.js';
import { DIAGNOSIS_REGISTRY } from './diagnosisRegistry.js';

describe('healthCellGroups', () => {
  it('★registry の全セルがどれかの枠に入る(登録漏れ=画面から消える事故を防ぐ)', () => {
    const missing = DIAGNOSIS_REGISTRY
      .map((r) => r.id)
      .filter((id) => groupIdForCell(id) === FALLBACK_GROUP.id);
    // 未分類が出たら、それは healthCellGroups.js への追記忘れ。
    expect(missing).toEqual([]);
  });

  it('★1セルが2つの枠に重複登録されていない(二重表示を防ぐ)', () => {
    const seen = new Map();
    for (const g of HEALTH_CELL_GROUPS) {
      for (const cid of g.cellIds) {
        expect(seen.has(cid), `${cid} が ${seen.get(cid)} と ${g.id} に重複`).toBe(false);
        seen.set(cid, g.id);
      }
    }
  });

  it('★未知のセルでも消えない(その他へ落ちる)', () => {
    expect(groupIdForCell('brand-new-cell-not-registered')).toBe('other');
    const groups = groupHealthCells([{ id: 'brand-new-cell-not-registered', level: 'ok' }]);
    const other = groups.find((g) => g.id === 'other');
    expect(other).toBeTruthy();
    expect(other.cells.map((c) => c.id)).toContain('brand-new-cell-not-registered');
  });

  it('★入力セルは1枚も失われない(枠に分けても総数が同じ)', () => {
    const cells = DIAGNOSIS_REGISTRY.map((r) => ({ id: r.id, level: 'ok' }));
    const total = groupHealthCells(cells).reduce((a, g) => a + g.cells.length, 0);
    expect(total).toBe(cells.length);
  });

  it('★registry の全セルが必ず枠に現れる(入力ゼロでも)', () => {
    const groups = groupHealthCells([]);
    const shown = new Set(groups.flatMap((g) => g.cells.map((c) => c.id)));
    for (const r of DIAGNOSIS_REGISTRY) expect(shown.has(r.id), r.id).toBe(true);
  });

  /*
   * ★v0.1.1401: 「空の枠は出さない」を【撤回】。ユーザー指摘:
   *   「隠れるんじゃなくて固定のテーブル組んでおくべき。DOM構造が変化するので
   *     上に行ったり下に行ったりで見づらくなる」
   *   → 枠もセルも常に同じ位置。観測が無ければ ⚪「—」で埋める。
   */
  it('★固定テーブル: 観測が1つでも全枠が出る(位置が動かない)', () => {
    const groups = groupHealthCells([{ id: 'uid-rate', level: 'ok' }]);
    expect(groups.length).toBe(HEALTH_CELL_GROUPS.length);
    const identity = groups.find((g) => g.id === 'identity');
    expect(identity.cells.find((c) => c.id === 'uid-rate').level).toBe('ok');
    // 観測が無いセルは消えず「—」で残る
    expect(identity.cells.find((c) => c.id === 'avatar').text).toBe('—');
  });

  it('★セルの並び順は枠の定義順で固定(値が変わっても動かない)', () => {
    const a = groupHealthCells([{ id: 'uid-rate', level: 'ok' }]);
    const b = groupHealthCells([{ id: 'avatar', level: 'bad' }]);
    const ids = (gs) => gs.map((g) => g.cells.map((c) => c.id).join(',')).join('|');
    expect(ids(a)).toBe(ids(b)); // 中身が違っても並びは同一
  });

  it('★枠は十分に細かい(12前後)=会場やギフトが1枠1セルで終わらない', () => {
    // ユーザー指摘:「会場モードの計器が鮮度しかない」「項目を全部12個ぐらいに」
    expect(HEALTH_CELL_GROUPS.length).toBeGreaterThanOrEqual(11);
    const venue = HEALTH_CELL_GROUPS.find((g) => g.id === 'venue');
    expect(venue.cellIds.length).toBeGreaterThanOrEqual(4); // 鮮度だけにしない
  });

  it('order 順に並ぶ(コメント記録が先頭・人の識別が2番目)', () => {
    const cells = [
      { id: 'paint', level: 'ok' },
      { id: 'uid-rate', level: 'ok' },
      { id: 'capture-rate', level: 'ok' }
    ];
    // 固定テーブルなので全枠が出る。順序だけを見る。
    const ids = groupHealthCells(cells).map((g) => g.id);
    expect(ids.indexOf('comment')).toBeLessThan(ids.indexOf('identity'));
    expect(ids.indexOf('identity')).toBeLessThan(ids.indexOf('speed'));
  });

  it('★「人の識別」枠に ID/サムネ/名前が揃う(ユーザー要望の当の枠)', () => {
    const g = HEALTH_CELL_GROUPS.find((x) => x.id === 'identity');
    expect(g).toBeTruthy();
    expect(g.cellIds).toContain('uid-rate');        // ID
    expect(g.cellIds).toContain('avatar');          // サムネ
    expect(g.cellIds).toContain('venue-yukkuri-face'); // 名前↔顔の紐づけ
  });

  it('summarizeGroup は異常件数を数える(畳んでも見落とさないため)', () => {
    expect(summarizeGroup([{ level: 'bad' }, { level: 'warn' }, { level: 'ok' }]))
      .toEqual({ bad: 1, warn: 1, level: 'bad' });
    expect(summarizeGroup([{ level: 'warn' }, { level: 'ok' }]))
      .toEqual({ bad: 0, warn: 1, level: 'warn' });
    expect(summarizeGroup([{ level: 'ok' }])).toEqual({ bad: 0, warn: 0, level: 'ok' });
    expect(summarizeGroup(null)).toEqual({ bad: 0, warn: 0, level: 'ok' });
  });
});
