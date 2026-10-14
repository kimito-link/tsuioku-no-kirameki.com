import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 2026-10-14: /live/ 規則の影運用(laneImportShadow)の配線の固定。
 *   観測のみ(表示は変えない)なので、配線が切れても画面は何も変わらず【気づけない】。
 *   打点(publishLaneMirror)→入力(公式行の保持)→診断→状態速報の1行、のどれかが欠けると差が読めなくなる。
 */
const read = (p) => fs.readFileSync(path.resolve(p), 'utf8').split('\r\n').join('\n');
const popup = read('src/extension/popup-entry.js');
const printer = read('src/lib/aiShareFullText.js');

describe('popup-entry: 影運用の打点と入力', () => {
  it('★publishLaneMirror が鏡を作った直後に影運用を呼ぶ', () => {
    const at = popup.indexOf('function publishLaneMirror(input) {');
    expect(at).toBeGreaterThan(0);
    const body = popup.slice(at, at + 2400);
    // ★内容アドレスの控え→合流 flush は隣のまま(venueLaneParity.wiring が固定)。影運用はその【後ろ】に置く。
    expect(body).toMatch(/mergeAndScheduleFlush\('lane', snap, snap && snap\.liveId, now\);\n\s+observeLaneImportShadowNow\(snap, now\);/);
  });
  it('★暫定供給・隠れた・受動のときは計算しない(部分データで嘘の差を出さない)', () => {
    const at = popup.indexOf('function observeLaneImportShadowNow');
    expect(at).toBeGreaterThan(0);
    const body = popup.slice(at, at + 900);
    expect(body).toMatch(/INLINE_PASSIVE \|\| _panelHidden\(\) \|\| STORY_SOURCE_STATE\.entriesProvisional/);
  });
  it('★入力に公式ギフト/広告の正規化済み行(paint が読んだ値そのもの)を渡す', () => {
    expect(popup).toMatch(/STORY_SOURCE_STATE\.officialGiftRows = officialGiftRows;\n\s+STORY_SOURCE_STATE\.nicoadApiRows = nicoadApiRows;/);
    const at = popup.indexOf('function observeLaneImportShadowNow');
    const body = popup.slice(at, at + 900);
    expect(body).toMatch(/kokenRows: STORY_SOURCE_STATE\.officialGiftRows,/);
    expect(body).toMatch(/nicoadRows: STORY_SOURCE_STATE\.nicoadApiRows,/);
    expect(body).toMatch(/broadcasterUid: _broadcasterUidTracker\.current\(\)\.uid,/);
  });
  it('★診断(laneImportShadow)へ line と計算回数・最大時間を載せる', () => {
    expect(popup).toMatch(/laneImportShadow: \{\n\s+line: formatLaneImportShadowLine\(_laneImportShadow\),/);
    expect(popup).toMatch(/maxMs: _laneImportShadow\.maxMs,/);
  });
});

describe('aiShareFullText: 状態速報の1行', () => {
  it('★popup 診断の laneImportShadow.line を読める行へ出す', () => {
    expect(printer).toMatch(/laneImportShadow\?\.line/);
    expect(printer).toMatch(/if \(shadowLine\) \{ lines\.push\(shadowLine\); lines\.push\(''\); \}/);
  });
});
