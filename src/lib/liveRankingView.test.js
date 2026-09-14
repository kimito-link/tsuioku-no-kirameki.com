import { describe, it, expect } from 'vitest';
import { retentionRate } from './concurrentEstimate.js';
import {
  watchUrlOf, jstClock, elapsedText, freshness, estimateConcurrentForLive, sortByEstimatedConcurrent,
  cacheBust, supporterRows, identifiedSupporters, isBlankIcon, uidFromUserPageUrl,
  createRowChangeTracker, rowKey, STALE_MIN
} from './liveRankingView.js';

describe('liveRankingView', () => {
  it('watchUrlOf: lv の形だけ通し、外から来た文字列は組み立てに使わない', () => {
    expect(watchUrlOf('lv351386196')).toBe('https://live.nicovideo.jp/watch/lv351386196');
    expect(watchUrlOf('LV351386196 ')).toBe('https://live.nicovideo.jp/watch/lv351386196');
    expect(watchUrlOf('lv1')).toBe('');
    expect(watchUrlOf('javascript:1')).toBe('');
    expect(watchUrlOf(null)).toBe('');
  });

  it('jstClock: JST 固定で HH:MM', () => {
    // 2026-09-14T04:03:27Z = 13:03 JST
    expect(jstClock(1789358607)).toBe('13:03');
    expect(jstClock(0)).toBe('');
    expect(jstClock('x')).toBe('');
  });

  it('elapsedText: 時間・分の文言。未来や無しは空', () => {
    const now = 1789365578348;
    expect(elapsedText(1789355007, now)).toBe('2時間56分');
    expect(elapsedText(now / 1000 - 51 * 60, now)).toBe('51分');
    expect(elapsedText(now / 1000 + 60, now)).toBe('');
    expect(elapsedText(0, now)).toBe('');
  });

  it('freshness: しきい値(30分)以上で stale、負の差(時計ずれ)は何も言わない', () => {
    const now = 1_000_000_000_000;
    expect(freshness(now - 10_000, now)).toEqual({ text: 'たった今 更新', stale: false });
    expect(freshness(now - 5 * 60_000, now)).toEqual({ text: '5分前 更新', stale: false });
    expect(freshness(now - STALE_MIN * 60_000, now).stale).toBe(true);
    expect(freshness(now - 120 * 60_000, now).text).toContain('120分前');
    expect(freshness(now + 60_000, now)).toEqual({ text: '', stale: false });
    expect(freshness(0, now)).toEqual({ text: '', stale: false });
  });

  it('★推定同時視聴は concurrentEstimate.js の retentionRate と同じ式(コピーではなく呼び出し)', () => {
    const now = 1789365578348;
    for (const ageMin of [0, 1, 5, 30, 60, 124, 240, 600]) {
      const live = { watchCount: 10000, beginTime: now / 1000 - ageMin * 60 };
      expect(estimateConcurrentForLive(live, now)).toBe(Math.round(10000 * retentionRate(ageMin)));
    }
    // beginTime 無し → fallback 率(retentionRate(NaN))
    expect(estimateConcurrentForLive({ watchCount: 1000 }, now)).toBe(Math.round(1000 * retentionRate(NaN)));
    expect(estimateConcurrentForLive({ watchCount: 0, beginTime: 1 }, now)).toBe(0);
    expect(estimateConcurrentForLive(null, now)).toBe(0);
  });

  it('sortByEstimatedConcurrent: 長時間配信が累計来場だけで上に居座らない・元配列を壊さない', () => {
    const now = 1789365578348;
    const long = { id: 'long', watchCount: 6710, beginTime: now / 1000 - 240 * 60 };
    const short = { id: 'short', watchCount: 3314, beginTime: now / 1000 - 40 * 60 };
    const input = [long, short];
    const out = sortByEstimatedConcurrent(input, now);
    expect(out.map((l) => l.id)).toEqual(['short', 'long']);
    expect(input.map((l) => l.id)).toEqual(['long', 'short']);
  });

  it('cacheBust: ? の有無で結合子を変え、http 以外は空', () => {
    expect(cacheBust('https://a/b.jpg', 5)).toBe('https://a/b.jpg?t=5');
    expect(cacheBust('https://a/b.jpg?x=1', 5)).toBe('https://a/b.jpg?x=1&t=5');
    expect(cacheBust('javascript:1', 5)).toBe('');
    expect(cacheBust('', 5)).toBe('');
  });

  it('supporterRows: 既存の正規化関数を通す。広告は UID から確定パターンでアイコンを導出、未設定は空', () => {
    const live = {
      gift: { rankers: [
        { rank: 1, supporterId: 37091354, supporterName: 'jfes205', supporterThumbnailUrl: 'https://img/x.jpg', contribution: 50000, userPageUrl: 'https://www.nicovideo.jp/user/37091354' },
        { rank: 2, supporterName: '名無し', contribution: 100 }
      ] },
      ad: { ranking: [
        { rank: 1, userId: 19190613, advertiserName: 'かかし', totalContribution: 52794, userPageUrl: 'https://www.nicovideo.jp/user/19190613', thumbnailUrl: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1919/19190613.jpg' },
        { rank: 2, userId: 5, advertiserName: 'のっぺら', totalContribution: 10, userPageUrl: 'https://www.nicovideo.jp/user/5', thumbnailUrl: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg' }
      ] }
    };
    const rows = supporterRows(live);
    expect(rows.gift[0]).toEqual({ rank: 1, name: 'jfes205', point: 50000, avatar: 'https://img/x.jpg', url: 'https://www.nicovideo.jp/user/37091354', uid: '37091354' });
    expect(rows.gift[1].name).toBe('名無し');
    expect(rows.gift[1].url).toBe('');
    expect(rows.ad[0].avatar).toBe('https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1919/19190613.jpg');
    expect(rows.ad[1].avatar).toBe('');   // ★hasNoIcon: 404 になる URL を組まない
    expect(supporterRows(null)).toEqual({ gift: [], ad: [] });
    expect(supporterRows({ gift: null, ad: { ranking: 'x' } })).toEqual({ gift: [], ad: [] });
  });

  it('isBlankIcon / uidFromUserPageUrl', () => {
    expect(isBlankIcon('https://x/usericon/defaults/blank.jpg')).toBe(true);
    expect(isBlankIcon('https://x/usericon/defaults/blank.jpg?1')).toBe(true);
    expect(isBlankIcon('https://x/usericon/s/1919/19190613.jpg')).toBe(false);
    expect(isBlankIcon(null)).toBe(false);
    expect(uidFromUserPageUrl('https://www.nicovideo.jp/user/19190613')).toBe('19190613');
    expect(uidFromUserPageUrl('http://www.nicovideo.jp/user/142919600?ref=x')).toBe('142919600');
    expect(uidFromUserPageUrl('https://www.nicovideo.jp/user/abc')).toBe('');
    expect(uidFromUserPageUrl('javascript:1')).toBe('');
  });

  it('identifiedSupporters: 数値ID と個人サムネの両方が揃った人だけ。両方に居る人は1人にまとめ、合計の降順', () => {
    const live = {
      gift: { rankers: [
        { rank: 1, supporterId: 111, supporterName: 'みち', supporterThumbnailUrl: 'https://img/michi.jpg', contribution: 6000, userPageUrl: 'https://www.nicovideo.jp/user/111' },
        { rank: 2, supporterId: 222, supporterName: 'せしる', supporterThumbnailUrl: 'https://x/usericon/defaults/blank.jpg', contribution: 3000, userPageUrl: 'https://www.nicovideo.jp/user/222' },
        { rank: 3, supporterName: '名無し', contribution: 18000 }
      ] },
      ad: { ranking: [
        { rank: 1, userId: 333, advertiserName: 'チェリビダッケ', totalContribution: 105897, userPageUrl: 'https://www.nicovideo.jp/user/333', thumbnailUrl: 'https://x/usericon/s/0/333.jpg' },
        { rank: 2, userId: 111, advertiserName: 'みち', totalContribution: 500, userPageUrl: 'https://www.nicovideo.jp/user/111', thumbnailUrl: 'https://x/usericon/s/0/111.jpg' },
        { rank: 3, userId: 444, advertiserName: 'アイコン無し', totalContribution: 99999, userPageUrl: 'https://www.nicovideo.jp/user/444', thumbnailUrl: 'https://x/usericon/defaults/blank.jpg' },
        { rank: 4, advertiserName: 'ゲスト', totalContribution: 5000 }
      ] }
    };
    const out = identifiedSupporters(live);
    expect(out.map((s) => s.uid)).toEqual(['333', '111']);           // 222(blank) / 444(hasNoIcon) / 匿名 は載らない
    expect(out[1]).toMatchObject({ uid: '111', name: 'みち', giftPt: 6000, adPt: 500, total: 6500, url: 'https://www.nicovideo.jp/user/111' });
    expect(out[1].avatar).toBe('https://img/michi.jpg');             // ギフト側の実サムネを優先
    expect(out[0].avatar).toBe('https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/0/333.jpg');
    expect(identifiedSupporters(null)).toEqual([]);
  });

  it('createRowChangeTracker: 初回は光らせない・増えた行だけ is-bumped・新規は is-new・消えた行の記録は捨てる', () => {
    const t = createRowChangeTracker();
    const k = (n) => rowKey('lv1', 'gift', { name: n });
    t.begin();
    expect(t.classFor(k('a'), 100)).toBe('');
    expect(t.classFor(k('b'), 50)).toBe('');
    t.end();
    t.begin();
    expect(t.classFor(k('a'), 150)).toBe('is-bumped');   // 増えた
    expect(t.classFor(k('c'), 10)).toBe('is-new');        // 新しく入った
    t.end();                                              // b は今回出なかった → 記録を捨てる
    t.begin();
    expect(t.classFor(k('a'), 150)).toBe('');             // 変わらない
    expect(t.classFor(k('b'), 50)).toBe('is-new');        // ★捨てられたので再登場は新規扱い
    t.end();
  });

  it('★毒: 同じ順位のデータを2回渡しても is-bumped が出ない(嘘の演出をしない)', () => {
    const t = createRowChangeTracker();
    const paint = () => { t.begin(); const c = t.classFor(rowKey('lv', 'ad', { name: 'x' }), 7); t.end(); return c; };
    paint(); paint();
    expect(paint()).toBe('');
  });
});
