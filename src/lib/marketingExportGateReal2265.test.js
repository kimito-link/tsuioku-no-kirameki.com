/** @vitest-environment happy-dom */
// v0.1.2265 実ページ(プレミア公開前の YouTube・コメント0件)で、内訳(devMonitorDetails)を開かなくてもマーケのボタンが押せなくなる。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { applyMarketingExportGate } from './marketingExportGate.js';

const page = () => {
  document.body.innerHTML = '<button id="devMonitorExportMarketingBtn"></button><button id="exportMarketingQuickBtn" title="全部1つのHTMLで保存"></button>';
  return document;
};

describe('applyMarketingExportGate(2つのボタンへ同じ理由)', () => {
  it('0件と分かっているとき: 2つとも押せず、理由を title に出す', () => {
    const d = page();
    applyMarketingExportGate(d, { liveId: 'Y8K7a-oTsLU', displayCount: 0, storageCount: 0, commentReadState: 'storage_ok' });
    for (const id of ['devMonitorExportMarketingBtn', 'exportMarketingQuickBtn']) {
      expect(d.getElementById(id).disabled).toBe(true);
      expect(d.getElementById(id).title).toBe('コメントが0件です。');
    }
  });
  it('あとでコメントが来たら押せるようになり、元の title に戻る', () => {
    const d = page();
    applyMarketingExportGate(d, { liveId: 'v', displayCount: 0, storageCount: 0, commentReadState: 'storage_ok' });
    applyMarketingExportGate(d, { liveId: 'v', displayCount: 3, storageCount: 3, commentReadState: 'storage_ok' });
    expect(d.getElementById('exportMarketingQuickBtn').disabled).toBe(false);
    expect(d.getElementById('exportMarketingQuickBtn').title).toBe('全部1つのHTMLで保存');
  });
  it('件数がまだ分からない(missing)あいだは押せるまま', () => {
    const d = page();
    applyMarketingExportGate(d, { liveId: 'v', displayCount: 0, storageCount: 0, commentReadState: 'missing' });
    expect(d.getElementById('devMonitorExportMarketingBtn').disabled).toBe(false);
  });
});

describe('配線: 内訳が閉じていても毎回の描画で当てる', () => {
  it('popup-entry の通常描画は、shouldRunDevMonitorPaint の外で applyMarketingExportGate を呼ぶ', () => {
    const src = readFileSync(`${process.cwd()}/src/extension/popup-entry.js`, 'utf8');
    const gateCall = src.indexOf('applyMarketingExportGate(document, { liveId: lv,');
    const paintGate = src.indexOf('shouldRunDevMonitorPaint({ panelOpen: devMonDetails?.open === true })');
    expect(gateCall).toBeGreaterThan(0);
    expect(paintGate).toBeGreaterThan(0);
    expect(gateCall).toBeLessThan(paintGate);
    expect(src).toContain('applyMarketingExportGate(document, p)');
  });
});
