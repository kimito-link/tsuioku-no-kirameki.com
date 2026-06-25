import { describe, it, expect } from 'vitest';
import { buildNorthStarMirrorSnapshot, restoreNorthStarMirrorRows } from './northStarMirror.js';

/**
 * C1a(北極星レーン鏡): popup が計算済みの北極星レーン rows を、純Web に相乗り送信できる
 * JSON-safe スナップショットに間引く純関数。まずは contributionRanking(ギフト貢献度)レーン。
 *   - 上位10件 cap・JSON-safe(非列挙プロパティを残さない)
 *   - liveId/capturedAt 同梱(鮮度・対象配信判定)
 *   - restore で paint 側が受ける rows 形に戻す
 */

const CONTRIB_ROWS = Array.from({ length: 15 }, (_, i) => ({
  rank: i + 1,
  userId: String(10000000 + i),
  name: `応援者${i + 1}`,
  nickname: `応援者${i + 1}`,
  avatarUrl: `https://cdn/${i}.jpg`,
  count: 100 - i,
  extraNonSerializable: () => 1 // 関数は JSON で落ちる=入れない確認用
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

  it('JSON-safe(関数等の非シリアライズ値を持ち込まない)', () => {
    const snap = buildNorthStarMirrorSnapshot({ liveId: 'lv1', contributionRanking: CONTRIB_ROWS }, 1);
    // JSON 往復しても rows の必要フィールドが残る
    const round = JSON.parse(JSON.stringify(snap));
    expect(round.lanes.contributionRanking[0]).toMatchObject({ userId: '10000000', count: 100 });
    expect(round.lanes.contributionRanking[0].extraNonSerializable).toBeUndefined();
  });

  it('row の必要フィールド(rank/userId/name/avatarUrl/count)だけを保持', () => {
    const snap = buildNorthStarMirrorSnapshot({ liveId: 'lv1', contributionRanking: [CONTRIB_ROWS[0]] }, 1);
    const r = snap.lanes.contributionRanking[0];
    expect(r.userId).toBe('10000000');
    expect(r.name).toBe('応援者1');
    expect(r.avatarUrl).toBe('https://cdn/0.jpg');
    expect(r.count).toBe(100);
    expect(r.rank).toBe(1);
  });

  // ネガコン: rows 無し/空で contributionRanking は空配列・lanes は存在。
  it('ネガコン: contributionRanking 無しで空配列(投げない)', () => {
    const snap = buildNorthStarMirrorSnapshot({ liveId: 'lv1' }, 1);
    expect(snap.lanes.contributionRanking).toEqual([]);
    expect(() => buildNorthStarMirrorSnapshot(null, 1)).not.toThrow();
  });
});

describe('restoreNorthStarMirrorRows', () => {
  it('スナップショットから指定レーンの rows を取り出す', () => {
    const snap = buildNorthStarMirrorSnapshot({ liveId: 'lv1', contributionRanking: CONTRIB_ROWS }, 1);
    const rows = restoreNorthStarMirrorRows(snap, 'contributionRanking');
    expect(rows.length).toBe(10);
    expect(rows[0].userId).toBe('10000000');
  });

  it('ネガコン: snap=null/未知レーンで空配列', () => {
    expect(restoreNorthStarMirrorRows(null, 'contributionRanking')).toEqual([]);
    expect(restoreNorthStarMirrorRows({ lanes: {} }, 'unknownLane')).toEqual([]);
  });
});
