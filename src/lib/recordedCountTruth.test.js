import { describe, it, expect } from 'vitest';
import {
  collectCommentNoKeys,
  selectNewTailRows,
  appendToTail,
  planMainWriteWithTailFold,
  settleTailAfterMainWrite,
  knownStoredFloor
} from './commentTailBuffer.js';
import { buildCommentDedupeState, mergeNewCommentsIncremental } from './commentRecord.js';
import {
  createMonotonicCommentCountMap,
  resolveMonotonicCommentCountForLive
} from './monotonicCommentCount.js';

/**
 * v0.1.2230「記録」が保存件数より多く居座る不具合の回帰テスト。
 *
 * 実機再現(2026-11-26・決定的フィード 25+300 件): 保存ユニーク 325 件なのに「記録 426」。
 *   流れ: テールに 54 件 → 大口バッチ(deep harvest)がテールを経由せずメインへ直行して
 *   その 54 件＋新着 47 件を書く → 同じ 47 件が通常経路でまた届き、既知キーに無いので
 *   テールへ再追記 → 「メイン 325 + テール 101 = 426」→ 畳み込みは +0 件なのに床が 426 を引き継ぎ、
 *   単調ゲートが 426 を焼き付けた。
 *
 * ここでは content-entry の帳簿(メイン件数・テール・既知キー・dedupe 状態・表示ゲート)を
 *   本物の純関数だけで組んで同じ順に流し、表示値が一度も保存ユニーク件数を超えないことを固定する。
 */
const LV = 'lv888888888';
const row = (n) => ({
  commentNo: String(n),
  text: `ファン こんばんは テスト ${n} わこつ 8888`,
  userId: String(20000 + ((n * 7) % 60)),
  capturedAt: 1_700_000_000_000 + n * 20
});
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => row(a + i));

function createPipeline() {
  const st = {
    mainCount: 0,
    tail: /** @type {any[]} */ ([]),
    knownKeys: new Set(),
    dedupe: buildCommentDedupeState(LV, []),
    gate: createMonotonicCommentCountMap(),
    observed: 0,
    stored: new Set(),
    shown: /** @type {number[]} */ ([])
  };
  const show = () => {
    const g = resolveMonotonicCommentCountForLive(st.gate, LV, st.observed);
    st.shown.push(typeof g === 'number' ? g : st.observed);
  };
  /** persistCommentRowsImpl の件数部分(incrementalMode) */
  const writeMain = (rows, tailFoldCount) => {
    const { added } = mergeNewCommentsIncremental(LV, st.dedupe, rows);
    for (const a of added) st.stored.add(a.text);
    const incrementalTotal = st.mainCount + added.length;
    const floor = knownStoredFloor({ savedTotals: [], tailMainCount: st.mainCount, tailLength: st.tail.length, tailFoldCount });
    st.observed = Math.max(incrementalTotal, floor);
    show();
    return st.observed;
  };
  return {
    st,
    /** bufferRowsToTail */
    liveRows(rows) {
      const { fresh, keys } = selectNewTailRows(LV, rows, st.knownKeys);
      if (!fresh.length) return;
      st.tail = appendToTail(st.tail, fresh);
      for (const k of keys) st.knownKeys.add(k);
      for (const r of fresh) st.stored.add(r.text);
      st.observed = st.mainCount + st.tail.length;
      show();
    },
    /** compactTailIntoMain */
    compact() {
      const n = st.tail.length;
      if (!n) return;
      st.mainCount = writeMain(st.tail.slice(0, n), n);
      st.tail = st.tail.slice(n);
      st.observed = st.mainCount + st.tail.length;
      show();
    },
    /** flushBatchViaTail の大口直行(TAIL_BULK_BYPASS_MIN_ROWS 以上) */
    bulk(batch) {
      const plan = planMainWriteWithTailFold(batch, st.tail);
      st.mainCount = writeMain(plan.rows, plan.foldLen);
      const settled = settleTailAfterMainWrite(LV, { tail: st.tail, foldLen: plan.foldLen, writtenRows: batch, knownKeys: st.knownKeys, mainCount: st.mainCount });
      st.tail = settled.tail;
      st.knownKeys = settled.knownKeys;
      st.observed = settled.recordedCount;
      show();
    }
  };
}

describe('記録件数 = 保存ユニーク件数(テール ⊥ メイン)', () => {
  it('★実機再現の順序でも、表示「記録」は一度も保存ユニーク件数を超えず、最後は 325 になる', () => {
    const p = createPipeline();
    p.liveRows(range(1, 224));
    p.compact(); // メイン 224
    p.liveRows(range(225, 278)); // テール 54
    // deep harvest: 直近 150 行(=テールの 54 件 + 新着 47 件 + メイン既存 49 件)が大口で直行
    p.bulk(range(176, 325).concat(range(176, 325)).concat(range(176, 325)).concat(range(176, 325)));
    p.liveRows(range(279, 325)); // 同じ 47 件が通常経路で再到来
    p.compact();
    const uniq = p.st.stored.size;
    expect(uniq).toBe(325);
    expect(Math.max(...p.st.shown)).toBe(325);
    expect(p.st.shown.at(-1)).toBe(325);
    expect(p.st.tail.length).toBe(0);
  });

  it('大口直行のあとに同じ行が届いても、テールへ再追記しない(既知キーへ反映)', () => {
    const p = createPipeline();
    p.liveRows(range(1, 10));
    p.bulk(range(1, 600));
    expect(p.st.tail.length).toBe(0);
    p.liveRows(range(590, 600));
    expect(p.st.tail.length).toBe(0);
    expect(p.st.observed).toBe(600);
  });

  it('大口直行の後に届いた本当の新着はテールに入り、件数は メイン + テール のまま正しい', () => {
    const p = createPipeline();
    p.bulk(range(1, 500));
    p.liveRows(range(495, 510));
    expect(p.st.tail.length).toBe(10);
    expect(p.st.observed).toBe(510);
    p.compact();
    expect(p.st.observed).toBe(510);
    expect(Math.max(...p.st.shown)).toBe(510);
  });
});

describe('planMainWriteWithTailFold / settleTailAfterMainWrite / knownStoredFloor', () => {
  it('テールが空なら foldLen 0・バッチそのまま', () => {
    const b = range(1, 3);
    const plan = planMainWriteWithTailFold(b, []);
    expect(plan.foldLen).toBe(0);
    expect(plan.rows).toEqual(b);
  });

  it('テールがあればバッチの後ろに載せ、foldLen はテール長', () => {
    const plan = planMainWriteWithTailFold(range(1, 2), range(3, 5));
    expect(plan.foldLen).toBe(3);
    expect(plan.rows.map((r) => r.commentNo)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('settle: 載せた分だけテール先頭を外し、await 中に来た行は残す。既知キーに直行行を足す', () => {
    const known = new Set();
    const tail = range(10, 14); // 先頭 3 件を載せた後に 2 件届いた想定
    const out = settleTailAfterMainWrite(LV, { tail, foldLen: 3, writtenRows: range(1, 5), knownKeys: known, mainCount: 100 });
    expect(out.tail.map((r) => r.commentNo)).toEqual(['13', '14']);
    expect(out.recordedCount).toBe(102);
    for (const k of collectCommentNoKeys(LV, range(1, 5))) expect(out.knownKeys.has(k)).toBe(true);
  });

  it('床: 畳み込み中の行はテール分から引く(旧式の メイン + テール長 で過大値を引き継がない)', () => {
    expect(knownStoredFloor({ tailMainCount: 325, tailLength: 101, tailFoldCount: 101 })).toBe(325);
    expect(knownStoredFloor({ tailMainCount: 325, tailLength: 101 })).toBe(426);
  });

  it('床: 保存済み集計の方が大きければそれを下限にする(取りこぼしで後退させない目的は維持)', () => {
    expect(knownStoredFloor({ savedTotals: [500, null, '480'], tailMainCount: 100, tailLength: 5, tailFoldCount: 5 })).toBe(500);
  });
});
