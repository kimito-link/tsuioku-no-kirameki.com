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
    expect(groups.length).toBe(1);
    expect(groups[0].id).toBe('other');
  });

  it('★入力セルは1枚も失われない(枠に分けても総数が同じ)', () => {
    const cells = DIAGNOSIS_REGISTRY.map((r) => ({ id: r.id, level: 'ok' }));
    const total = groupHealthCells(cells).reduce((a, g) => a + g.cells.length, 0);
    expect(total).toBe(cells.length);
  });

  it('空の枠は出さない', () => {
    const groups = groupHealthCells([{ id: 'uid-rate', level: 'ok' }]);
    expect(groups.map((g) => g.id)).toEqual(['identity']);
  });

  it('order 順に並ぶ(コメント記録が先頭・人の識別が2番目)', () => {
    const cells = [
      { id: 'paint', level: 'ok' },
      { id: 'uid-rate', level: 'ok' },
      { id: 'capture-rate', level: 'ok' }
    ];
    expect(groupHealthCells(cells).map((g) => g.id)).toEqual(['comment', 'identity', 'health']);
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
