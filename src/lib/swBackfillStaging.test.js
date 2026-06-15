import { describe, expect, it } from 'vitest';
import {
  SW_BACKFILL_STAGED_ROWS_MAX,
  buildSwBackfillStagedPayload,
  isSwBackfillStagedForLive,
  swBackfillStagedKey
} from './swBackfillStaging.js';

describe('swBackfillStagedKey', () => {
  it('liveId を trim + lowercase してキー化する', () => {
    expect(swBackfillStagedKey('  LV350000001 ')).toBe(
      'nls_swbf_staged_lv350000001'
    );
  });

  it('空値でも固定 prefix を返す', () => {
    expect(swBackfillStagedKey(null)).toBe('nls_swbf_staged_');
  });
});

describe('buildSwBackfillStagedPayload', () => {
  const build = (overrides = {}) =>
    buildSwBackfillStagedPayload({
      lid: 'lv1',
      existingStaged: null,
      newRows: [],
      stopReason: 'reached_start',
      now: 1234,
      ...overrides
    });

  it('固定スキーマと正規化済み lid を返す', () => {
    expect(build({ lid: ' LV1 ' })).toEqual({
      v: 1,
      lid: 'lv1',
      rows: [],
      stopReason: 'reached_start',
      done: 1,
      ts: 1234
    });
  });

  it('existing と newRows を順番どおりマージする', () => {
    const payload = build({
      existingStaged: { rows: [{ commentNo: '1' }] },
      newRows: [{ commentNo: '2' }]
    });
    expect(payload.rows.map((row) => row.commentNo)).toEqual(['1', '2']);
  });

  it('同じ commentNo は1件にし、後着の newRows を優先する', () => {
    const payload = build({
      existingStaged: {
        rows: [{ commentNo: '7', text: 'old' }]
      },
      newRows: [{ commentNo: '7', text: 'new' }]
    });
    expect(payload.rows).toEqual([{ commentNo: '7', text: 'new' }]);
  });

  it('newRows 内の commentNo 重複も最後の1件だけ残す', () => {
    const payload = build({
      newRows: [
        { commentNo: 9, text: 'first' },
        { commentNo: '9', text: 'last' }
      ]
    });
    expect(payload.rows).toEqual([{ commentNo: '9', text: 'last' }]);
  });

  it('commentNo の空白差を正規化して dedupe する', () => {
    const payload = build({
      existingStaged: { rows: [{ commentNo: ' 10 ', text: 'old' }] },
      newRows: [{ commentNo: '10', text: 'new' }]
    });
    expect(payload.rows).toEqual([{ commentNo: '10', text: 'new' }]);
  });

  it('commentNo 欠落行は後段 persist に委ねるため全件残す', () => {
    const rows = [{ text: 'a' }, { commentNo: '', text: 'b' }];
    expect(build({ newRows: rows }).rows).toEqual(rows);
  });

  it('existingStaged が null でも安全', () => {
    expect(build({ existingStaged: null, newRows: [{ commentNo: '1' }] }).rows)
      .toEqual([{ commentNo: '1' }]);
  });

  it('existingStaged.rows が配列でなくても安全', () => {
    expect(
      build({
        existingStaged: { rows: 'broken' },
        newRows: [{ commentNo: '2' }]
      }).rows
    ).toEqual([{ commentNo: '2' }]);
  });

  it('newRows が配列でなくても安全', () => {
    expect(
      build({
        existingStaged: { rows: [{ commentNo: '1' }] },
        newRows: { commentNo: '2' }
      }).rows
    ).toEqual([{ commentNo: '1' }]);
  });

  it('30,000行を超えたら新しい側を優先して残す', () => {
    const existingRows = Array.from(
      { length: SW_BACKFILL_STAGED_ROWS_MAX },
      (_, i) => ({ commentNo: String(i + 1) })
    );
    const payload = build({
      existingStaged: { rows: existingRows },
      newRows: [
        { commentNo: '30001' },
        { commentNo: '30002' }
      ]
    });
    expect(payload.rows).toHaveLength(SW_BACKFILL_STAGED_ROWS_MAX);
    expect(payload.rows[0].commentNo).toBe('3');
    expect(payload.rows.at(-1).commentNo).toBe('30002');
  });

  it('now が不正なら ts を0にする', () => {
    expect(build({ now: Number.NaN }).ts).toBe(0);
  });
});

describe('isSwBackfillStagedForLive', () => {
  const valid = {
    v: 1,
    lid: 'lv350000001',
    rows: [{ commentNo: '1' }]
  };

  it('v=1・lid一致・rows非空なら true', () => {
    expect(isSwBackfillStagedForLive(valid, 'lv350000001')).toBe(true);
  });

  it('lid は trim + lowercase 比較する', () => {
    expect(
      isSwBackfillStagedForLive(
        { ...valid, lid: ' LV350000001 ' },
        ' lv350000001 '
      )
    ).toBe(true);
  });

  it('v が違えば false', () => {
    expect(isSwBackfillStagedForLive({ ...valid, v: 2 }, valid.lid)).toBe(false);
  });

  it('lid が違えば false', () => {
    expect(isSwBackfillStagedForLive(valid, 'lv999')).toBe(false);
  });

  it('rows が空なら false', () => {
    expect(isSwBackfillStagedForLive({ ...valid, rows: [] }, valid.lid)).toBe(
      false
    );
  });

  it('rows が配列でなければ false', () => {
    expect(
      isSwBackfillStagedForLive({ ...valid, rows: 'broken' }, valid.lid)
    ).toBe(false);
  });

  it('null は false', () => {
    expect(isSwBackfillStagedForLive(null, valid.lid)).toBe(false);
  });

  it('liveId が空なら false', () => {
    expect(isSwBackfillStagedForLive({ v: 1, lid: '', rows: [{}] }, '')).toBe(
      false
    );
  });
});
