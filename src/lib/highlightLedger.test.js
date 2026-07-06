import { describe, it, expect } from 'vitest';
import {
  appendHighlight,
  pickTopHighlights,
  isHighlightWorthyKind,
  makeInitialHighlightLedger,
  buildHighlightLedgerDiagLines,
  HIGHLIGHT_LEDGER_CAP,
  HIGHLIGHT_PICK_COUNT,
  HIGHLIGHT_KIND_LABEL
} from './highlightLedger.js';

describe('isHighlightWorthyKind', () => {
  it('記録対象のkindはtrue', () => {
    expect(isHighlightWorthyKind('gift_large')).toBe(true);
    expect(isHighlightWorthyKind('gift_mega')).toBe(true);
    expect(isHighlightWorthyKind('milestone_hard')).toBe(true);
    expect(isHighlightWorthyKind('milestone_jackpot')).toBe(true);
    expect(isHighlightWorthyKind('phase_reach')).toBe(true);
    expect(isHighlightWorthyKind('phase_breakthrough')).toBe(true);
    expect(isHighlightWorthyKind('phase_jackpot')).toBe(true);
  });

  it('対象外のkindはfalse(gift_small等・存在しないkind)', () => {
    expect(isHighlightWorthyKind('gift_small')).toBe(false);
    expect(isHighlightWorthyKind('gift_medium')).toBe(false);
    expect(isHighlightWorthyKind('milestone_soft')).toBe(false);
    expect(isHighlightWorthyKind('')).toBe(false);
    expect(isHighlightWorthyKind(undefined)).toBe(false);
  });
});

describe('makeInitialHighlightLedger', () => {
  it('空の台帳を返す', () => {
    expect(makeInitialHighlightLedger('lv1')).toEqual({ liveId: 'lv1', rows: [], capturedAt: 0 });
    expect(makeInitialHighlightLedger()).toEqual({ liveId: '', rows: [], capturedAt: 0 });
  });
});

describe('appendHighlight', () => {
  it('新規台帳に1件追記する', () => {
    const next = appendHighlight(null, { liveId: 'lv1', kind: 'gift_large', atMs: 1000 });
    expect(next.liveId).toBe('lv1');
    expect(next.rows).toEqual([{ at: 1000, kind: 'gift_large', label: HIGHLIGHT_KIND_LABEL.gift_large }]);
    expect(next.capturedAt).toBe(1000);
  });

  it('同一liveIdなら既存行に追記する(蓄積)', () => {
    const first = appendHighlight(null, { liveId: 'lv1', kind: 'gift_large', atMs: 1000 });
    const second = appendHighlight(first, { liveId: 'lv1', kind: 'phase_reach', atMs: 2000 });
    expect(second.rows).toHaveLength(2);
    expect(second.rows[0].kind).toBe('gift_large');
    expect(second.rows[1].kind).toBe('phase_reach');
  });

  it('liveId切替は台帳を置換する(古い配信のハイライトを持ち越さない)', () => {
    const first = appendHighlight(null, { liveId: 'lv1', kind: 'gift_large', atMs: 1000 });
    const switched = appendHighlight(first, { liveId: 'lv2', kind: 'phase_jackpot', atMs: 5000 });
    expect(switched.liveId).toBe('lv2');
    expect(switched.rows).toEqual([{ at: 5000, kind: 'phase_jackpot', label: HIGHLIGHT_KIND_LABEL.phase_jackpot }]);
  });

  it('liveIdは大小文字・前後空白を正規化する', () => {
    const next = appendHighlight(null, { liveId: '  LV1  ', kind: 'gift_large', atMs: 1000 });
    expect(next.liveId).toBe('lv1');
  });

  it('上限件数(cap)を超えたら古い順に切り詰める', () => {
    let ledger = null;
    for (let i = 1; i <= HIGHLIGHT_LEDGER_CAP + 10; i += 1) {
      ledger = appendHighlight(ledger, { liveId: 'lv1', kind: 'phase_reach', atMs: i });
    }
    expect(ledger.rows).toHaveLength(HIGHLIGHT_LEDGER_CAP);
    // 古い順(先頭10件)が切り詰められ、最後の値まで残っている。
    expect(ledger.rows[0].at).toBe(11);
    expect(ledger.rows[ledger.rows.length - 1].at).toBe(HIGHLIGHT_LEDGER_CAP + 10);
  });

  it('記録対象外のkindは無視する(何も追記しない)', () => {
    const next = appendHighlight(null, { liveId: 'lv1', kind: 'gift_small', atMs: 1000 });
    expect(next.rows).toEqual([]);
  });

  it('liveId/kind/atMs欠損は無視して既存を安全に返す', () => {
    const first = appendHighlight(null, { liveId: 'lv1', kind: 'gift_large', atMs: 1000 });
    expect(appendHighlight(first, { liveId: '', kind: 'gift_large', atMs: 2000 })).toEqual(first);
    expect(appendHighlight(first, { liveId: 'lv1', kind: '', atMs: 2000 })).toEqual(first);
    expect(appendHighlight(first, { liveId: 'lv1', kind: 'gift_large', atMs: 0 })).toEqual(first);
  });

  it('壊れたraw入力でも死なない', () => {
    const next = appendHighlight('not-an-object', { liveId: 'lv1', kind: 'gift_large', atMs: 1000 });
    expect(next.rows).toHaveLength(1);
  });
});

describe('pickTopHighlights', () => {
  it('tier重み降順で並べる', () => {
    const rows = [
      { at: 1000, kind: 'phase_reach', label: 'x' },
      { at: 2000, kind: 'phase_jackpot', label: 'x' },
      { at: 3000, kind: 'gift_large', label: 'x' }
    ];
    const picked = pickTopHighlights(rows);
    expect(picked.map((r) => r.kind)).toEqual(['phase_jackpot', 'gift_large', 'phase_reach']);
  });

  it('同点は早い順(at昇順)', () => {
    const rows = [
      { at: 5000, kind: 'phase_reach', label: 'x' },
      { at: 1000, kind: 'phase_reach', label: 'y' }
    ];
    // kind重複は1件までなので、この2件のうち早い方(at=1000)だけが残る。
    const picked = pickTopHighlights(rows);
    expect(picked).toHaveLength(1);
    expect(picked[0].at).toBe(1000);
  });

  it('kind重複は1件のみ残す', () => {
    const rows = [
      { at: 1000, kind: 'gift_large', label: 'a' },
      { at: 2000, kind: 'gift_large', label: 'b' },
      { at: 3000, kind: 'gift_large', label: 'c' }
    ];
    const picked = pickTopHighlights(rows);
    expect(picked).toHaveLength(1);
  });

  it(`最大${HIGHLIGHT_PICK_COUNT}件まで`, () => {
    const rows = [
      { at: 1, kind: 'phase_jackpot', label: 'x' },
      { at: 2, kind: 'gift_mega', label: 'x' },
      { at: 3, kind: 'milestone_jackpot', label: 'x' },
      { at: 4, kind: 'phase_breakthrough', label: 'x' },
      { at: 5, kind: 'gift_large', label: 'x' }
    ];
    const picked = pickTopHighlights(rows);
    expect(picked).toHaveLength(HIGHLIGHT_PICK_COUNT);
    expect(picked.map((r) => r.kind)).toEqual(['phase_jackpot', 'gift_mega', 'milestone_jackpot']);
  });

  it('決定論: 同じ入力には常に同じ結果', () => {
    const rows = [
      { at: 10, kind: 'gift_large', label: 'x' },
      { at: 5, kind: 'phase_breakthrough', label: 'x' },
      { at: 20, kind: 'milestone_hard', label: 'x' }
    ];
    const a = pickTopHighlights(rows);
    const b = pickTopHighlights(rows);
    expect(a).toEqual(b);
  });

  it('空/null/undefinedは空配列', () => {
    expect(pickTopHighlights([])).toEqual([]);
    expect(pickTopHighlights(null)).toEqual([]);
    expect(pickTopHighlights(undefined)).toEqual([]);
  });

  it('記録対象外のkindが混ざっていても無視する', () => {
    const rows = [
      { at: 1, kind: 'gift_small', label: 'x' },
      { at: 2, kind: 'gift_large', label: 'x' }
    ];
    const picked = pickTopHighlights(rows);
    expect(picked).toHaveLength(1);
    expect(picked[0].kind).toBe('gift_large');
  });
});

describe('buildHighlightLedgerDiagLines', () => {
  it('台帳が空/未観測なら空配列(ノイズにしない)', () => {
    expect(buildHighlightLedgerDiagLines(null, 1000)).toEqual([]);
    expect(buildHighlightLedgerDiagLines(makeInitialHighlightLedger('lv1'), 1000)).toEqual([]);
  });

  it('件数・最終記録ago・上位ラベルを1行にまとめる', () => {
    let ledger = appendHighlight(null, { liveId: 'lv1', kind: 'gift_large', atMs: 1000 });
    ledger = appendHighlight(ledger, { liveId: 'lv1', kind: 'phase_jackpot', atMs: 5000 });
    const lines = buildHighlightLedgerDiagLines(ledger, 10000);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('2件');
    expect(lines[0]).toContain('5秒前'); // (10000-5000)/1000
    expect(lines[0]).toContain(HIGHLIGHT_KIND_LABEL.phase_jackpot);
  });

  it('nowMs省略/0以下は「最終N秒前」を出さない', () => {
    const ledger = appendHighlight(null, { liveId: 'lv1', kind: 'gift_large', atMs: 1000 });
    const lines = buildHighlightLedgerDiagLines(ledger, 0);
    expect(lines[0]).not.toContain('秒前');
  });
});
