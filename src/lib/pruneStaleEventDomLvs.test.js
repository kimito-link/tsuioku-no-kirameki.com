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

  it('TTL 内（24h 未満）の lv は keep', () => {
    const entries = [
      { lv: 'lv1', capturedAt: NOW - 1 * HOUR },
      { lv: 'lv2', capturedAt: NOW - 23 * HOUR },
      { lv: 'lv3', capturedAt: NOW - 25 * HOUR }
    ];
    const r = pruneStaleEventDomLvs(entries, 'lv-current', NOW);
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
    expect(r.keep).toEqual(['lv-current', 'lv-recent']);
    expect(r.prune).toEqual(['lv-no-time']);
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

  it('TTL 0 / 負数 → デフォルト 24h を使用', () => {
    const entries = [{ lv: 'lv1', capturedAt: NOW - 1 * HOUR }];
    const r = pruneStaleEventDomLvs(entries, '', NOW, 0);
    expect(r.keep).toEqual(['lv1']); // デフォルト 24h で keep
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
