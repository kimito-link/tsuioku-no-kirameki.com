/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { buildDevMonitorGiftRankingExtrasHtml } from './devMonitorGiftRankingExtrasHtml.js';

// characterization テスト: 抽出前の renderDevMonitorGiftRankingExtras の HTML 組み立てを固定。

const wrap = (html) => new DOMParser().parseFromString(`<dl>${html}</dl>`, 'text/html');

describe('buildDevMonitorGiftRankingExtrasHtml', () => {
  it('空 rows なら空文字（早期 return 相当）', () => {
    expect(buildDevMonitorGiftRankingExtrasHtml([])).toBe('');
    expect(buildDevMonitorGiftRankingExtrasHtml(null)).toBe('');
  });

  it('rows あり: ヘッダ行 + 各行 dt/dd', () => {
    const html = buildDevMonitorGiftRankingExtrasHtml([
      ['ギフト', '取得OK'],
      ['ランキング', '12件']
    ]);
    const doc = wrap(html);
    expect(html).toContain('取得状況サマリ');
    const rows = [...doc.querySelectorAll('.nl-dev-monitor__row')];
    // ヘッダ + 2 行 = 3
    expect(rows.length).toBe(3);
    const dts = [...doc.querySelectorAll('dt')].map((d) => d.textContent);
    expect(dts).toContain('ギフト');
    expect(dts).toContain('ランキング');
  });

  it('行は rows の順序で並ぶ', () => {
    const html = buildDevMonitorGiftRankingExtrasHtml([
      ['a', '1'],
      ['b', '2'],
      ['c', '3']
    ]);
    const doc = wrap(html);
    // 先頭はヘッダなので、データ dt は 2..4 番目
    const dds = [...doc.querySelectorAll('dd')].map((d) => d.textContent).filter((t) => t !== '');
    expect(dds).toEqual(['1', '2', '3']);
  });

  it('XSS: dt/dd はエスケープされる', () => {
    const doc = wrap(
      buildDevMonitorGiftRankingExtrasHtml([['<script>x</script>', '<img onerror=1>']])
    );
    expect(doc.querySelector('script')).toBeNull();
    expect(doc.querySelector('img')).toBeNull();
    const dts = [...doc.querySelectorAll('dt')].map((d) => d.textContent);
    expect(dts).toContain('<script>x</script>');
  });

  it('非文字の dt/dd も String 化されて出る（escapeHtml 互換）', () => {
    const html = buildDevMonitorGiftRankingExtrasHtml([[123, 0]]);
    // escapeHtml は String(s || '')。0 は '' になる（抽出前と同一挙動）。
    expect(html).toContain('<dt>123</dt>');
    expect(html).toContain('<dd></dd>');
  });
});
