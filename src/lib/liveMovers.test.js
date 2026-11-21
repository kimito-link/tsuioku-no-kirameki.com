import { describe, expect, it } from 'vitest';
import { buildMoversHtml, pickMovers, recentCommentPulse, MOVERS_MAX } from './liveMovers.js';

const row = (uid, name, point) => ({ rank: 1, uid, name, point, avatar: '', url: `https://www.nicovideo.jp/user/${uid}` });
const pulse = (entries) => ({ byKey: new Map(entries.map(([uid, d]) => [`u:${uid}`, { delta: d, tier: 'small' }])), sum: 0, spanMs: 61_000, top: null, tier: 'small' });

describe('pickMovers', () => {
  it('ギフトで増えた人を先に(増分の大きい順)、次にコメント。同じ人はギフトだけ', () => {
    const m = pickMovers({
      giftRows: [row('1', 'A', 100), row('2', 'B', 50)],
      giftPulse: pulse([['1', 10], ['2', 300]]),
      commentRows: [row('2', 'B', 5), row('3', 'C', 9)],
      commentPulse: pulse([['2', 1], ['3', 4]])
    });
    expect(m.map((x) => `${x.kind}:${x.uid}:${x.delta}`)).toEqual(['gift:2:300', 'gift:1:10', 'comment:3:4']);
  });
  it('増分の無い行・前回に居なかった行(byKey に無い)は出さない', () => {
    expect(pickMovers({ giftRows: [row('1', 'A', 1)], giftPulse: pulse([]), commentRows: [], commentPulse: null })).toEqual([]);
  });
});

describe('buildMoversHtml', () => {
  it('初めての取得は「次の取得と比べる」と出す(増えたふりをしない)', () => {
    const h = buildMoversHtml({ movers: [], firstSample: true, giftAt: 1795258000000 });
    expect(h).toContain('movers--quiet');
    expect(h).toContain('次の取得');
  });
  it('増えた人がいなければ正直に「いない」と取得時刻つきで出す', () => {
    const h = buildMoversHtml({ movers: [], firstSample: false, giftAt: 1795258000000 });
    expect(h).toContain('増えた人はいない');
    expect(h).toMatch(/\d{2}:\d{2}:\d{2} 取得/);
  });
  it('名前はエスケープし、増分と取得時刻・間隔を添える。最大人数で切り「ほか N 人」', () => {
    const movers = Array.from({ length: MOVERS_MAX + 2 }, (_, i) => ({ kind: 'gift', name: `<b>${i}</b>`, avatar: '', url: '', uid: String(i), delta: 100 - i, tier: 'small' }));
    const h = buildMoversHtml({ movers, firstSample: false, giftAt: 1795258000000, giftSpanMs: 61_000 });
    expect(h).not.toContain('<b>0</b>');
    expect(h).toContain('&lt;b&gt;0&lt;/b&gt;');
    expect(h).toContain('+100pt');
    expect(h).toContain('直近 61 秒の増分');
    expect(h).toContain(`ほか 2人`);
    expect((h.match(/class="mover /g) || []).length).toBe(MOVERS_MAX);
  });
  it('コメントだけ動いたときは件数と集計時刻', () => {
    const h = buildMoversHtml({ movers: [{ kind: 'comment', name: 'C', avatar: '', url: '', uid: '3', delta: 4, tier: 'small' }], firstSample: false, commentAt: 1795258000000, commentSpanMs: 60_000 });
    expect(h).toContain('💬+4件');
    expect(h).toMatch(/\d{2}:\d{2} 集計/);
  });
});

describe('recentCommentPulse (v0.1.2174)', () => {
  const tier = (n) => (n >= 5 ? 'large' : 'small');
  const now = 1795260000000;
  it('集計側の「前回より新しい側だけ」の件数を増分にし、間隔は recentAt - recentSince', () => {
    const r = recentCommentPulse({ partial: true, recent: [{ uid: '123', name: 'A', count: 3 }, { uid: 'a:x', name: '', count: 0 }], recentAt: now - 10_000, recentSince: now - 70_000 }, now, tier);
    expect(r.uids).toEqual(['123']);
    expect(r.pulse.byKey.get('u:123')).toEqual({ delta: 3, tier: 'small' });
    expect(r.pulse.spanMs).toBe(60_000);
  });
  it('recent が無い・古すぎる(5 分超)なら null(古い集計を「いま」と言わない)', () => {
    expect(recentCommentPulse({ rankers: [] }, now, tier)).toBeNull();
    expect(recentCommentPulse({ recent: [{ uid: '1', count: 1 }], recentAt: now - 6 * 60_000 }, now, tier)).toBeNull();
  });
});
