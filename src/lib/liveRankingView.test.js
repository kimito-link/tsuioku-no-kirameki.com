import { describe, it, expect } from 'vitest';
import { retentionRate } from './concurrentEstimate.js';
import { anonymousDisplayLabel } from './nicoUserPage.js';
import {
  watchUrlOf, jstClock, elapsedText, freshness, estimateConcurrentForLive, sortByEstimatedConcurrent,
  cacheBust, supporterRows, identifiedSupporters, identifiedSupportersByName, commentRows, isBlankIcon, uidFromUserPageUrl,
  createRowChangeTracker, rowKey, STALE_MIN,
  pinLiveFirst, liveShareText, liveOgTitle, SHARE_NAME_MAX, SHARE_TITLE_MAX, SHARE_TEXT_MAX
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

  // ── ?lv= の先頭固定と X シェア本文(v0.1.1510) ──────────────────────────────
  // ★lv は LIVE_ID_RE(/^lv\d{6,15}$/i)に合格する 6 桁以上で書く(lv3 は恒等パスに落ちて検証にならない)。
  const a = { liveId: 'lv100001' };
  const b = { liveId: 'lv100002' };
  const c = { liveId: 'lv100003' };

  it('pinLiveFirst: 該当を先頭へ・他の順序は保つ', () => {
    expect(pinLiveFirst([a, b, c], 'lv100003')).toEqual({ lives: [c, a, b], found: true });
  });

  it('pinLiveFirst: 既に先頭ならそのまま', () => {
    expect(pinLiveFirst([a, b], 'lv100001')).toEqual({ lives: [a, b], found: true });
  });

  it('pinLiveFirst: 大文字・前後空白を許す', () => {
    expect(pinLiveFirst([a, b, c], ' LV100003 ')).toEqual({ lives: [c, a, b], found: true });
  });

  it('pinLiveFirst: 不在なら found=false・並び不変', () => {
    expect(pinLiveFirst([a, b, c], 'lv999999999')).toEqual({ lives: [a, b, c], found: false });
  });

  it('pinLiveFirst: 不正な lv は恒等(エラーにしない)', () => {
    for (const bad of ['', null, undefined, 'lv1', 'javascript:', 'lv12345']) {
      expect(pinLiveFirst([a, b, c], bad)).toEqual({ lives: [a, b, c], found: false });
    }
  });

  it('pinLiveFirst: 元配列を壊さない', () => {
    const input = [a, b, c];
    const before = JSON.stringify(input);
    const out = pinLiveFirst(input, 'lv100003');
    expect(JSON.stringify(input)).toBe(before);
    expect(out.lives).not.toBe(input);
  });

  it('pinLiveFirst: 非配列は空', () => {
    expect(pinLiveFirst(null, 'lv100003')).toEqual({ lives: [], found: false });
  });

  it('pinLiveFirst: 状態を持たない(2 回目に対象が消えれば false)', () => {
    expect(pinLiveFirst([a, b, c], 'lv100003').found).toBe(true);
    expect(pinLiveFirst([a, b], 'lv100003')).toEqual({ lives: [a, b], found: false });
  });

  it('liveShareText: 通常(配信者名＋番組名)', () => {
    expect(liveShareText({ streamer: { name: 'りんく' }, title: '雑談' })).toBe('りんくの配信「雑談」を、いま支えている人');
  });

  it('liveShareText: name 空', () => {
    expect(liveShareText({ streamer: { name: '' }, title: '雑談' })).toBe('この配信「雑談」を、いま支えている人');
  });

  it('liveShareText: title 空', () => {
    expect(liveShareText({ streamer: { name: 'りんく' }, title: '' })).toBe('りんくの配信を、いま支えている人');
  });

  it('liveShareText: 両方空・null', () => {
    expect(liveShareText({})).toBe('この配信を、いま支えている人');
    expect(liveShareText(null)).toBe('この配信を、いま支えている人');
  });

  it('liveShareText: name が上限超なら 17 字+…', () => {
    const name = 'あ'.repeat(30);
    const out = liveShareText({ streamer: { name }, title: '雑談' });
    expect(out).toBe(`${'あ'.repeat(SHARE_NAME_MAX - 1)}…の配信「雑談」を、いま支えている人`);
  });

  it('liveShareText: title が上限超なら 23 字+…', () => {
    const title = 'い'.repeat(40);
    const out = liveShareText({ streamer: { name: 'りんく' }, title });
    expect(out).toBe(`りんくの配信「${'い'.repeat(SHARE_TITLE_MAX - 1)}…」を、いま支えている人`);
  });

  it('liveShareText: 4 分岐の最大長を固定(構造的に 60 字に収まる)', () => {
    const name = 'あ'.repeat(80);
    const title = 'い'.repeat(200);
    expect(Array.from(liveShareText({ streamer: { name }, title })).length).toBe(57);
    expect(Array.from(liveShareText({ streamer: { name: '' }, title })).length).toBe(40);
    expect(Array.from(liveShareText({ streamer: { name }, title: '' })).length).toBe(31);
    expect(Array.from(liveShareText({})).length).toBe(14);
    expect(SHARE_NAME_MAX + 15 + SHARE_TITLE_MAX).toBeLessThanOrEqual(SHARE_TEXT_MAX);
  });

  it('liveShareText: 絵文字は割れない(コードポイント単位で切る)', () => {
    const title = '\u{1F389}'.repeat(30);
    const out = liveShareText({ streamer: { name: 'りんく' }, title });
    expect(out).not.toContain('\uFFFD');
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(out)).toBe(false);
  });

  it('liveShareText: 空白・改行を 1 つに正規化', () => {
    expect(liveShareText({ streamer: { name: 'a\n\n b' }, title: 'c  d' })).toBe('a bの配信「c d」を、いま支えている人');
  });

  it('★ネガコン: 数値・時間を本文に混ぜない(投稿した瞬間に古くならない)', () => {
    const live = { streamer: { name: 'りんく' }, title: '雑談', watchCount: 12345, beginTime: 1789355007, giftTotal: 999 };
    expect(liveShareText(live)).toBe('りんくの配信「雑談」を、いま支えている人');
  });

  it('★毒: 同じ順位のデータを2回渡しても is-bumped が出ない(嘘の演出をしない)', () => {
    const t = createRowChangeTracker();
    const paint = () => { t.begin(); const c = t.classFor(rowKey('lv', 'ad', { name: 'x' }), 7); t.end(); return c; };
    paint(); paint();
    expect(paint()).toBe('');
  });

  describe('liveOgTitle(SNS カードの見出し)', () => {
    it('name・title あり', () => {
      expect(liveOgTitle({ streamer: { name: 'りんく' }, title: '雑談' })).toBe('りんくの配信「雑談」 ― いま支えている人');
    });
    it('title のみ', () => {
      expect(liveOgTitle({ streamer: { name: '' }, title: '雑談' })).toBe('「雑談」 ― いま支えている人');
    });
    it('name のみ', () => {
      expect(liveOgTitle({ streamer: { name: 'りんく' }, title: '' })).toBe('りんくの配信 ― いま支えている人');
    });
    it('両方空・null は汎用見出し(/live/index.html:20 と同文)', () => {
      const generic = 'いま配信を支えている人 ― ニコニコ生放送（追憶のきらめき ランキング）';
      expect(liveOgTitle({})).toBe(generic);
      expect(liveOgTitle(null)).toBe(generic);
    });
    it('4 分岐の最大長を固定', () => {
      const name = 'あ'.repeat(SHARE_NAME_MAX + 10);
      const title = 'い'.repeat(SHARE_TITLE_MAX + 10);
      expect(Array.from(liveOgTitle({ streamer: { name }, title })).length).toBe(58);
      expect(Array.from(liveOgTitle({ streamer: { name: '' }, title })).length).toBe(37);
      expect(Array.from(liveOgTitle({ streamer: { name }, title: '' })).length).toBe(32);
      expect(Array.from(liveOgTitle({})).length).toBe(36);
    });
    it('絵文字は割れない(コードポイント単位で切る)', () => {
      const title = '🎉'.repeat(SHARE_TITLE_MAX + 5);
      const out = liveOgTitle({ streamer: { name: 'りんく' }, title });
      expect([...out].every((ch) => ch !== '�')).toBe(true);
    });
    it('★ネガコン: 数値・時刻を持つ live でも見出しは変わらない', () => {
      const live = { streamer: { name: 'りんく' }, title: '雑談', watchCount: 12345, beginTime: 1789355007, giftTotal: 999 };
      expect(liveOgTitle(live)).toBe('りんくの配信「雑談」 ― いま支えている人');
    });
  });

  describe('commentRows(3 枠目「コメントで応援した人」)', () => {
    const live = (rankers) => ({ comment: { rankers, commenters: rankers.length, comments: 0, anonCommenters: 0 } });

    it('数値 uid: 公開ページ URL と確定パターンのアイコンを導出する(AGENTS.md §3.5)', () => {
      const [r] = commentRows(live([{ rank: 1, uid: '143172392', name: 'みち', count: 42, anon: false }]));
      expect(r.rank).toBe(1);
      expect(r.name).toBe('みち');
      expect(r.point).toBe(42);
      expect(r.url).toBe('https://www.nicovideo.jp/user/143172392');
      expect(r.avatar).toBe('https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/14317/143172392.jpg');
      expect(r.anon).toBe(false);
      expect(r.uid).toBe('143172392');
    });

    it('匿名: 「匿名NNN」＋似顔絵(data:image/svg+xml)・url は空', () => {
      const [r] = commentRows(live([{ rank: 1, uid: 'a:AbCdEfGh01', name: '', count: 30, anon: true }]));
      expect(r.name).toMatch(/^匿名\d+$/);
      expect(r.avatar.startsWith('data:image/svg+xml')).toBe(true);
      expect(r.url).toBe('');
      expect(r.anon).toBe(true);
    });

    it('★匿名は後ろへ送らない(送られてきた順のまま出す)', () => {
      const rows = commentRows(live([
        { rank: 1, uid: 'a:AbCdEfGh01', name: '', count: 99, anon: true },
        { rank: 2, uid: '143172392', name: 'みち', count: 5, anon: false }
      ]));
      expect(rows.map((r) => r.uid)).toEqual(['a:AbCdEfGh01', '143172392']);
    });

    it('comment が null / 形が違う → []', () => {
      expect(commentRows(null)).toEqual([]);
      expect(commentRows({})).toEqual([]);
      expect(commentRows({ comment: null })).toEqual([]);
      expect(commentRows({ comment: { rankers: 'x' } })).toEqual([]);
      expect(commentRows({ comment: { rankers: [null, {}, { uid: '' }] } })).toEqual([]);
    });

    it('count<=0 は落とす(「応援した人」ではない)', () => {
      const rows = commentRows(live([
        { rank: 1, uid: '143172392', name: 'a', count: 0, anon: false },
        { rank: 2, uid: '2913665', name: 'b', count: -3, anon: false },
        { rank: 3, uid: '99', name: 'c', count: 1, anon: false }
      ]));
      expect(rows.map((r) => r.uid)).toEqual(['99']);
    });

    it('rank 欠落は index+1 で埋める', () => {
      const rows = commentRows(live([
        { uid: '143172392', name: 'a', count: 5 },
        { uid: '2913665', name: 'b', count: 4 }
      ]));
      expect(rows.map((r) => r.rank)).toEqual([1, 2]);
    });

    it('★ネガコン: anon:false でもリンクを作れない ID は匿名として扱う(嘘のリンクを出さない)', () => {
      const [r] = commentRows(live([{ rank: 1, uid: 'a:Zzz', name: 'なりすまし', count: 3, anon: false }]));
      expect(r.url).toBe('');
      expect(r.anon).toBe(true);
      expect(r.name).toMatch(/^匿名\d+$/);
    });

    // ★anonymousDisplayLabel は「キー中の数字の末尾3桁」で番号を作る(nicoUserPage.js:38-44)。
    //   末尾 3 桁を揃えれば同じ「匿名NNN」を決定的に作れる。ここでは 001 で「匿名1」に揃える。
    const COLL_A = 'a:d8KyTJ001'; // 匿名1・断片 d8Ky
    const COLL_B = 'a:Qw9xVb001'; // 匿名1・断片 Qw9x
    // 先頭 4 文字(a: を除く)まで同じで 8 文字目以降が違う衝突ペア(4→8 桁伸長の検証用)。
    const PFX_A = 'a:d8Ky0A001'; // 匿名1・先頭4 d8Ky・8文字 d8Ky0A00
    const PFX_B = 'a:d8KyZZ001'; // 匿名1・先頭4 d8Ky・8文字 d8KyZZ00

    it('同じ「匿名NNN」の匿名 2 人 → 両方に uid 先頭 4 文字のサフィックス', () => {
      const rows = commentRows(live([
        { rank: 1, uid: COLL_A, name: '', count: 9, anon: true },
        { rank: 2, uid: COLL_B, name: '', count: 8, anon: true }
      ]));
      expect(rows[0].name).toMatch(/^匿名\d{1,3} ·[A-Za-z0-9_-]{4}$/);
      expect(rows[1].name).toMatch(/^匿名\d{1,3} ·[A-Za-z0-9_-]{4}$/);
      expect(rows[0].name).not.toBe(rows[1].name);
      // 断片は「a:」を除いた uid の先頭 4 文字。
      expect(rows[0].name.split(' ·')[1]).toBe('d8Ky');
      expect(rows[1].name.split(' ·')[1]).toBe('Qw9x');
    });

    it('匿名 1 人 → サフィックス無し(既存契約と同じ)', () => {
      const [r] = commentRows(live([{ rank: 1, uid: COLL_A, name: '', count: 30, anon: true }]));
      expect(r.name).toMatch(/^匿名\d+$/);
    });

    it('匿名 2 人で番号が違う → サフィックス無し', () => {
      const rows = commentRows(live([
        { rank: 1, uid: 'a:AbCd012', name: '', count: 9, anon: true }, // 匿名12
        { rank: 2, uid: 'a:ZzYy099', name: '', count: 8, anon: true } // 匿名99
      ]));
      expect(rows[0].name).toMatch(/^匿名\d+$/);
      expect(rows[1].name).toMatch(/^匿名\d+$/);
      expect(rows[0].name).not.toMatch(/ ·/);
    });

    it('数値 uid の本名が「匿名1」・匿名の「匿名1」→ 匿名側だけサフィックス・本名側不変', () => {
      const numName = anonymousDisplayLabel(COLL_A); // 「匿名1」
      const rows = commentRows(live([
        { rank: 1, uid: '143172392', name: numName, count: 10, anon: false },
        { rank: 2, uid: COLL_A, name: '', count: 9, anon: true },
        { rank: 3, uid: COLL_B, name: '', count: 8, anon: true }
      ]));
      // 数値 uid の本名(=たまたま「匿名1」)はそのまま(リンク・サムネで区別できる)。
      expect(rows[0].name).toBe(numName);
      expect(rows[0].anon).toBe(false);
      // 匿名 2 人はサフィックス付きで区別される。
      expect(rows[1].name).toMatch(/^匿名\d{1,3} ·[A-Za-z0-9_-]{4}$/);
      expect(rows[2].name).toMatch(/^匿名\d{1,3} ·[A-Za-z0-9_-]{4}$/);
      expect(rows[1].name).not.toBe(rows[2].name);
    });

    it('先頭 4 文字まで同じ uid 2 つ → 8 文字に伸びる', () => {
      const rows = commentRows(live([
        { rank: 1, uid: PFX_A, name: '', count: 9, anon: true },
        { rank: 2, uid: PFX_B, name: '', count: 8, anon: true }
      ]));
      expect(rows[0].name).toMatch(/^匿名\d{1,3} ·[A-Za-z0-9_-]{8}$/);
      expect(rows[1].name).toMatch(/^匿名\d{1,3} ·[A-Za-z0-9_-]{8}$/);
      expect(rows[0].name).not.toBe(rows[1].name);
      expect(rows[0].name.split(' ·')[1]).toBe('d8Ky0A00');
    });

    it('★既存の supporterRows / identifiedSupporters は comment を足しても変わらない', () => {
      const base = {
        gift: { rankers: [{ rank: 1, advertiserName: 'g', contribution: 10, userId: 143172392 }] },
        ad: { ranking: [] }
      };
      const withComment = { ...base, comment: { rankers: [{ rank: 1, uid: '99', name: 'c', count: 9 }] } };
      expect(supporterRows(withComment)).toEqual(supporterRows(base));
      expect(identifiedSupporters(withComment)).toEqual(identifiedSupporters(base));
    });
  });

  describe('identifiedSupportersByName(サムネ無し・ハンドルネームのみの第2段)', () => {
    const live = (rankers) => ({ comment: { rankers, commenters: rankers.length, comments: 0, anonCommenters: 0 } });

    it('コメントのみ・強い表示名の人が第2段に入る', () => {
      const out = identifiedSupportersByName(live([
        { rank: 1, uid: '143172392', name: 'みち', count: 42, anon: false }
      ]));
      expect(out).toEqual([{ uid: '143172392', name: 'みち', url: 'https://www.nicovideo.jp/user/143172392', count: 42 }]);
    });

    it('ギフト/広告で既に第1段(identifiedSupporters)に載っている uid は重複しない', () => {
      const liveWithGift = {
        gift: { rankers: [
          { rank: 1, supporterId: 111, supporterName: 'みち', supporterThumbnailUrl: 'https://img/michi.jpg', contribution: 6000, userPageUrl: 'https://www.nicovideo.jp/user/111' }
        ] },
        comment: { rankers: [
          { rank: 1, uid: '111', name: 'みち', count: 42, anon: false },
          { rank: 2, uid: '999', name: 'べつじん', count: 3, anon: false }
        ], commenters: 2, comments: 0, anonCommenters: 0 }
      };
      const out = identifiedSupportersByName(liveWithGift);
      expect(out.map((s) => s.uid)).toEqual(['999']); // 111 は第1段に既出なので除外
    });

    it('匿名(anon:true)は除外される', () => {
      const out = identifiedSupportersByName(live([
        { rank: 1, uid: 'a:AbCdEfGh01', name: 'なまえあり', count: 30, anon: true }
      ]));
      expect(out).toEqual([]);
    });

    it('弱い表示名(未取得/ゲスト/user形式)は除外される', () => {
      const out = identifiedSupportersByName(live([
        { rank: 1, uid: '1', name: '（未取得）', count: 5, anon: false },
        { rank: 2, uid: '2', name: 'ゲスト', count: 5, anon: false },
        { rank: 3, uid: '3', name: 'user12ABCd', count: 5, anon: false },
        { rank: 4, uid: '4', name: '', count: 5, anon: false }
      ]));
      expect(out).toEqual([]);
    });

    it('件数の降順に並ぶ', () => {
      const out = identifiedSupportersByName(live([
        { rank: 1, uid: '1', name: 'すくない', count: 3, anon: false },
        { rank: 2, uid: '2', name: 'おおい', count: 99, anon: false }
      ]));
      expect(out.map((s) => s.uid)).toEqual(['2', '1']);
    });

    it('live が null / comment 無しは空配列', () => {
      expect(identifiedSupportersByName(null)).toEqual([]);
      expect(identifiedSupportersByName({})).toEqual([]);
      expect(identifiedSupportersByName({ comment: null })).toEqual([]);
    });
  });
});
