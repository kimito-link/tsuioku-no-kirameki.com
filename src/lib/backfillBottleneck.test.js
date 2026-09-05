import { describe, it, expect } from 'vitest';
import {
  judgeBackfillBottleneck,
  METER_SILENT_MS,
  YIELD_STARVED_RATIO,
  YIELD_WARN_RATIO,
  BRIDGE_WASTE_RATIO,
  BRIDGE_MIN_DATA_SEGS
} from './backfillBottleneck.js';

const NOW = 1_700_000_000_000;

/** 正常に走っている metric の雛形(各テストで必要な所だけ上書きする)。 */
const base = (over = {}) => ({
  running: 1,
  ts: NOW - 1000,
  fg: 1,
  dataSegs: 420,
  bridgingSteps: 30,
  yields: 66,
  yieldWaitMsTotal: 1000,
  elapsedMs: 12_000,
  ...over
});

describe('judgeBackfillBottleneck — 律速を1つ名指しする', () => {
  /*
   * ★順1: 走行中なのに計器が沈黙。
   *   旧実装は詰まると ts 更新が止まり、status の鮮度ゲート(15秒)で【行ごと消えた】
   *   =一番知りたい瞬間に計器が自分を消していた。ここでは bad で名指しする。
   */
  it('★走行中なのに計器が沈黙していれば bad(灰に落とさない)', () => {
    const r = judgeBackfillBottleneck(base({ ts: NOW - (METER_SILENT_MS + 1000) }), NOW);
    expect(r.level).toBe('bad');
    expect(r.reason).toBe('stale-meter');
    expect(r.text).toContain('沈黙');
    expect(r.text).toContain('停滞');
  });

  it('沈黙が閾値ちょうどなら まだ bad にしない(境界)', () => {
    const r = judgeBackfillBottleneck(base({ ts: NOW - METER_SILENT_MS }), NOW);
    expect(r.reason).not.toBe('stale-meter');
  });

  it('★沈黙は他のどの律速より優先される(順1である)', () => {
    // 裏タブ かつ yield枯渇 かつ 橋渡し過多 でも、沈黙が勝つ。
    const r = judgeBackfillBottleneck(
      base({ ts: NOW - 60_000, fg: 0, yieldWaitMsTotal: 11_000, bridgingSteps: 9999 }),
      NOW
    );
    expect(r.reason).toBe('stale-meter');
  });

  it('★裏タブなら warn + 次の一手(タブを前面に)', () => {
    const r = judgeBackfillBottleneck(base({ fg: 0 }), NOW);
    expect(r.level).toBe('warn');
    expect(r.reason).toBe('bg-tab');
    expect(r.text).toContain('裏タブ');
    expect(r.text).toContain('前面'); // ★次の一手が入っているか
  });

  it('★yield待ちが6割以上なら bad(メインスレッド枯渇)', () => {
    const r = judgeBackfillBottleneck(
      base({ elapsedMs: 10_000, yieldWaitMsTotal: 6_700 }),
      NOW
    );
    expect(r.level).toBe('bad');
    expect(r.reason).toBe('yield-starved');
    expect(r.text).toContain('67%');
  });

  it('yield待ちが3割台なら warn(予兆)', () => {
    const r = judgeBackfillBottleneck(
      base({ elapsedMs: 10_000, yieldWaitMsTotal: 3_800 }),
      NOW
    );
    expect(r.level).toBe('warn');
    expect(r.reason).toBe('yield-warn');
    expect(r.text).toContain('38%');
  });

  it('★yield は裏タブより後(裏タブが同時に成立していれば裏タブが勝つ)', () => {
    const r = judgeBackfillBottleneck(
      base({ fg: 0, elapsedMs: 10_000, yieldWaitMsTotal: 9_000 }),
      NOW
    );
    expect(r.reason).toBe('bg-tab');
  });

  it('★空区画の橋渡しが実区画の5割超なら warn', () => {
    const r = judgeBackfillBottleneck(
      base({ dataSegs: 120, bridgingSteps: 380 }),
      NOW
    );
    expect(r.level).toBe('warn');
    expect(r.reason).toBe('bridge-waste');
    expect(r.text).toContain('橋380');
    expect(r.text).toContain('実区画120');
  });

  /*
   * ★開始直後の暴れ防止。実区画が数個のうちは橋渡し1件でも比率が跳ねるので断定しない。
   *   これが無いと「取り込みを始めた瞬間に必ず黄色」になり、警告が信用されなくなる。
   */
  it('★実区画が少ないうちは橋渡し律速と断定しない(開始直後の偽陽性を出さない)', () => {
    const r = judgeBackfillBottleneck(
      base({ dataSegs: BRIDGE_MIN_DATA_SEGS - 1, bridgingSteps: 99 }),
      NOW
    );
    expect(r.reason).not.toBe('bridge-waste');
    expect(r.level).toBe('ok');
  });

  it('正常なら ok + 1区画あたりの速さを出す', () => {
    const r = judgeBackfillBottleneck(base({ dataSegs: 400, elapsedMs: 12_000 }), NOW);
    expect(r.level).toBe('ok');
    expect(r.reason).toBe('healthy');
    expect(r.text).toContain('約1区画30ms');
    expect(r.text).toContain('実区画400');
  });

  /*
   * ★running=0 は「異常」ではなく「対象外」。色を付けると総合判定が
   *   毎回「注意」に引きずられる(v0.1.1360 で実際に踏んだ化石値の型)。
   */
  it('★走っていなければ na(色を付けない)・文言は「— 対象なし:」で始まる', () => {
    const r = judgeBackfillBottleneck(base({ running: 0, ts: NOW - 300_000 }), NOW);
    expect(r.level).toBe('na');
    expect(r.reason).toBe('idle');
    expect(r.text.startsWith('— 対象なし:')).toBe(true);
    expect(r.text).toContain('5分前');
  });

  it('metric が無ければ na(落ちない)', () => {
    for (const v of [null, undefined, 'x', 0]) {
      const r = judgeBackfillBottleneck(/** @type {any} */ (v), NOW);
      expect(r.level).toBe('na');
      expect(r.reason).toBe('no-data');
      expect(r.text.startsWith('— 対象なし:')).toBe(true);
    }
  });

  it('欠損フィールドだらけでも落ちない(壊れたstorage値を下流に流さない)', () => {
    expect(() => judgeBackfillBottleneck({ running: 1 }, NOW)).not.toThrow();
    const r = judgeBackfillBottleneck({ running: 1 }, NOW);
    expect(['ok', 'warn', 'bad']).toContain(r.level);
  });

  it('elapsedMs=0 でゼロ除算しない', () => {
    const r = judgeBackfillBottleneck(base({ elapsedMs: 0, yieldWaitMsTotal: 5000 }), NOW);
    expect(r.level).toBeDefined();
    expect(Number.isNaN(Number(r.text.replace(/\D/g, '')))).toBe(false);
  });

  it('しきい値の定数が設計どおり', () => {
    expect(METER_SILENT_MS).toBe(15_000);
    expect(YIELD_STARVED_RATIO).toBe(0.6);
    expect(YIELD_WARN_RATIO).toBe(0.3);
    expect(BRIDGE_WASTE_RATIO).toBe(0.5);
    expect(BRIDGE_MIN_DATA_SEGS).toBe(10);
  });

  /*
   * ★設計 A-1: text は症状語だけを禁止。原因トークン＋次の一手を含む。
   *   「遅い」「異常」だけのセルは "読んで直せる" を満たさない。
   */
  it('★どの判定でも text が空でない(無言のセルを作らない)', () => {
    const cases = [
      base({ ts: NOW - 60_000 }),
      base({ fg: 0 }),
      base({ elapsedMs: 10_000, yieldWaitMsTotal: 7_000 }),
      base({ dataSegs: 120, bridgingSteps: 380 }),
      base(),
      base({ running: 0 }),
      null
    ];
    for (const c of cases) {
      const r = judgeBackfillBottleneck(/** @type {any} */ (c), NOW);
      expect(String(r.text || '').length).toBeGreaterThan(4);
    }
  });
});
