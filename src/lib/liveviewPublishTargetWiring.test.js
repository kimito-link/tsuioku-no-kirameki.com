import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 公開ボタンが別配信のデータを送らない配線の固定(2026-10-09)。部品があっても配線が外れると外へ出る。 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(path.join(root, 'extension/live-view-entry.js'), 'utf8').replace(/\r\n/g, '\n');

describe('live-view-entry: 公開ボタンの宛先照合', () => {
  it('★送信(fetch)の前に checkPublishTarget を通し、不一致なら showError して return する', () => {
    const i = src.indexOf('const target = checkPublishTarget(payload.jsonBlob, liveIdFromUrl());');
    expect(i).toBeGreaterThan(0);
    const block = src.slice(i, i + 700);
    expect(block).toMatch(/if \(!target\.ok\) \{[\s\S]*showError\(target\.reason\);\n\s+return;\n\s+\}/);
    expect(i).toBeLessThan(src.indexOf('const res = await fetch(ingestUrl'));
  });
  it('★不一致のときは送信結果に失敗として記録する(状態速報が「押したのに未送信」と誤報しない)', () => {
    expect(src).toMatch(/recordPublishOutcomeToStorage\(\{ ok: false, httpStatus: null, error: '別配信のデータのため送信を中止'/);
  });
  it('★状態報告・パリティ表示も、この画面の配信のデータだけ描く(初回 read と onChanged の2経路)', () => {
    const paints = src.match(/checkPublishTarget\((?:payload|next)\.jsonBlob, liveIdFromUrl\(\)\)\.ok \? (?:payload|next)\.jsonBlob : null/g) || [];
    expect(paints.length).toBe(2);
  });
});
