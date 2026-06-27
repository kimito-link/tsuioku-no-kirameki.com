/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { buildGiftSubAppHistoryBlocksHtml } from './giftSubAppHistoryBlocksHtml.js';

// characterization テスト: 抽出前の renderGiftSubAppHistoryPanel のブロック組み立てを固定。

const wrap = (html) => new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');

describe('buildGiftSubAppHistoryBlocksHtml', () => {
  it('両方空なら空文字', () => {
    expect(buildGiftSubAppHistoryBlocksHtml({ history: [], totalCounts: [] })).toBe('');
    expect(buildGiftSubAppHistoryBlocksHtml(null)).toBe('');
  });

  it('totalCounts: カウント降順で並び、種類数を見出しに出す', () => {
    const html = buildGiftSubAppHistoryBlocksHtml({
      totalCounts: [
        { itemName: 'A', count: 2 },
        { itemName: 'B', count: 9 },
        { itemName: 'C', count: 5 }
      ]
    });
    const doc = wrap(html);
    const names = [...doc.querySelectorAll('.nl-gift-nick')].map((n) => n.textContent);
    expect(names).toEqual(['B', 'C', 'A']); // 9,5,2 降順
    expect(html).toContain('アイテム種類別の合計（3 種類）');
    const codes = [...doc.querySelectorAll('code.nl-gift-uid')].map((c) => c.textContent);
    expect(codes[0]).toBe('×9');
  });

  it('totalCounts は top50 まで', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ itemName: `x${i}`, count: i }));
    const doc = wrap(buildGiftSubAppHistoryBlocksHtml({ totalCounts: many }));
    expect(doc.querySelectorAll('li').length).toBe(50);
  });

  it('history: 最新順 top60・件数を見出しに出す', () => {
    const hist = Array.from({ length: 70 }, (_, i) => ({
      itemName: `g${i}`,
      senderName: `s${i}`,
      points: i,
      time: `t${i}`
    }));
    const html = buildGiftSubAppHistoryBlocksHtml({ history: hist });
    const doc = wrap(html);
    expect(doc.querySelectorAll('li').length).toBe(60);
    expect(html).toContain('個別ギフト履歴（70 件中、最新 60 件）');
  });

  it('history 行: sender/item/points/time が出る、time 空なら small なし', () => {
    const withTime = wrap(
      buildGiftSubAppHistoryBlocksHtml({
        history: [{ itemName: 'ギフト', senderName: 'りんく', points: 100, time: '12:00' }]
      })
    );
    expect(withTime.querySelector('.nl-gift-nick').textContent).toBe('りんく');
    expect(withTime.querySelector('small').textContent).toBe('12:00');

    const noTime = wrap(
      buildGiftSubAppHistoryBlocksHtml({
        history: [{ itemName: 'ギフト', senderName: 'りんく', points: 100, time: '' }]
      })
    );
    expect(noTime.querySelector('small')).toBeNull();
  });

  it('pointsRaw があれば優先、無ければ points 数値', () => {
    expect(
      buildGiftSubAppHistoryBlocksHtml({ history: [{ pointsRaw: '1,000', points: 1000 }] })
    ).toContain('1,000 pt');
    expect(
      buildGiftSubAppHistoryBlocksHtml({ history: [{ points: 500 }] })
    ).toContain('500 pt');
  });

  it('欠損フィールドは (unknown)/(noname) でフォールバック', () => {
    const html = buildGiftSubAppHistoryBlocksHtml({
      totalCounts: [{ count: 3 }],
      history: [{ points: 0 }]
    });
    expect(html).toContain('(unknown)');
    expect(html).toContain('(noname)');
  });

  it('XSS: itemName/senderName/time はエスケープされる', () => {
    const doc = wrap(
      buildGiftSubAppHistoryBlocksHtml({
        history: [
          { itemName: '<b>x</b>', senderName: '<script>1</script>', points: 1, time: '<i>t</i>' }
        ]
      })
    );
    expect(doc.querySelector('script')).toBeNull();
    expect(doc.querySelector('.nl-gift-nick').textContent).toBe('<script>1</script>');
  });

  it('両方ある場合: 集計ブロックが先、履歴ブロックが後', () => {
    const html = buildGiftSubAppHistoryBlocksHtml({
      totalCounts: [{ itemName: 'A', count: 1 }],
      history: [{ itemName: 'A', senderName: 's', points: 1 }]
    });
    expect(html.indexOf('アイテム種類別')).toBeLessThan(html.indexOf('個別ギフト履歴'));
  });
});
