/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { buildMediaKitHtml } from './mediaKitHtml.js';

const BASE_STATS = {
  broadcaster: {
    name: '君斗りんく',
    userId: '12345',
    iconUrl: 'https://example.test/external.png'
  },
  windows: [
    {
      days: 30,
      followers: 1200,
      followersGained: 25,
      avgConcurrent: 32.5,
      maxConcurrent: 80,
      visitors: { total: 4500, average: 1500 },
      comments: 900,
      chatRatePerMin: 5.25,
      uniqueSupporters: 120,
      giftPoints: 18000,
      giftCount: 44,
      broadcastsPerWeek: 1.4,
      liveCount: 6
    },
    {
      days: 60,
      followers: null,
      followersGained: null,
      avgConcurrent: null,
      maxConcurrent: null,
      visitors: null,
      comments: null,
      chatRatePerMin: null,
      uniqueSupporters: null,
      giftPoints: null,
      giftCount: null,
      broadcastsPerWeek: null,
      liveCount: 0
    },
    {
      days: 90,
      followers: 1000,
      followersGained: -10,
      avgConcurrent: 20,
      maxConcurrent: 50,
      visitors: { total: 8000, average: 1000 },
      comments: 1200,
      chatRatePerMin: 3,
      uniqueSupporters: 150,
      giftPoints: 20000,
      giftCount: 50,
      broadcastsPerWeek: 0.7,
      liveCount: 8
    }
  ]
};

function parse(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('buildMediaKitHtml', () => {
  it('配信者ヘッダ・信頼バッジ・指標×期間テーブル・脚注を1ファイルに出す', () => {
    const html = buildMediaKitHtml(BASE_STATS, {
      generatedAtMs: Date.UTC(2026, 5, 10, 3, 0, 0),
      sourceLiveLimit: 60
    });
    const doc = parse(html);
    const headers = [...doc.querySelectorAll('thead th')].map((node) => node.textContent);
    const rowLabels = [...doc.querySelectorAll('tbody th')].map((node) => node.textContent);

    expect(doc.title).toContain('君斗りんく');
    expect(doc.body.textContent).toContain('追憶のきらめき 実測統計');
    expect(headers).toEqual(['指標', '過去30日', '過去60日', '過去90日']);
    expect(rowLabels).toContain('フォロワー数');
    expect(rowLabels).toContain('平均同時視聴者数');
    expect(rowLabels).toContain('ギフト（累計）');
    expect(doc.body.textContent).toContain('累計 4,500 / 配信平均 1,500');
    expect(doc.body.textContent).toContain('18,000 pt / 44 件');
    expect(doc.body.textContent).toContain('公開されているコメント・ギフト情報');
    expect(doc.body.textContent).toContain('最大60枠');
  });

  it('欠損値はすべてハイフン表示にし、0と区別する', () => {
    const doc = parse(buildMediaKitHtml(BASE_STATS));
    const rows = [...doc.querySelectorAll('tbody tr')];
    const followersRow = rows.find(
      (row) => row.querySelector('th')?.textContent === 'フォロワー数'
    );
    const liveCountRow = rows.find(
      (row) => row.querySelector('th')?.textContent === '集計配信数'
    );

    expect(followersRow?.querySelectorAll('td')[1].textContent).toBe('-');
    expect(liveCountRow?.querySelectorAll('td')[1].textContent).toBe('0');
  });

  it('全動的テキストをescapeし、scriptや属性を注入させない', () => {
    const html = buildMediaKitHtml({
      ...BASE_STATS,
      broadcaster: {
        name: '</h1><script>window.pwned=1</script>',
        userId: '" onmouseover="alert(1)',
        iconUrl: 'javascript:alert(1)'
      }
    });
    const doc = parse(html);

    expect(doc.querySelector('script')).toBeNull();
    expect(doc.querySelector('[onmouseover]')).toBeNull();
    expect(doc.body.textContent).toContain('</h1><script>window.pwned=1</script>');
    expect(doc.body.textContent).toContain('" onmouseover="alert(1)');
  });

  it('外部リソースを参照せず、安全なraster data URLだけ画像に使う', () => {
    const externalHtml = buildMediaKitHtml(BASE_STATS);
    const externalDoc = parse(externalHtml);
    expect(externalDoc.querySelector('img')).toBeNull();
    expect(externalHtml).not.toContain('https://example.test/external.png');

    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    const embeddedDoc = parse(
      buildMediaKitHtml(BASE_STATS, { broadcasterIconDataUrl: dataUrl })
    );
    expect(embeddedDoc.querySelector('img')?.getAttribute('src')).toBe(dataUrl);
  });

  it('chrome.*へ依存するコードを生成物にもモジュールにも含めない', () => {
    const html = buildMediaKitHtml(BASE_STATS);
    expect(html).not.toContain('chrome.');
    expect(html).not.toContain('<script');
    expect(html).toContain("default-src 'none'");
  });
});

describe('応援者セクション(PR4)', () => {
  const baseStats = { windows: [], broadcaster: { name: 'テスト配信者', userId: '1', iconUrl: '' } };
  it('supporters があれば表彰セクションを出す(名前/匿名NNN/サムネURL)', () => {
    const html = buildMediaKitHtml({
      ...baseStats,
      supporters: {
        giftTop: [{ userId: '4046119', name: 'たろう', points: 700, count: 2 }],
        commentTop: [{ userId: 'a:XYZ', name: '', count: 10, liveCount: 3 }],
        regulars: { sampledLives: 12, supporters: 40, regulars: 8, ratio: 0.2 }
      }
    });
    expect(html).toContain('この配信を支えた応援者たち');
    expect(html).toContain('たろう');
    expect(html).toContain('usericon/s/404/4046119.jpg');
    expect(html).toMatch(/匿名\d{1,3}/);
    expect(html).toContain('常連さん');
  });
  it('supporters が無ければセクションを出さない(後方互換)', () => {
    const html = buildMediaKitHtml(baseStats);
    expect(html).not.toContain('この配信を支えた応援者たち');
  });
});
