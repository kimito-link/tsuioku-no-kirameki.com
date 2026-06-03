/**
 * LP（tsuioku-no-kirameki/index.html）に主要機能説明が載っていることの契約テスト。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lpIndexPath = path.join(repoRoot, 'tsuioku-no-kirameki', 'index.html');

describe('lpIndexFeatures', () => {
  const html = readFileSync(lpIndexPath, 'utf8');

  it('コメント送信ガイドセクションと data 属性', () => {
    expect(html).toContain('id="lp-comment-compose-guide"');
    expect(html).toContain('data-lp-feature="comment-compose-guide"');
  });

  it('やさしい注意POPの LP 見本と用語アンカー', () => {
    expect(html).toContain('data-lp-feature="kindness-nudge-mock"');
    expect(html).toContain('id="extension-guide-kindness-nudge"');
    expect(html).toMatch(/やさしい注意|ソフトなお知らせ|一呼吸/);
  });

  it('マーケ分析の深掘りと JSON 用語', () => {
    expect(html).toContain('id="marketing-deep-features"');
    expect(html).toContain('id="extension-guide-marketing-export"');
    expect(html).toContain('nl-marketing-export-v1');
    expect(html).toMatch(/四分位/);
    expect(html).toContain('schemaVersion');
    expect(html).toMatch(/5分|5 分/);
    expect(html).toMatch(/koken 公式 API|一括取得/);
    expect(html).toContain('mkt-gift-ledger');
  });

  it('マーケ分析の読み方ブロックと実装に沿った用語', () => {
    expect(html).toContain('id="marketing-what-you-can-do"');
    expect(html).toContain('data-lp-feature="marketing-advice-intro"');
    expect(html).toMatch(/この表がわかると|何ができる/);
    expect(html).toContain('selfPosted');
    expect(html).toContain('is184');
  });

  it('用語⑧がコメント送信の現状説明を含む', () => {
    expect(html).toContain('id="extension-guide-comment-voice"');
    expect(html).toMatch(/#commentInput|コメント送信/);
    expect(html).toMatch(/NLS_POST_COMMENT|ローカル/);
  });

  it('用語⑪が開示請求向け証拠の LP 説明を含む（popup には目立つ UI を置かない方針）', () => {
    expect(html).toContain('id="extension-guide-disclosure-evidence"');
    expect(html).toMatch(/開示請求|プロバイダ責任制限法/);
    expect(html).toMatch(/SHA-256|SHA256/);
    expect(html).toMatch(/ポップアップに目立つスイッチは置かない|萎縮/);
  });
});
