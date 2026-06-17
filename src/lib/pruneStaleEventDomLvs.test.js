/**
 * v0.1.203 Patch 4: pruneStaleEventDomLvs / buildEventDomEntriesFromStorageBag のテスト。
 */

import { describe, it, expect } from 'vitest';
import {
  pruneStaleEventDomLvs,
  buildEventDomEntriesFromStorageBag
} from './pruneStaleEventDomLvs.js';

const NOW = 1_700_000_000_000; // 適当な現在時刻
const HOUR = 60 * 60 * 1000;

describe('pruneStaleEventDomLvs', () => {
  it('null / undefined / [] → 全部空', () => {
    expect(pruneStaleEventDomLvs(null, 'lv1', NOW)).toEqual({
      keep: [],
      prune: []
    });
    expect(pruneStaleEventDomLvs(undefined, 'lv1', NOW)).toEqual({
      keep: [],
      prune: []
    });
    expect(pruneStaleEventDomLvs([], 'lv1', NOW)).toEqual({
      keep: [],
      prune: []
    });
  });

  it('現在 lv は capturedAt 古くても無条件で保護', () => {
    const entries = [
      { lv: 'lv-current', capturedAt: NOW - 100 * HOUR }, // 100h 前
      { lv: 'lv-old', capturedAt: NOW - 100 * HOUR }
    ];
    const r = pruneStaleEventDomLvs(entries, 'lv-current', NOW);
    expect(r.keep).toEqual(['lv-current']);
    expect(r.prune).toEqual(['lv-old']);
  });

  it('v0.1.801: TTL 内（6h 未満）の lv は keep・超過は prune', () => {
    const entries = [
      { lv: 'lv1', capturedAt: NOW - 1 * HOUR }, // 6h 未満 keep
      { lv: 'lv2', capturedAt: NOW - 5 * HOUR }, // 6h 未満 keep
      { lv: 'lv3', capturedAt: NOW - 7 * HOUR } // 6h 超 prune
    ];
    const r = pruneStaleEventDomLvs(entries, 'lv-current', NOW);
    // keep は capturedAt 新しい順(LRU)。lv1(1h)→lv2(5h)。
    expect(r.keep).toEqual(['lv1', 'lv2']);
    expect(r.prune).toEqual(['lv3']);
  });

  it('capturedAt 欠落 → prune（現在 lv 以外は守れない）', () => {
    const entries = [
      { lv: 'lv-current' },
      { lv: 'lv-no-time' },
      { lv: 'lv-recent', capturedAt: NOW - 1 * HOUR }
    ];
    const r = pruneStaleEventDomLvs(entries, 'lv-current', NOW);
    // 現 lv は先頭(無条件枠)、その後 TTL 生存を新しい順に並べる。
    expect(r.keep).toEqual(['lv-current', 'lv-recent']);
    expect(r.prune).toEqual(['lv-no-time']);
  });

  it('v0.1.801: 件数上限(LRU)で TTL 内でも新しい順に maxKeep 件だけ残す', () => {
    const entries = [];
    // すべて TTL(6h)内。新しい順に lv-0(0.1h) ... lv-39(3.9h)。
    for (let i = 0; i < 40; i++) {
      entries.push({ lv: `lv-${i}`, capturedAt: NOW - (i + 1) * 6 * 60 * 1000 }); // i*6分前
    }
    const r = pruneStaleEventDomLvs(entries, '', NOW, undefined, 30);
    expect(r.keep).toHaveLength(30); // 新しい 30 件
    expect(r.prune).toHaveLength(10); // 古い 10 件
    expect(r.keep[0]).toBe('lv-0'); // 最新が先頭
    expect(r.keep).not.toContain('lv-39'); // 最古は prune
    expect(r.prune).toContain('lv-39');
  });

  it('v0.1.801: 現 lv は件数上限の枠外で必ず保護', () => {
    const entries = [{ lv: 'lv-current', capturedAt: NOW - 100 * HOUR }]; // TTL 超でも現lvは keep
    for (let i = 0; i < 35; i++) {
      entries.push({ lv: `lv-${i}`, capturedAt: NOW - (i + 1) * 60 * 1000 });
    }
    const r = pruneStaleEventDomLvs(entries, 'lv-current', NOW, undefined, 30);
    expect(r.keep).toContain('lv-current'); // 枠外で保護
    // 現 lv 以外の TTL 生存は 35 件 → 上限 30 で 5 件 prune。
    expect(r.keep.filter((lv) => lv !== 'lv-current')).toHaveLength(30);
  });

  it('カスタム TTL で動く（1 時間に圧縮）', () => {
    const entries = [
      { lv: 'lv1', capturedAt: NOW - 30 * 60 * 1000 }, // 30 分前
      { lv: 'lv2', capturedAt: NOW - 2 * HOUR } // 2 時間前
    ];
    const r = pruneStaleEventDomLvs(entries, '', NOW, HOUR);
    expect(r.keep).toEqual(['lv1']);
    expect(r.prune).toEqual(['lv2']);
  });

  it('実機シナリオ: 49 件のうち current 1 + 直近 24h 3 件のみ keep、残 45 件 prune', () => {
    const entries = [
      { lv: 'lv350471922', capturedAt: NOW - 5 * 60 * 1000 } // current
    ];
    // 直近 24h 内 3 件
    for (let i = 1; i <= 3; i++) {
      entries.push({ lv: `lv-recent-${i}`, capturedAt: NOW - i * HOUR });
    }
    // 24h 超 45 件
    for (let i = 1; i <= 45; i++) {
      entries.push({ lv: `lv-old-${i}`, capturedAt: NOW - (24 + i) * HOUR });
    }
    const r = pruneStaleEventDomLvs(entries, 'lv350471922', NOW);
    expect(r.keep).toHaveLength(4);
    expect(r.prune).toHaveLength(45);
    expect(r.keep).toContain('lv350471922');
  });

  it('壊れた entries を skip（type 不正、空 lv）', () => {
    const entries = /** @type {any} */ ([
      null,
      { lv: '' },
      { lv: '   ' },
      'not-an-object',
      { lv: 'lv-good', capturedAt: NOW - 1 * HOUR }
    ]);
    const r = pruneStaleEventDomLvs(entries, '', NOW);
    expect(r.keep).toEqual(['lv-good']);
    expect(r.prune).toEqual([]);
  });

  it('nowMs 不正 → 空', () => {
    const entries = [{ lv: 'lv1', capturedAt: NOW }];
    expect(
      pruneStaleEventDomLvs(entries, '', /** @type {any} */ ('not-a-number'))
    ).toEqual({ keep: [], prune: [] });
  });

  it('TTL 0 / 負数 → デフォルト(6h)を使用', () => {
    const entries = [{ lv: 'lv1', capturedAt: NOW - 1 * HOUR }];
    const r = pruneStaleEventDomLvs(entries, '', NOW, 0);
    expect(r.keep).toEqual(['lv1']); // デフォルト 6h 内なので keep
  });
});

describe('buildEventDomEntriesFromStorageBag', () => {
  it('null/undefined/{} → []', () => {
    expect(buildEventDomEntriesFromStorageBag(null)).toEqual([]);
    expect(buildEventDomEntriesFromStorageBag(undefined)).toEqual([]);
    expect(buildEventDomEntriesFromStorageBag({})).toEqual([]);
  });

  it('nls_event_dom_<lv> パターンのみ抽出', () => {
    const bag = {
      nls_event_dom_lv1: { capturedAt: 100 },
      nls_event_dom_lv2: { capturedAt: 200 },
      nls_other_key: 'ignored',
      not_nls: 'ignored'
    };
    const r = buildEventDomEntriesFromStorageBag(bag);
    expect(r).toEqual([
      { lv: 'lv1', capturedAt: 100 },
      { lv: 'lv2', capturedAt: 200 }
    ]);
  });

  it('capturedAt / lastUpdatedAt / updatedAt のいずれかから取る', () => {
    const bag = {
      nls_event_dom_lv1: { capturedAt: 100 },
      nls_event_dom_lv2: { lastUpdatedAt: 200 },
      nls_event_dom_lv3: { updatedAt: 300 },
      nls_event_dom_lv4: {} // 時刻情報なし → 0
    };
    const r = buildEventDomEntriesFromStorageBag(bag);
    expect(r.find((e) => e.lv === 'lv1')?.capturedAt).toBe(100);
    expect(r.find((e) => e.lv === 'lv2')?.capturedAt).toBe(200);
    expect(r.find((e) => e.lv === 'lv3')?.capturedAt).toBe(300);
    expect(r.find((e) => e.lv === 'lv4')?.capturedAt).toBe(0);
  });

  it('プレフィックス完全一致のみ（部分一致しない）', () => {
    const bag = {
      nls_event_dom_lv1: { capturedAt: 100 },
      x_nls_event_dom_lv2: { capturedAt: 200 } // prefix 不一致
    };
    const r = buildEventDomEntriesFromStorageBag(bag);
    expect(r).toHaveLength(1);
    expect(r[0].lv).toBe('lv1');
  });
});
