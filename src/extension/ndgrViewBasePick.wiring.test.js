import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// v0.1.1560: タイムシフトで backfill が空の NDGR view を掴んで stalled 固着する不具合の配線テスト。
//   純関数(ndgrViewBasePick.js)は ndgrViewBasePick.test.js で固定済み。ここでは
//   page-intercept(書き手)と content-entry(読み手)が本当に結果を使っているかをソース文字列で固定する
//   (memory: wiring-test-must-check-the-result-is-used)。

const here = path.dirname(fileURLToPath(import.meta.url));
const intercept = fs.readFileSync(path.join(here, 'page-intercept-entry.js'), 'utf8');
const content = fs.readFileSync(path.join(here, 'content-entry.js'), 'utf8');

describe('page-intercept-entry.js は観測 view base を複数露出する', () => {
  it('pushRecentNdgrViewBase を呼び、その結果を data-nls-ndgr-view-uri-recent に書く', () => {
    const start = intercept.indexOf('function observeNdgrViewUri(');
    expect(start).toBeGreaterThan(0);
    const block = intercept.slice(start, start + 2500);
    expect(block).toMatch(/const nextRecent = pushRecentNdgrViewBase\(_ndgrViewUri\.recent, base\);/);
    expect(block).toMatch(/setAttribute\('data-nls-ndgr-view-uri-recent', JSON\.stringify\(nextRecent/);
  });
  it('既存の data-nls-ndgr-view-uri(最新 1 本)はそのまま書いている(v0.1.762 の契約を壊さない)', () => {
    expect(intercept).toContain("root.setAttribute('data-nls-ndgr-view-uri', _ndgrViewUri.base.slice(0, 300));");
  });
});

describe('content-entry.js は候補から view base を選び、死んだ view を次回飛ばす', () => {
  it('data-nls-ndgr-view-uri-recent を読んで parseNdgrViewBaseCandidates に渡す', () => {
    expect(content).toMatch(/parseNdgrViewBaseCandidates\([^)]*getAttribute\('data-nls-ndgr-view-uri-recent'\)/);
  });
  it('runNdgrBackfillOnce で pickNdgrViewBase の .base を viewBase に使う', () => {
    const start = content.indexOf('async function runNdgrBackfillOnce(');
    expect(start).toBeGreaterThan(0);
    const block = content.slice(start, start + 4000);
    expect(block).toMatch(/: pickNdgrViewBase\(readNdgrViewBaseCandidates\(\), deadViewBases\);/);
    expect(block).toContain('const viewBase = picked.base;');
    expect(block).toContain('_backfillProgress.viewPick = picked.reason;');
  });
  it('finally で shouldMarkNdgrViewBaseDead の結果により死亡集合へ add している', () => {
    expect(content).toMatch(/if \(shouldMarkNdgrViewBaseDead\(_backfillProgress\)\) \{\s*\n\s*\(_ndgrDeadViewBasesByLiveId\[liveIdOverride\] \|\|= new Set\(\)\)\.add\(viewBase\);/);
  });
  it('readNdgrViewBaseUri() の既存の読み手(7 箇所)は減っていない', () => {
    const n = (content.match(/readNdgrViewBaseUri\(\)/g) || []).length;
    expect(n).toBeGreaterThanOrEqual(7);
  });
  it('viewPick / viewBaseHash を nls_backfill_progress_v1 に書く(additive)', () => {
    expect(content).toContain("viewPick: String(_backfillProgress.viewPick || ''),");
    expect(content).toContain("viewBaseHash: String(_backfillProgress.viewBaseHash || ''),");
  });
});
