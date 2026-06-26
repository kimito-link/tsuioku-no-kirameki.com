import { describe, it, expect } from 'vitest';
import { buildNorthStarMirrorSnapshot, restoreNorthStarMirrorRows } from './northStarMirror.js';
import { officialDomRankingRowsToStripRooms } from './officialDomRankingRowsToStripRooms.js';

/**
 * C1a(北極星レーン鏡): popup が計算済みの北極星レーン rows を、純Web に相乗り送信できる
 * JSON-safe スナップショットに間引く純関数。まずは contributionRanking(ギフト貢献度)レーン。
 *   ★row の正本フィールドは officialDomRankingRowsToStripRooms が読むもの(name/contribution/thumbnailUrl/
 *     rank/isAnonymous/userPageUrl)に完全一致=純Web で同じ関数に渡せば byte 一致(似せて自作の轍を回避)。
 */

// resolveOfficialContributionRankingRows の戻りに合わせた実フィールド名。
const CONTRIB_ROWS = Array.from({ length: 15 }, (_, i) => ({
  rank: i + 1,
  name: `応援者${i + 1}`,
  contribution: 100 - i,
  thumbnailUrl: `https://cdn/${i}.jpg`,
  isAnonymous: false,
  userPageUrl: `https://www.nicovideo.jp/user/${10000000 + i}`,
  extraNonSerializable: () => 1 // 関数は持ち込まない確認用
}));

describe('buildNorthStarMirrorSnapshot', () => {
  it('liveId/capturedAt と contributionRanking rows を持つ', () => {
    const snap = buildNorthStarMirrorSnapshot({ liveId: 'lv123', contributionRanking: CONTRIB_ROWS }, 1700000000000);
    expect(snap.liveId).toBe('lv123');
    expect(snap.capturedAt).toBe(1700000000000);
    expect(Array.isArray(snap.lanes.contributionRanking)).toBe(true);
  });

  it('上位10件で cap する', () => {
    const snap = buildNorthStarMirrorSnapshot({ liveId: 'lv1', contributionRanking: CONTRIB_ROWS }, 1);
    expect(snap.lanes.contributionRanking.length).toBe(10);
  });

  it('officialDomRankingRowsToStripRooms が読む正本フィールドを verbatim 保持', () => {
    const snap = buildNorthStarMirrorSnapshot({ liveId: 'lv1', contributionRanking: [CONTRIB_ROWS[0]] }, 1);
    const r = snap.lanes.contributionRanking[0];
    expect(r.name).toBe('応援者1');
    expect(r.contribution).toBe(100);
    expect(r.thumbnailUrl).toBe('https://cdn/0.jpg');
    expect(r.rank).toBe(1);
    expect(r.isAnonymous).toBe(false);
    expect(r.userPageUrl).toBe('https://www.nicovideo.jp/user/10000000');
  });

  it('JSON-safe(関数等の非シリアライズ値を持ち込まない)', () => {
    const snap = buildNorthStarMirrorSnapshot({ liveId: 'lv1', contributionRanking: CONTRIB_ROWS }, 1);
    const round = JSON.parse(JSON.stringify(snap));
    expect(round.lanes.contributionRanking[0].extraNonSerializable).toBeUndefined();
    expect(round.lanes.contributionRanking[0].contribution).toBe(100);
  });

  // ★最重要(byte一致): スナップショット→restore→officialDomRankingRowsToStripRooms が、
  //   元 rows→同関数 と同じ rooms を出す(純Web で popup とズレない保証)。
  it('round-trip 一致: 元 rows と restore 後 rows が同じ rooms を生む', () => {
    const top10 = CONTRIB_ROWS.slice(0, 10);
    const direct = officialDomRankingRowsToStripRooms(top10, { userKeyKind: 'contrib' });
    const snap = JSON.parse(JSON.stringify(buildNorthStarMirrorSnapshot({ liveId: 'lv1', contributionRanking: CONTRIB_ROWS }, 1)));
    const restored = restoreNorthStarMirrorRows(snap, 'contributionRanking');
    const viaMirror = officialDomRankingRowsToStripRooms(restored, { userKeyKind: 'contrib' });
    // nickname / count / avatarUrl / userKey(uid 由来)が一致すれば paint も一致する。
    expect(viaMirror.map((x) => [x.nickname, x.count, x.avatarUrl, x.userKey]))
      .toEqual(direct.map((x) => [x.nickname, x.count, x.avatarUrl, x.userKey]));
  });

  it('ネガコン: contributionRanking 無しで空配列(投げない)', () => {
    const snap = buildNorthStarMirrorSnapshot({ liveId: 'lv1' }, 1);
    expect(snap.lanes.contributionRanking).toEqual([]);
    expect(() => buildNorthStarMirrorSnapshot(null, 1)).not.toThrow();
  });
});

// ── adRanking(ニコニ広告の貢献度ランキング)レーンも contributionRanking と同型で持つ ──
// nicoad API 由来 row(officialDomRankingRowsToStripRooms が読む同じフィールド)。
const AD_ROWS = Array.from({ length: 12 }, (_, i) => ({
  rank: i + 1,
  name: `広告主${i + 1}`,
  contribution: 5000 - i * 100,
  thumbnailUrl: `https://cdn/ad${i}.jpg`,
  isAnonymous: false,
  userPageUrl: `https://www.nicovideo.jp/user/${20000000 + i}`,
  extraNonSerializable: () => 1
}));

describe('buildNorthStarMirrorSnapshot adRanking', () => {
  it('contributionRanking と独立に adRanking を持つ(両方同梱)', () => {
    const snap = buildNorthStarMirrorSnapshot(
      { liveId: 'lv9', contributionRanking: CONTRIB_ROWS, adRanking: AD_ROWS },
      1700000000000
    );
    expect(Array.isArray(snap.lanes.adRanking)).toBe(true);
    expect(snap.lanes.contributionRanking.length).toBe(10);
    expect(snap.lanes.adRanking.length).toBe(10); // cap 10
  });

  it('adRanking 無しでも空配列(後方互換・投げない)', () => {
    const snap = buildNorthStarMirrorSnapshot({ liveId: 'lv1', contributionRanking: CONTRIB_ROWS }, 1);
    expect(snap.lanes.adRanking).toEqual([]);
  });

  it('JSON-safe(関数等を持ち込まない)', () => {
    const snap = buildNorthStarMirrorSnapshot({ liveId: 'lv1', adRanking: AD_ROWS }, 1);
    const round = JSON.parse(JSON.stringify(snap));
    expect(round.lanes.adRanking[0].extraNonSerializable).toBeUndefined();
    expect(round.lanes.adRanking[0].contribution).toBe(5000);
  });

  // ★byte一致: restore→officialDomRankingRowsToStripRooms('ad') が元 rows と同じ rooms を生む。
  it('round-trip 一致(ad): 元 rows と restore 後 rows が同じ rooms を生む', () => {
    const top10 = AD_ROWS.slice(0, 10);
    const direct = officialDomRankingRowsToStripRooms(top10, { userKeyKind: 'ad' });
    const snap = JSON.parse(
      JSON.stringify(buildNorthStarMirrorSnapshot({ liveId: 'lv1', adRanking: AD_ROWS }, 1))
    );
    const restored = restoreNorthStarMirrorRows(snap, 'adRanking');
    const viaMirror = officialDomRankingRowsToStripRooms(restored, { userKeyKind: 'ad' });
    expect(viaMirror.map((x) => [x.nickname, x.count, x.avatarUrl, x.userKey]))
      .toEqual(direct.map((x) => [x.nickname, x.count, x.avatarUrl, x.userKey]));
  });
});

describe('restoreNorthStarMirrorRows', () => {
  it('スナップショットから指定レーンの rows を取り出す', () => {
    const snap = buildNorthStarMirrorSnapshot({ liveId: 'lv1', contributionRanking: CONTRIB_ROWS }, 1);
    const rows = restoreNorthStarMirrorRows(snap, 'contributionRanking');
    expect(rows.length).toBe(10);
    expect(rows[0].name).toBe('応援者1');
  });

  it('ネガコン: snap=null/未知レーンで空配列', () => {
    expect(restoreNorthStarMirrorRows(null, 'contributionRanking')).toEqual([]);
    expect(restoreNorthStarMirrorRows({ lanes: {} }, 'unknownLane')).toEqual([]);
  });
});
