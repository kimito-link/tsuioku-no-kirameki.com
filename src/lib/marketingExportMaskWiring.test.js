import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * マーケ書き出しタブが「共有用に伏せる」設定を実際に使う(v0.1.1661)。
 *   調査(2026-10-18): popup が KEY_MARKETING_EXPORT_MASK_LABELS に保存するチェック
 *   (トップコメンター表示名を伏せ字・サムネを出さない)が、別タブ化後の marketing-export-entry.js で
 *   `maskShareLabels: false` 固定になっており、共有用に伏せたつもりのHTMLに実名・サムネURLが出ていた。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(repoRoot, 'src/extension/marketing-export-entry.js'), 'utf8').replace(/\r\n/g, '\n');

describe('マーケ書き出しタブのマスク設定', () => {
  it('★保存された設定のキーを読み、正規化して使う', () => {
    expect(src).toContain('KEY_MARKETING_EXPORT_MASK_LABELS');
    expect(src).toContain('normalizeMarketingExportMaskLabels(');
  });
  it('★buildMarketingDashboardHtml に固定値(false)を渡さない', () => {
    expect(src).not.toMatch(/maskShareLabels:\s*false/);
    expect(src).toMatch(/maskShareLabels:\s*maskShareLabels/);
  });
  it('★読めない(storage エラー)ときは伏せる側に倒す(実名を出さない)', () => {
    const i = src.indexOf('let maskShareLabels');
    expect(i).toBeGreaterThan(0);
    expect(src.slice(i, i + 60)).toContain('= true');
  });
});
