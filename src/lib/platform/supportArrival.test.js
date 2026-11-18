import { describe, expect, it } from 'vitest';
import { sectionSupportArrivalHtml } from './marketingPlatformChapters.js';
import { analyzeSupportArrivals, SUPPORT_ARRIVAL_ROW_CAP } from './supportArrival.js';

const T = 1_700_000_000_000;

/** @param {number} at @param {string} text @param {Record<string, unknown>} [extra] */
function speech(at, text, extra = {}) {
  return { capturedAt: at, text, ytKind: 'text', nickname: 'みる人', ...extra };
}

describe('応援が届いた瞬間', () => {
  it('記録が0件のサービスは章を出さない', () => {
    expect(analyzeSupportArrivals({ platformId: 'abema', comments: [speech(T, 'こんにちは')] })).toBe(null);
    expect(sectionSupportArrivalHtml({ platformId: 'abema', comments: [speech(T, 'こんにちは')] })).toBe('');
    expect(analyzeSupportArrivals({ platformId: 'youtube', comments: [speech(T, 'hello')] })).toBe(null);
    expect(analyzeSupportArrivals({ platformId: 'niconico', comments: [speech(T, 'こんにちは')], giftEvents: [] })).toBe(null);
  });

  it('時刻順に並べ、入力の配列は変えない', () => {
    const comments = [
      { capturedAt: T + 120_000, ytKind: 'superchat', ytAmount: 200, ytCurrency: 'JPY', nickname: '後' },
      speech(T + 90_000, 'あいだ'),
      { capturedAt: T, ytKind: 'superchat', ytAmount: 100, ytCurrency: 'JPY', nickname: '先' },
    ];
    const before = comments.map((c) => c.capturedAt);
    const out = analyzeSupportArrivals({ platformId: 'youtube', comments, startedAtMs: T });
    expect(comments.map((c) => c.capturedAt)).toEqual(before);
    expect(out?.rows.map((r) => r.who)).toEqual(['先', '後']);
    expect(out?.rows[0].offsetMs).toBe(0);
    expect(out?.rows[1].offsetMs).toBe(120_000);
    expect(out?.rows[1].commentCount).toBe(1);
    expect(out?.rows[1].excerpts).toEqual(['あいだ']);
  });

  it('直前60秒の端を含む・イベントの時刻のコメントは入れない', () => {
    const at = T + 180_000;
    const comments = [
      speech(at - 60_001, '遠'),
      speech(at - 60_000, 'ちょうど'),
      speech(at - 1, '直前'),
      speech(at, '同時'),
      speech(at + 1, '後'),
      { capturedAt: at, ytKind: 'superchat', ytAmount: 500, ytCurrency: 'JPY', nickname: '人' },
    ];
    const row = analyzeSupportArrivals({ platformId: 'youtube', comments })?.rows[0];
    expect(row?.commentCount).toBe(2);
    expect(row?.excerpts).toEqual(['ちょうど', '直前']);
  });

  it('抜粋は新しい3件まで、長い文は切って、HTMLは逃がす', () => {
    const at = T + 30_000;
    const comments = [
      speech(at - 50_000, 'いち'),
      speech(at - 40_000, 'に'),
      speech(at - 30_000, '<img src=x>'),
      speech(at - 20_000, 'あ'.repeat(30)),
      { capturedAt: at, ytKind: 'superchat', ytAmount: 1, ytCurrency: 'JPY', nickname: '<b>名前</b>' },
    ];
    const row = analyzeSupportArrivals({ platformId: 'youtube', comments })?.rows[0];
    expect(row?.commentCount).toBe(4);
    expect(row?.excerpts).toHaveLength(3);
    expect(row?.excerpts[0]).toBe('に');
    expect(row?.excerpts[2].endsWith('…')).toBe(true);
    expect(row?.excerpts[2].length).toBeLessThanOrEqual(25);
    const html = sectionSupportArrivalHtml({ platformId: 'youtube', comments });
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).toContain('&lt;b&gt;名前&lt;/b&gt;');
    expect(html).not.toContain('<img');
    expect(html).toContain('推定:');
    expect(html.indexOf('mkt-arrival-summary')).toBeLessThan(html.indexOf('推定（同じ時間に起きたこと'));
  });

  it('同じ1分のレイドはきっかけに入れ、自分自身は数えない', () => {
    const at = T + 90_000;
    const comments = [
      { capturedAt: at - 30_000, ytKind: 'tw_raid', ytAmount: 12, text: 'レイド', nickname: '先のレイド' },
      speech(at - 10_000, 'わくわく'),
      { capturedAt: at, ytKind: 'superchat', ytCurrency: 'BITS', ytAmount: 100, nickname: 'ビッツ' },
      { capturedAt: at, ytKind: 'tw_raid', ytAmount: 40, nickname: '同時レイド' },
    ];
    const out = analyzeSupportArrivals({ platformId: 'twitch', comments });
    const bits = out?.rows.find((r) => r.kindLabel === 'Bits');
    const raid = out?.rows.find((r) => r.who === '同時レイド');
    expect(bits?.amountText).toBe('100 Bits');
    expect(bits?.commentCount).toBe(1);
    expect(bits?.contextCount).toBe(2);
    expect(bits?.contexts.join(' ')).toContain('レイド');
    expect(raid?.contextCount).toBe(1);
    expect(raid?.contexts.join(' ')).not.toContain('40');
    expect(raid?.amountText).toBe('40人');
    expect(out?.counts.map((c) => c.label)).toEqual(['レイド', 'Bits']);
  });

  it('サービスごとの種類だけを、記録にある額だけで出す', () => {
    const at = T + 10_000;
    expect(analyzeSupportArrivals({
      platformId: 'youtube',
      comments: [
        { capturedAt: at, ytKind: 'superchat', ytAmount: 5, ytCurrency: 'USD', nickname: 'A' },
        { capturedAt: at + 1, ytKind: 'membership', nickname: 'B' },
        { capturedAt: at + 2, ytKind: 'membership_gift', ytGiftCount: 3, nickname: 'C' },
        { capturedAt: at + 3, ytKind: 'sticker', ytAmount: 9, ytCurrency: 'JPY', nickname: 'D' },
        { capturedAt: at + 4, ytKind: 'membership_gift', ytGiftCount: 0, nickname: 'E' },
      ],
    })?.rows.map((r) => `${r.kindLabel}:${r.amountText}`)).toEqual([
      'スーパーチャット:USD 5',
      'メンバー加入:',
      'メンバーギフト:3件',
      'メンバーギフト:',
    ]);
    expect(analyzeSupportArrivals({
      platformId: 'twitch',
      comments: [
        { capturedAt: at, ytKind: 'membership', subEvent: 'sub', nickname: 'S' },
        { capturedAt: at + 1, ytKind: 'membership', subEvent: 'resub', nickname: 'R' },
        { capturedAt: at + 2, ytKind: 'membership', nickname: '不明' },
        { capturedAt: at + 3, ytKind: 'membership_gift', ytGiftCount: 2, nickname: 'G' },
      ],
    })?.rows.map((r) => r.kindLabel)).toEqual(['サブスク', '再サブ', 'ギフトサブ']);
    expect(analyzeSupportArrivals({
      platformId: 'kick',
      comments: [
        { capturedAt: at, ytKind: 'superchat', ytCurrency: 'KICKS', ytAmount: 50, nickname: 'K' },
        { capturedAt: at + 1, ytKind: 'membership', subEvent: 'resub', nickname: '再' },
        { capturedAt: at + 2, ytKind: 'membership_gift', ytGiftCount: 1, nickname: 'G' },
      ],
    })?.rows.map((r) => r.kindLabel)).toEqual(['Kicks', 'サブスク', 'ギフトサブ']);
    expect(analyzeSupportArrivals({
      platformId: 'showroom',
      comments: [{ capturedAt: at, ytKind: 'superchat', ytCurrency: 'SRPT', ytAmount: 10, ytGiftName: '花', nickname: 'S' }],
    })?.rows[0]).toMatchObject({ kindLabel: 'ギフト', amountText: '10pt', itemName: '花' });
    expect(analyzeSupportArrivals({
      platformId: 'mixch',
      comments: [
        { capturedAt: at, ytKind: 'superchat', ytCurrency: 'MXCOIN', ytAmount: 7, nickname: 'M' },
        { capturedAt: at + 1, ytKind: 'mx_fan', nickname: 'ファン' },
      ],
    })?.rows.map((r) => r.kindLabel)).toEqual(['ギフト', 'ファン登録']);
    expect(analyzeSupportArrivals({
      platformId: 'whowatch',
      comments: [{ capturedAt: at, ytKind: 'superchat', ytCurrency: 'WWITEM', ytAmount: 2, nickname: 'W' }],
    })?.rows[0].amountText).toBe('2個');
    expect(analyzeSupportArrivals({
      platformId: 'tiktok',
      comments: [
        { capturedAt: at, ytKind: 'superchat', ytCurrency: 'TTCOIN', ytAmount: 9, nickname: 'T' },
        { capturedAt: at + 1, ytKind: 'follow', text: 'フォローしました', nickname: 'F', isSystem: true },
      ],
    })?.rows.map((r) => `${r.kindLabel}:${r.amountText}`)).toEqual(['ギフト:9 コイン', 'フォロー:']);
    expect(analyzeSupportArrivals({
      platformId: 'twitcasting',
      comments: [{ capturedAt: at, ytKind: 'superchat', ytCurrency: 'TCSCORE', ytAmount: 30, nickname: 'C' }],
    })?.rows[0].amountText).toBe('30pt');
  });

  it('ニコ生のギフトはギフト記録だけを使い、他のサービスのギフト記録は混ぜない', () => {
    const giftEvents = [{ capturedAt: T + 5_000, nickname: '投', itemName: '花束', point: 300, userId: '1' }];
    const nico = analyzeSupportArrivals({
      platformId: 'niconico',
      comments: [
        speech(T, '放送者のサポーターが1人来場しました'),
        speech(T + 1_000, 'わくわく'),
      ],
      giftEvents,
      startedAtMs: T,
    });
    expect(nico?.rows).toHaveLength(1);
    expect(nico?.rows[0]).toMatchObject({ kindLabel: 'ギフト', who: '投', amountText: '300pt', itemName: '花束', offsetMs: 5_000 });
    expect(nico?.rows[0].commentCount).toBe(1);
    expect(nico?.rows[0].contextCount).toBe(1);
    expect(analyzeSupportArrivals({ platformId: 'youtube', comments: [speech(T, 'hi')], giftEvents })).toBe(null);
  });

  it('フォローはコメントの抜粋にせず、あとのギフトのきっかけには出す', () => {
    const at = T + 40_000;
    const out = analyzeSupportArrivals({
      platformId: 'tiktok',
      comments: [
        { capturedAt: at - 20_000, ytKind: 'follow', text: 'フォローしました', nickname: '先' },
        speech(at - 10_000, 'きた'),
        { capturedAt: at, ytKind: 'superchat', ytCurrency: 'TTCOIN', ytAmount: 1, nickname: 'ギフト' },
      ],
    });
    const gift = out?.rows[1];
    expect(gift?.excerpts).toEqual(['きた']);
    expect(gift?.commentCount).toBe(1);
    expect(gift?.contexts).toEqual(['フォローしました']);
  });

  it('5分で多かった時間は全部の件数で、画面は新しい50件だけ', () => {
    const comments = [];
    for (let i = 0; i < 55; i += 1) {
      comments.push({
        capturedAt: T + i * 60_000,
        ytKind: 'superchat',
        ytAmount: 1,
        ytCurrency: 'JPY',
        nickname: `n${i}`,
      });
    }
    comments.push({ capturedAt: T + 60_000, ytKind: 'membership', nickname: '同じ5分' });
    const out = analyzeSupportArrivals({ platformId: 'youtube', comments, cap: SUPPORT_ARRIVAL_ROW_CAP });
    expect(out?.total).toBe(56);
    expect(out?.rows).toHaveLength(50);
    expect(out?.rows[0].who).toBe('n5');
    expect(out?.rows[49].who).toBe('n54');
    expect(out?.windows[0].count).toBeGreaterThan(1);
    const html = sectionSupportArrivalHtml({ platformId: 'youtube', comments });
    expect(html).toContain('記録 56 件');
    expect(html).toContain('スーパーチャット');
    expect(html).not.toContain('Bits');
  });

  it('共有用は名前を伏せ、本文は出さない', () => {
    const html = sectionSupportArrivalHtml({
      platformId: 'youtube',
      maskShare: true,
      comments: [
        speech(T, '秘密のコメント'),
        { capturedAt: T + 10_000, ytKind: 'superchat', ytAmount: 100, ytCurrency: 'JPY', nickname: '本名さん' },
      ],
    });
    expect(html).not.toContain('秘密のコメント');
    expect(html).not.toContain('本名さん');
    expect(html).toContain('共有用に本文は出していません');
    expect(html).toContain('1件');
  });

  it('件数が多いコメントの窓も、イベントの数に比例して終わる', () => {
    const at = T + 120_000;
    const comments = [];
    for (let i = 0; i < 4000; i += 1) comments.push(speech(T + i * 50, `c${i}`));
    for (let i = 0; i < 80; i += 1) {
      comments.push({ capturedAt: at + i * 1000, ytKind: 'superchat', ytAmount: 1, ytCurrency: 'JPY', nickname: `g${i}` });
    }
    const started = Date.now();
    const out = analyzeSupportArrivals({ platformId: 'youtube', comments });
    expect(Date.now() - started).toBeLessThan(1500);
    expect(out?.total).toBe(80);
    expect(out?.rows[0].commentCount).toBeGreaterThan(0);
    expect(out?.rows[0].excerpts).toHaveLength(3);
  });
});
