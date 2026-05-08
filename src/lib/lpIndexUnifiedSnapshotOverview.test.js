/**
 * v0.1.195: LP に「統合状況スナップショット」の概念導入セクションを追加する契約テスト。
 * 6 コンポーネントの 1 番目（独立 data-lp-feature でバグ特定可能）。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lpIndexPath = path.join(repoRoot, 'tsuioku-no-kirameki', 'index.html');

/**
 * unified-snapshot-overview セクション内の文字列を返す。
 * 後続コンポーネント（snapshot-gift-detail）が無い時点でも検証可能なよう、
 * 後続セクションが見つからない場合は marketing-features の手前まで取る。
 */
function overviewBlock(html) {
  const start = html.indexOf('id="unified-snapshot-overview"');
  if (start < 0) return '';
  const candidates = [
    html.indexOf('id="snapshot-gift-detail"', start),
    html.indexOf('id="marketing-features"', start)
  ].filter((p) => p > start);
  const end = candidates.length ? Math.min(...candidates) : html.length;
  return html.slice(start, end);
}

describe('lpIndexUnifiedSnapshotOverview', () => {
  const html = readFileSync(lpIndexPath, 'utf8');

  it('セクションが存在し data 属性が付く', () => {
    expect(html).toContain('id="unified-snapshot-overview"');
    expect(html).toContain('data-lp-feature="unified-snapshot-overview"');
  });

  it('「ぜんぶ一緒に記録される」概念を平易に説明', () => {
    const block = overviewBlock(html);
    expect(block.length).toBeGreaterThan(0);
    expect(block).toMatch(/状況把握|まとめて記録|ひとつのスナップショット/);
  });

  it('未実装機能と実装済み機能を区別する文言を含む', () => {
    const block = overviewBlock(html);
    // 「将来の予定」と「いま動いている」を分けて書く（誇張防止）
    expect(block).toMatch(/予定|これから|計画/);
    expect(block).toMatch(/今|現在|いま/);
  });

  it('LP 用ダミー表現を含まない（lpIndexPlainLanguage 共有契約）', () => {
    const block = overviewBlock(html);
    expect(block).not.toContain('LP 用ダミー');
    expect(block).not.toContain('LP 用モック');
  });
});
