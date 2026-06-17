import { describe, it, expect } from 'vitest';
import { buildReportNextMemoSectionHtml } from './reportNextMemoSectionHtml.js';

// v0.1.811: buildHtmlReportDocument の「次枠メモ」純粋組み立て部の characterization test。

const fullMemo = {
  nextMemos: ['挨拶を増やす', 'コメント拾い'],
  highlights: [{ atLabel: '12分', reason: '盛り上がり', sampleLine: 'ｗｗｗ' }],
  thanksPoints: ['常連さんに感謝'],
  templates: ['また来てね']
};

describe('buildReportNextMemoSectionHtml', () => {
  it('セクション枠とアバター3体・見出しを出す', () => {
    const html = buildReportNextMemoSectionHtml(fullMemo, {
      avatarLink: '<img id="L">',
      avatarKonta: '<img id="K">',
      avatarTanu: '<img id="T">'
    });
    expect(html).toContain('id="sec-next-memo"');
    expect(html).toContain('りんく・こん太・たぬ姉の次枠メモ');
    expect(html).toContain('<img id="L">');
    expect(html).toContain('<img id="K">');
    expect(html).toContain('<img id="T">');
    expect(html).toContain('<li>挨拶を増やす</li>');
    expect(html).toContain('<strong>12分</strong> — 盛り上がり');
    expect(html).toContain('memo-sample">ｗｗｗ');
    expect(html).toContain('<li>常連さんに感謝</li>');
    expect(html).toContain('<li>また来てね</li>');
  });

  it('各リストが空なら既定プレースホルダ', () => {
    const html = buildReportNextMemoSectionHtml({ nextMemos: [], highlights: [], thanksPoints: [], templates: [] });
    expect(html).toContain('（まだ十分なメモが出ません）');
    expect(html).toContain('（この枠では目立つ場面の抽出がまだ少ないです）');
    expect(html).toContain('（記録が増えるとここが埋まります）');
    expect(html).toContain('（テンプレはマーケ分析の「りんく達の作戦会議」も参照）');
  });

  it('memo が欠損(非配列)でもプレースホルダで安全に出す', () => {
    const html = buildReportNextMemoSectionHtml(null);
    expect(html).toContain('id="sec-next-memo"');
    expect(html).toContain('（まだ十分なメモが出ません）');
  });

  it('メモ文言は escapeHtml される(XSS防止)', () => {
    const html = buildReportNextMemoSectionHtml({ nextMemos: ['<script>x</script>'] });
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).not.toContain('<script>x</script>');
  });

  it('highlight の各フィールドも escape される', () => {
    const html = buildReportNextMemoSectionHtml({
      highlights: [{ atLabel: '<a>', reason: '<b>', sampleLine: '<c>' }]
    });
    expect(html).toContain('&lt;a&gt;');
    expect(html).toContain('&lt;b&gt;');
    expect(html).toContain('&lt;c&gt;');
  });
});
