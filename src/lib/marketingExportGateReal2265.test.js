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

describe('動画のパネル(data-nl-video-watch=1): ページに出ているコメント数が0と分かったときだけ', () => {
  const video = (factsText) => {
    const d = page();
    d.documentElement.setAttribute('data-nl-video-watch', '1');
    if (factsText) d.body.insertAdjacentHTML('beforeend', `<p class="nlsb-video-watch-card__facts">${factsText}</p>`);
    return d;
  };
  const p0 = { liveId: 'v', displayCount: 0, storageCount: 0, commentReadState: 'storage_ok' };
  it('コメント欄をまだ読んでいないだけの動画(件数不明)は、押せるまま', () => {
    const d = video('再生 590,412 回 ・ 長さ 2:55');
    applyMarketingExportGate(d, p0);
    expect(d.getElementById('exportMarketingQuickBtn').disabled).toBe(false);
    d.documentElement.removeAttribute('data-nl-video-watch');
  });
  it('「コメント 0 件」と出ているプレミア公開前などは、押せず理由を出す', () => {
    const d = video('いいね 0 ・ コメント 0 件 ・ 投稿 2026/11/27');
    applyMarketingExportGate(d, p0);
    expect(d.getElementById('exportMarketingQuickBtn').disabled).toBe(true);
    expect(d.getElementById('devMonitorExportMarketingBtn').title).toBe('コメントが0件です。');
    d.documentElement.removeAttribute('data-nl-video-watch');
  });
  it('「コメント 120 件」と出ているのに記録が0件でも、押せるまま', () => {
    const d = video('コメント 120 件');
    applyMarketingExportGate(d, p0);
    expect(d.getElementById('exportMarketingQuickBtn').disabled).toBe(false);
    d.documentElement.removeAttribute('data-nl-video-watch');
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
