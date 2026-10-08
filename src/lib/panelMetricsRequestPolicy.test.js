import { describe, it, expect } from 'vitest';
import { shouldRequestPanelMetrics, PANEL_METRICS_STALE_MS } from './panelMetricsRequestPolicy.js';

const NOW = 1_000_000;

describe('shouldRequestPanelMetrics — popup が content へ数字カードの要求を送ってよいか', () => {
  it('★初回(まだ何も適用していない)は要求する', () => {
    expect(shouldRequestPanelMetrics({ lv: 'lv1', appliedLv: '', lastAppliedUpdatedAt: 0, nowMs: NOW })).toBe(true);
  });
  it('★配信が切り替わったら要求する(前の配信の値を残さない)', () => {
    expect(shouldRequestPanelMetrics({ lv: 'lv2', appliedLv: 'lv1', lastAppliedUpdatedAt: NOW - 1000, nowMs: NOW })).toBe(true);
  });
  it('★同じ配信で直近に適用済み(15秒未満)なら要求しない=閉じたループの遮断', () => {
    expect(shouldRequestPanelMetrics({ lv: 'lv1', appliedLv: 'lv1', lastAppliedUpdatedAt: NOW - 3000, nowMs: NOW })).toBe(false);
    expect(shouldRequestPanelMetrics({ lv: 'lv1', appliedLv: 'lv1', lastAppliedUpdatedAt: NOW - (PANEL_METRICS_STALE_MS - 1), nowMs: NOW })).toBe(false);
  });
  it('★15秒たったら要求する(無音の配信でも同接・来場が古くならない・watchUrlFreshness の3分を割らない)', () => {
    expect(shouldRequestPanelMetrics({ lv: 'lv1', appliedLv: 'lv1', lastAppliedUpdatedAt: NOW - PANEL_METRICS_STALE_MS, nowMs: NOW })).toBe(true);
  });
  it('★判定できないときは要求する側に倒す(初回の描画を遅らせない)', () => {
    expect(shouldRequestPanelMetrics({ lv: 'lv1', appliedLv: 'lv1', lastAppliedUpdatedAt: undefined, nowMs: NOW })).toBe(true);
    expect(shouldRequestPanelMetrics({ lv: 'lv1', appliedLv: 'lv1', lastAppliedUpdatedAt: NaN, nowMs: NOW })).toBe(true);
    expect(shouldRequestPanelMetrics({ lv: 'lv1', appliedLv: 'lv1', lastAppliedUpdatedAt: 0, nowMs: NOW })).toBe(true);
    expect(shouldRequestPanelMetrics({ lv: 'lv1', appliedLv: 'lv1', lastAppliedUpdatedAt: NOW, nowMs: NaN })).toBe(true);
    expect(shouldRequestPanelMetrics(/** @type {any} */ (null))).toBe(true);
    expect(shouldRequestPanelMetrics({ lv: '', appliedLv: '', lastAppliedUpdatedAt: NOW, nowMs: NOW })).toBe(true);
  });
  it('★時計が巻き戻ったら要求する(止まりっぱなしにしない)', () => {
    expect(shouldRequestPanelMetrics({ lv: 'lv1', appliedLv: 'lv1', lastAppliedUpdatedAt: NOW + 5000, nowMs: NOW })).toBe(true);
  });
  it('大文字・空白の lv も同じ配信として扱う', () => {
    expect(shouldRequestPanelMetrics({ lv: ' LV1 ', appliedLv: 'lv1', lastAppliedUpdatedAt: NOW - 1000, nowMs: NOW })).toBe(false);
  });
  it('staleMs を渡せる(既定は15秒)', () => {
    expect(PANEL_METRICS_STALE_MS).toBe(15_000);
    expect(shouldRequestPanelMetrics({ lv: 'lv1', appliedLv: 'lv1', lastAppliedUpdatedAt: NOW - 11_000, nowMs: NOW, staleMs: 10_000 })).toBe(true);
    expect(shouldRequestPanelMetrics({ lv: 'lv1', appliedLv: 'lv1', lastAppliedUpdatedAt: NOW - 11_000, nowMs: NOW, staleMs: 20_000 })).toBe(false);
  });
});
