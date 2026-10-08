import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 数字カード要求の閉ループ遮断の配線の固定(2026-10-08)。部品を作っても配線が外れると 7,200回/35分の書込が戻る。 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const popup = read('extension/popup-entry.js');
const content = read('extension/content-entry.js');

function fnBody(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return '';
  let d = 0;
  for (let j = src.indexOf('{', i); j < src.length; j += 1) {
    if (src[j] === '{') d += 1;
    else if (src[j] === '}' && (d -= 1) === 0) return src.slice(i, j + 1);
  }
  return '';
}

describe('popup: 数字カードの要求はポリシーを通る', () => {
  const body = fnBody(popup, 'async function requestPanelMetricsFromWatchTab(');
  it('★requestPanelMetricsFromWatchTab の本体が取れている(前提)', () => {
    expect(body.length).toBeGreaterThan(200);
  });
  it('★要求の前に shouldRequestPanelMetrics を通し、false なら null を返す', () => {
    expect(body).toMatch(/if \(!shouldRequestPanelMetrics\(\{ lv: expectedLv, appliedLv: _panelMetricsAppliedForLv, lastAppliedUpdatedAt: _panelMetricsLastUpdatedAt, nowMs: Date\.now\(\) \}\)\) return null;/);
    expect(body.indexOf('shouldRequestPanelMetrics(')).toBeLessThan(body.indexOf('requestPanelMetricsFromWatchTabOnce('));
  });
  it('★適用のたびに updatedAt を記録する(これが無いと毎回「初回」扱いで要求が減らない)', () => {
    const apply = fnBody(popup, 'function applyPanelMetricsFromContent(');
    expect(apply).toMatch(/_panelMetricsLastUpdatedAt = Number\(summary\.updatedAt\) \|\| Date\.now\(\);/);
  });
});

describe('popup: 3秒 poll の分岐は要求を省いたとき storage から数字カードを更新する', () => {
  it('★null のとき applyLightweightPanelSummaryCards(lidPoll) に落ちる(独立検証の指摘・数字カードが fetch 中に止まらない)', () => {
    expect(popup).toMatch(/if \(m\) applyPanelMetricsFromContent\(m, lidPoll\);\n\s+else void applyLightweightPanelSummaryCards\(lidPoll\);/);
  });
});

describe('content: 数字カード要求の応答で panel_summary を強制書込しない', () => {
  it('★NLS_EXPORT_PANEL_METRICS の応答処理は persistPanelLiveSummaryIfDue(false)', () => {
    const i = content.indexOf('if (msg.type === PANEL_METRICS_MESSAGE_TYPE) {');
    expect(i).toBeGreaterThan(0);
    const block = content.slice(i, i + 900);
    expect(block).toMatch(/void persistPanelLiveSummaryIfDue\(false\);/);
    expect(block).not.toMatch(/persistPanelLiveSummaryIfDue\(true\)/);
  });
});
