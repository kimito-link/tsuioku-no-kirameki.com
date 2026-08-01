import { describe, it, expect } from 'vitest';
import {
  touchRoster,
  pruneRoster,
  rosterToVenueRows,
  hydrateRosterFromCandidates,
  isRosterEntryVip,
  VENUE_ROSTER_VIP_COMMENT_THRESHOLD
} from './venueLiveRoster.js';
import { buildVenueSeating } from './venueSeats.js';

/*
 * v0.1.754 会場3時間安定化(星野ロミ会議の本質解): 在席を「storage 全コメント集計」でなく
 * 「onLiveComments で通過した瞬間に touch する in-memory Map」にし、時間窓+LRU で有界化。
 * 純関数なので DOM/storage 無しでテスト可能。差分集計(venueIncrementalAggregate)は hydrate/
 * standalone/rollback の土台として温存。
 */

describe('touchRoster (通過コメントで在席を更新)', () => {
  it('新規ユーザーを追加(commentCount=1・firstSeen=lastSeen=now)', () => {
    const roster = new Map();
    touchRoster(roster, { userId: 'a', text: 'やあ', nickname: 'A' }, 1000);
    const e = roster.get('a');
    expect(e.commentCount).toBe(1);
    expect(e.firstSeen).toBe(1000);
    expect(e.lastSeen).toBe(1000);
    expect(e.name).toBe('A');
  });

  it('既存ユーザーは加算+lastSeen 更新(firstSeen 不変)', () => {
    const roster = new Map();
    touchRoster(roster, { userId: 'a', text: 'x', nickname: 'A' }, 1000);
    touchRoster(roster, { userId: 'a', text: 'y' }, 5000);
    const e = roster.get('a');
    expect(e.commentCount).toBe(2);
    expect(e.firstSeen).toBe(1000);
    expect(e.lastSeen).toBe(5000);
  });

  it('userId 無しは在席に入れない(匿名は席に座らない)', () => {
    const roster = new Map();
    expect(touchRoster(roster, { text: '名無し' }, 1000)).toBe(null);
    expect(roster.size).toBe(0);
  });

  it('本文が空の行は数えない(v0.1.740 配信者本人混入防止・requireText 既定true)', () => {
    const roster = new Map();
    expect(touchRoster(roster, { userId: 'a', text: '   ' }, 1000)).toBe(null);
    expect(roster.size).toBe(0);
  });

  it('requireText:false なら本文空でも数える', () => {
    const roster = new Map();
    touchRoster(roster, { userId: 'a', text: '' }, 1000, { requireText: false });
    expect(roster.get('a').commentCount).toBe(1);
  });

  it('name は非空を保持(後から空が来ても下げない・先に空なら採用)', () => {
    const roster = new Map();
    touchRoster(roster, { userId: 'a', text: 'x', nickname: '' }, 1000);
    expect(roster.get('a').name).toBe('');
    touchRoster(roster, { userId: 'a', text: 'y', nickname: 'りんく' }, 2000);
    expect(roster.get('a').name).toBe('りんく');
    touchRoster(roster, { userId: 'a', text: 'z', nickname: '' }, 3000);
    expect(roster.get('a').name).toBe('りんく'); // 下げない
  });

  it('avatar は実サムネ(http)を優先(非実は実を上書きしない)', () => {
    const url = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/1/2.jpg';
    const roster = new Map();
    touchRoster(roster, { userId: 'a', text: 'x', avatarUrl: '' }, 1000);
    touchRoster(roster, { userId: 'a', text: 'y', avatarUrl: url }, 2000);
    expect(roster.get('a').avatar).toBe(url);
    touchRoster(roster, { userId: 'a', text: 'z', avatarUrl: 'data:image/png;base64,xx' }, 3000);
    expect(roster.get('a').avatar).toBe(url); // 実サムネを非実で潰さない
  });

  it('ギフト(isGift)で giftCount 加算+vip 即true', () => {
    const roster = new Map();
    touchRoster(roster, { userId: 'a', text: 'x' }, 1000, { isGift: true });
    expect(roster.get('a').giftCount).toBe(1);
    expect(roster.get('a').vip).toBe(true);
  });
});

describe('isRosterEntryVip (常連/支援者判定=保持窓の延長軸)', () => {
  it('閾値未満・ギフト無し→false', () => {
    expect(isRosterEntryVip({ commentCount: VENUE_ROSTER_VIP_COMMENT_THRESHOLD - 1, giftCount: 0 })).toBe(false);
  });
  it('閾値以上→true', () => {
    expect(isRosterEntryVip({ commentCount: VENUE_ROSTER_VIP_COMMENT_THRESHOLD, giftCount: 0 })).toBe(true);
  });
  it('ギフト>0→true(少コメントでも)', () => {
    expect(isRosterEntryVip({ commentCount: 1, giftCount: 1 })).toBe(true);
  });
});

describe('pruneRoster (時間窓+LRU で有界化=3時間でも O(席数))', () => {
  const opts = { windowMs: 4 * 60_000, vipWindowMs: 15 * 60_000, maxSeats: 3 };

  it('窓を超えた非VIPは退席', () => {
    const roster = new Map();
    touchRoster(roster, { userId: 'old', text: 'x' }, 0);
    touchRoster(roster, { userId: 'new', text: 'y' }, 4 * 60_000);
    pruneRoster(roster, 4 * 60_000 + 1, opts); // old は 4分超
    expect(roster.has('old')).toBe(false);
    expect(roster.has('new')).toBe(true);
  });

  it('VIP は通常窓を超えても VIP窓内なら残る', () => {
    const roster = new Map();
    touchRoster(roster, { userId: 'vip', text: 'x' }, 0, { isGift: true }); // vip
    pruneRoster(roster, 5 * 60_000, opts); // 5分=通常窓超だが VIP窓(15分)内
    expect(roster.has('vip')).toBe(true);
    pruneRoster(roster, 15 * 60_000 + 1, opts); // VIP窓も超
    expect(roster.has('vip')).toBe(false);
  });

  it('maxSeats 超過で最古の非VIPからLRU退席', () => {
    const roster = new Map();
    touchRoster(roster, { userId: 'a', text: 'x' }, 100);
    touchRoster(roster, { userId: 'b', text: 'x' }, 200);
    touchRoster(roster, { userId: 'c', text: 'x' }, 300);
    touchRoster(roster, { userId: 'd', text: 'x' }, 400); // 4人 > maxSeats 3
    pruneRoster(roster, 500, opts);
    expect(roster.size).toBe(3);
    expect(roster.has('a')).toBe(false); // 最古が落ちる
    expect(roster.has('d')).toBe(true);
  });

  it('VIP は非VIPより先に退席させない(満席時)', () => {
    const roster = new Map();
    touchRoster(roster, { userId: 'vip', text: 'x' }, 100, { isGift: true }); // 最古だが VIP
    touchRoster(roster, { userId: 'b', text: 'x' }, 200);
    touchRoster(roster, { userId: 'c', text: 'x' }, 300);
    touchRoster(roster, { userId: 'd', text: 'x' }, 400);
    pruneRoster(roster, 500, opts); // size4>3 → 非VIP最古 b が落ち vip は残る
    expect(roster.has('vip')).toBe(true);
    expect(roster.has('b')).toBe(false);
    expect(roster.size).toBe(3);
  });
});

describe('rosterToVenueRows (buildVenueSeating の入力形に変換=契約厳守)', () => {
  it('preCount/preGiftCount/preHasGift/capturedAt を必ず持つ(VIP-glow が死なない)', () => {
    const roster = new Map();
    touchRoster(roster, { userId: 'a', text: 'x', nickname: 'A', avatarUrl: 'https://x/y.jpg' }, 1000);
    touchRoster(roster, { userId: 'a', text: 'y' }, 2000);
    const rows = rosterToVenueRows(roster);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      // v0.1.1216: text は '' 固定をやめ「直前の発言本文」を載せる(最新の 'y')。
      //   以前は '' だったため、ホバーカードの本文表示(v0.1.1192実装済み)が
      //   席のある人でも常に空になっていた。
      userId: 'a', name: 'A', avatar: 'https://x/y.jpg', text: 'y',
      capturedAt: 2000, preCount: 2, preHasGift: false, preGiftCount: 0
    });
  });

  /**
   * v0.1.1216: ホバーカードに「この人が直前に何を言ったか」を出すための供給。
   * 真因は touchRoster が text の有無だけ見て保存していなかったこと。
   */
  it('最新の発言で本文が上書きされる(直前の発言を出す仕様)', () => {
    const roster = new Map();
    touchRoster(roster, { userId: 'a', text: '古い' }, 1000);
    touchRoster(roster, { userId: 'a', text: '新しい' }, 2000);
    expect(rosterToVenueRows(roster)[0].text).toBe('新しい');
  });

  it('ギフトだけの行では本文を上書きしない(直前の発言を投擲で消さない)', () => {
    const roster = new Map();
    touchRoster(roster, { userId: 'a', text: '発言' }, 1000);
    touchRoster(roster, { userId: 'a', text: '' }, 2000, { requireText: false, isGift: true });
    expect(rosterToVenueRows(roster)[0].text).toBe('発言');
  });

  it('ギフトだけで登場した人は本文を持たない(発言していないのに本文が出る嘘を作らない)', () => {
    const roster = new Map();
    touchRoster(roster, { userId: 'g', text: '' }, 1000, { requireText: false, isGift: true });
    expect(rosterToVenueRows(roster)[0].text).toBe('');
  });

  it('capturedAt(=lastSeen)降順にソート', () => {
    const roster = new Map();
    touchRoster(roster, { userId: 'a', text: 'x' }, 10);
    touchRoster(roster, { userId: 'b', text: 'x' }, 30);
    touchRoster(roster, { userId: 'c', text: 'x' }, 20);
    expect(rosterToVenueRows(roster).map((r) => r.userId)).toEqual(['b', 'c', 'a']);
  });

  it('空 roster は []', () => {
    expect(rosterToVenueRows(new Map())).toEqual([]);
  });
});

describe('hydrateRosterFromCandidates (開いた瞬間 storage 1回シード)', () => {
  const cand = (o) => ({
    userId: o.userId, nickname: o.nickname ?? '', avatarUrl: o.avatarUrl ?? '',
    commentCount: o.commentCount ?? 1, giftCount: o.giftCount ?? 0, _laneSortAt: o._laneSortAt ?? 0
  });

  it('候補から在席を seed(lastSeen=_laneSortAt・count/gift/name 反映)', () => {
    const roster = new Map();
    hydrateRosterFromCandidates(roster, [cand({ userId: 'a', commentCount: 4, giftCount: 1, _laneSortAt: 999, nickname: 'A' })], { maxSeats: 150 });
    const e = roster.get('a');
    expect(e.lastSeen).toBe(999);
    expect(e.commentCount).toBe(4);
    expect(e.giftCount).toBe(1);
    expect(e.vip).toBe(true);
  });

  it('既存(ライブで新しい)エントリを上書きしない(非clobber)', () => {
    const roster = new Map();
    touchRoster(roster, { userId: 'a', text: 'x' }, 5000); // live lastSeen=5000
    hydrateRosterFromCandidates(roster, [cand({ userId: 'a', commentCount: 10, _laneSortAt: 100 })], { maxSeats: 150 });
    expect(roster.get('a').lastSeen).toBe(5000); // live を保持
    expect(roster.get('a').commentCount).toBe(1); // 二重加算しない
  });

  it('冪等(2回 hydrate しても commentCount は二重化しない)', () => {
    const roster = new Map();
    const c = [cand({ userId: 'a', commentCount: 3, _laneSortAt: 100 })];
    hydrateRosterFromCandidates(roster, c, { maxSeats: 150 });
    hydrateRosterFromCandidates(roster, c, { maxSeats: 150 });
    expect(roster.get('a').commentCount).toBe(3);
  });
});

describe('契約 end-to-end: roster→buildVenueSeating で VIP-glow が効く(preCount/gift が乗る)', () => {
  it('ギフト送信者の席が isVipRegular=true(preGiftCount が VIP-glow まで通る)', () => {
    const roster = new Map();
    // ギフトユーザー + 通常コメント数人(相対上位スコアで gifter が VIP に)
    touchRoster(roster, { userId: 'gifter', text: 'x', nickname: 'G', avatarUrl: 'https://x/g.jpg' }, 1000, { isGift: true });
    for (let i = 0; i < 6; i++) touchRoster(roster, { userId: `u${i}`, text: 'c', nickname: `U${i}` }, 1000 + i);
    const rows = rosterToVenueRows(roster);
    const seating = buildVenueSeating(rows, { maxSeats: 150 });
    const gifterSeat = seating.seats.find((s) => s.participant.userId === 'gifter' || s.participant.key === 'u:gifter');
    expect(gifterSeat).toBeTruthy();
    expect(gifterSeat.isVipRegular).toBe(true); // preGiftCount が collectVenueParticipants→VIPスコアまで生きている
  });
});
