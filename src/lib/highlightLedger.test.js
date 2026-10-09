import { describe, it, expect } from 'vitest';
import {
  appendHighlight,
  pickTopHighlights,
  isHighlightWorthyKind,
  makeInitialHighlightLedger,
  buildHighlightLedgerDiagLines,
  highlightLedgerReadKeys,
  pickLedgerForLive,
  planHighlightAppend,
  HIGHLIGHT_LEDGER_CAP,
  HIGHLIGHT_PICK_COUNT,
  HIGHLIGHT_KIND_LABEL
} from './highlightLedger.js';
import { KEY_HIGHLIGHT_LEDGER, highlightLedgerKeyFor } from './highlightLedgerKey.js';

describe('isHighlightWorthyKind', () => {
  it('記録対象のkindはtrue', () => {
    expect(isHighlightWorthyKind('gift_large')).toBe(true);
    expect(isHighlightWorthyKind('gift_mega')).toBe(true);
    expect(isHighlightWorthyKind('milestone_hard')).toBe(true);
    expect(isHighlightWorthyKind('milestone_jackpot')).toBe(true);
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
    const second = appendHighlight(first, { liveId: 'lv1', kind: 'milestone_hard', atMs: 2000 });
    expect(second.rows).toHaveLength(2);
    expect(second.rows[0].kind).toBe('gift_large');
    expect(second.rows[1].kind).toBe('milestone_hard');
  });

  it('liveId切替は台帳を置換する(古い配信のハイライトを持ち越さない)', () => {
    const first = appendHighlight(null, { liveId: 'lv1', kind: 'gift_large', atMs: 1000 });
    const switched = appendHighlight(first, { liveId: 'lv2', kind: 'milestone_jackpot', atMs: 5000 });
    expect(switched.liveId).toBe('lv2');
    expect(switched.rows).toEqual([{ at: 5000, kind: 'milestone_jackpot', label: HIGHLIGHT_KIND_LABEL.milestone_jackpot }]);
  });

  it('liveIdは大小文字・前後空白を正規化する', () => {
    const next = appendHighlight(null, { liveId: '  LV1  ', kind: 'gift_large', atMs: 1000 });
    expect(next.liveId).toBe('lv1');
  });

  it('上限件数(cap)を超えたら古い順に切り詰める', () => {
    let ledger = null;
    for (let i = 1; i <= HIGHLIGHT_LEDGER_CAP + 10; i += 1) {
      ledger = appendHighlight(ledger, { liveId: 'lv1', kind: 'milestone_hard', atMs: i });
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
      { at: 1000, kind: 'milestone_hard', label: 'x' },
      { at: 2000, kind: 'milestone_jackpot', label: 'x' },
      { at: 3000, kind: 'gift_large', label: 'x' }
    ];
    const picked = pickTopHighlights(rows);
    expect(picked.map((r) => r.kind)).toEqual(['milestone_jackpot', 'gift_large', 'milestone_hard']);
  });

  it('同点は早い順(at昇順)', () => {
    const rows = [
      { at: 5000, kind: 'milestone_hard', label: 'x' },
      { at: 1000, kind: 'milestone_hard', label: 'y' }
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
      { at: 1, kind: 'milestone_jackpot', label: 'x' },
      { at: 2, kind: 'gift_mega', label: 'x' },
      { at: 3, kind: 'milestone_jackpot', label: 'x' },
      { at: 4, kind: 'milestone_hard', label: 'x' },
      { at: 5, kind: 'gift_large', label: 'x' }
    ];
    const picked = pickTopHighlights(rows);
    expect(picked).toHaveLength(HIGHLIGHT_PICK_COUNT);
    expect(picked.map((r) => r.kind)).toEqual(['gift_mega', 'milestone_jackpot', 'gift_large']);
  });

  it('決定論: 同じ入力には常に同じ結果', () => {
    const rows = [
      { at: 10, kind: 'gift_large', label: 'x' },
      { at: 5, kind: 'milestone_jackpot', label: 'x' },
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
    ledger = appendHighlight(ledger, { liveId: 'lv1', kind: 'milestone_jackpot', atMs: 5000 });
    const lines = buildHighlightLedgerDiagLines(ledger, 10000);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('2件');
    expect(lines[0]).toContain('5秒前'); // (10000-5000)/1000
    expect(lines[0]).toContain(HIGHLIGHT_KIND_LABEL.milestone_jackpot);
  });

  it('nowMs省略/0以下は「最終N秒前」を出さない', () => {
    const ledger = appendHighlight(null, { liveId: 'lv1', kind: 'gift_large', atMs: 1000 });
    const lines = buildHighlightLedgerDiagLines(ledger, 0);
    expect(lines[0]).not.toContain('秒前');
  });
});

describe('配信別の台帳(2配信同時記録で互いの台帳を消さない)', () => {
  const A = 'lv111';
  const B = 'lv222';
  const kA = highlightLedgerKeyFor(A);
  const kB = highlightLedgerKeyFor(B);

  it('キーは配信ごと(大文字小文字は正規化)・空の liveId は空文字', () => {
    expect(kA).toBe('nls_highlight_ledger_v1_lv111');
    expect(highlightLedgerKeyFor(' LV111 ')).toBe(kA);
    expect(highlightLedgerKeyFor('')).toBe('');
  });

  it('読むキーは [配信別, 共通(移行用)]', () => {
    expect(highlightLedgerReadKeys(A)).toEqual([kA, KEY_HIGHLIGHT_LEDGER]);
    expect(highlightLedgerReadKeys('')).toEqual([KEY_HIGHLIGHT_LEDGER]);
  });

  it('★配信Bのハイライトを足しても配信Aの台帳は消えない', () => {
    // A に1件
    const w1 = planHighlightAppend({}, { liveId: A, kind: 'gift_large', atMs: 1000 });
    expect(w1[kA].rows).toHaveLength(1);
    // B に1件(storage には A の分が残っている状態で)
    const bag = { ...w1 };
    const w2 = planHighlightAppend(bag, { liveId: B, kind: 'gift_mega', atMs: 2000 });
    expect(w2[kB].rows).toHaveLength(1);
    // 配信別キーの A は書き換わらない(plan に含まれない)=消えない
    expect(w2[kA]).toBeUndefined();
    // storage に反映した後も A は2件目を足せる(B に上書きされていない)
    const merged = { ...bag, ...w2 };
    const w3 = planHighlightAppend(merged, { liveId: A, kind: 'milestone_hard', atMs: 3000 });
    expect(w3[kA].rows.map((r) => r.kind)).toEqual(['gift_large', 'milestone_hard']);
  });

  it('★共通キーは「最後に書いた台帳のコピー」(状態速報の互換)として同じ中身で書く', () => {
    const w = planHighlightAppend({}, { liveId: A, kind: 'gift_large', atMs: 1000 });
    expect(w[KEY_HIGHLIGHT_LEDGER]).toEqual(w[kA]);
  });

  it('移行: 配信別キーが無く共通キーが同じ配信の台帳なら、それに続けて追記する', () => {
    const legacy = { liveId: A, rows: [{ at: 500, kind: 'gift_large', label: 'ギフト大波(large)' }], capturedAt: 500 };
    const w = planHighlightAppend({ [KEY_HIGHLIGHT_LEDGER]: legacy }, { liveId: A, kind: 'gift_mega', atMs: 900 });
    expect(w[kA].rows).toHaveLength(2);
  });

  it('記録対象外の kind・liveId 空は何も書かない(null)', () => {
    expect(planHighlightAppend({}, { liveId: A, kind: 'nope', atMs: 1 })).toBeNull();
    expect(planHighlightAppend({}, { liveId: '', kind: 'gift_large', atMs: 1 })).toBeNull();
  });

  it('pickLedgerForLive: 配信別 > 共通(同じ配信のときだけ) > null。別配信の台帳は返さない', () => {
    const la = { liveId: A, rows: [{ at: 1, kind: 'gift_large', label: 'x' }], capturedAt: 1 };
    const lb = { liveId: B, rows: [{ at: 2, kind: 'gift_large', label: 'y' }], capturedAt: 2 };
    expect(pickLedgerForLive({ [kA]: la, [KEY_HIGHLIGHT_LEDGER]: lb }, A)).toBe(la);
    expect(pickLedgerForLive({ [KEY_HIGHLIGHT_LEDGER]: la }, A)).toBe(la);
    expect(pickLedgerForLive({ [KEY_HIGHLIGHT_LEDGER]: lb }, A)).toBeNull();
    expect(pickLedgerForLive({ [kA]: lb }, A)).toBeNull();
    expect(pickLedgerForLive({}, A)).toBeNull();
    expect(pickLedgerForLive(null, A)).toBeNull();
  });
});
