import { describe, expect, it } from 'vitest';
import { applyLaneRosterKeeper, makeLaneRosterKeeperState } from './laneRosterKeeper.js';
import { bucketStoryUserLanePicks, flattenStoryUserLaneBuckets } from './storyUserLaneBuckets.js';
import { compareStoryUserLaneCandidates } from './storyUserLaneSort.js';
import {
  makeLaneRosterDeltaState,
  noteLaneRoster,
  snapshotLaneRosterDelta
} from './laneRosterDelta.js';

/**
 * v0.1.1232 lane-never-drop: 「一度出た人は絶対に消えない」の審判(統合テスト)。
 *
 * ユーザー確定の不変条件:
 *   「とにかく1度出た人は制限がなくずっと出るように」
 *
 * ★実物のパイプラインを直結して回す:
 *     candidates → applyLaneRosterKeeper → sort → bucketStoryUserLanePicks
 *       → flattenStoryUserLaneBuckets → noteLaneRoster(計器)
 *   計器の droppedTotal===0 が「誰も消えていない」ことの機械的証明になる。
 *
 * 正本: lane-never-drop-SPEC.md §5 / lane-never-drop-MAP.md §4.2
 */

/** 撤廃後の上限(popup-entry.js の STORY_USER_LANE_LIMIT_UNLIMITED と同値)。 */
const UNLIMITED = Number.POSITIVE_INFINITY;

/** 実際の候補行の形。 */
const row = (uid, tier = 3, thumbScore = 0) => ({
  entryIndex: 0,
  profileTier: tier,
  thumbScore,
  displaySrc: `https://example.test/${uid}.jpg`,
  title: `ユーザー${uid}`,
  entry: { userId: uid },
  recentTexts: [],
  meta: { idLine: `ID:${uid}`, nameLine: `ユーザー${uid}` }
});

/**
 * 本番の1 paint を再現する。
 * @param {object} keeper
 * @param {object} delta
 * @param {string} liveId
 * @param {object[]} candidates
 * @param {number} limit
 */
function paintOnce(keeper, delta, liveId, candidates, limit = UNLIMITED) {
  const { merged } = applyLaneRosterKeeper(keeper, { liveId, candidates });
  merged.sort(compareStoryUserLaneCandidates);
  const buckets = bucketStoryUserLanePicks(merged, limit);
  const picked = flattenStoryUserLaneBuckets(buckets);
  noteLaneRoster(delta, { liveId, picks: picked, candidateTotal: merged.length });
  return picked;
}

/** 決定的な擬似乱数(固定シード・Math.random を使わない)。 */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('lane-never-drop 統合 — 一度出た人は消えない', () => {
  it('連続paint(固定シードで候補を増減・入れ替え)しても droppedTotal===0(laneRosterDelta審判)', () => {
    const keeper = makeLaneRosterKeeperState();
    const delta = makeLaneRosterDeltaState();
    const rng = makeRng(20260802);
    const pool = Array.from({ length: 120 }, (_, i) => `u${i}`);

    for (let paint = 0; paint < 60; paint += 1) {
      // 候補は毎回ランダムに増減・入れ替わる(本番の「毎paintゼロから再構築」を再現)。
      const candidates = pool
        .filter(() => rng() < 0.4)
        .map((uid) => row(uid, 1 + Math.floor(rng() * 3), Math.floor(rng() * 100)));
      paintOnce(keeper, delta, 'lv1', candidates);
    }

    const snap = snapshotLaneRosterDelta(delta);
    expect(snap.droppedTotal).toBe(0);
    expect(snap.droppedEventCount).toBe(0);
  });

  it('上位tierの新規参入で下位の既存者が押し出されない(旧limit=48の消失シナリオ再現→緑)', () => {
    const keeper = makeLaneRosterKeeperState();
    const delta = makeLaneRosterDeltaState();

    // 1st paint: たぬ姉段(tier1)に48人ぴったり。
    const first = Array.from({ length: 48 }, (_, i) => row(`old${i}`, 1));
    const p1 = paintOnce(keeper, delta, 'lv1', first);
    expect(p1).toHaveLength(48);

    // 2nd paint: りんく段(tier3)の新規が48人参入。旧実装なら tier3 が枠を食い尽くし
    //   tier1 の48人が全員消えていた(これが「出たり消えたり」の正体)。
    const second = [...first, ...Array.from({ length: 48 }, (_, i) => row(`new${i}`, 3))];
    const p2 = paintOnce(keeper, delta, 'lv1', second);

    expect(p2).toHaveLength(96);
    const ids = new Set(p2.map((r) => r.entry.userId));
    for (let i = 0; i < 48; i += 1) expect(ids.has(`old${i}`)).toBe(true);
    expect(snapshotLaneRosterDelta(delta).droppedTotal).toBe(0);
  });

  it('522人規模の候補で picked に全員が含まれる(laneDiag.js:7 の実害の再現→緑)', () => {
    const keeper = makeLaneRosterKeeperState();
    const delta = makeLaneRosterDeltaState();
    const candidates = Array.from({ length: 522 }, (_, i) => row(`v${i}`, 1 + (i % 3)));

    const picked = paintOnce(keeper, delta, 'lv1', candidates);

    // 474人が黙って隠れていた不整合(limit 48)が起きないこと。
    expect(picked).toHaveLength(522);
    expect(new Set(picked.map((r) => r.entry.userId)).size).toBe(522);
    expect(snapshotLaneRosterDelta(delta).everSeenMax).toBe(522);
  });

  it('候補が谷間で空になっても誰も消えない(backfill谷間の再現)', () => {
    const keeper = makeLaneRosterKeeperState();
    const delta = makeLaneRosterDeltaState();
    const candidates = Array.from({ length: 30 }, (_, i) => row(`u${i}`, 2));

    paintOnce(keeper, delta, 'lv1', candidates);
    const picked = paintOnce(keeper, delta, 'lv1', []); // 谷間

    expect(picked).toHaveLength(30);
    expect(snapshotLaneRosterDelta(delta).droppedTotal).toBe(0);
  });

  it('lid切替では dropped と数えない(正当なリセット)', () => {
    const keeper = makeLaneRosterKeeperState();
    const delta = makeLaneRosterDeltaState();

    paintOnce(keeper, delta, 'lv1', Array.from({ length: 20 }, (_, i) => row(`a${i}`)));
    const picked = paintOnce(keeper, delta, 'lv2', [row('b0')]);

    // 別配信なので前配信の人は持ち込まない。かつ「消えた」とは数えない。
    expect(picked.map((r) => r.entry.userId)).toEqual(['b0']);
    expect(snapshotLaneRosterDelta(delta).droppedTotal).toBe(0);
  });

  it('【退行検知の自己証明】limitを48に戻すと droppedTotal>0 で赤くなる(審判が眠っていない証明)', () => {
    const keeper = makeLaneRosterKeeperState();
    const delta = makeLaneRosterDeltaState();

    // 上と同じシナリオを、旧上限48で回す。
    const first = Array.from({ length: 48 }, (_, i) => row(`old${i}`, 1));
    paintOnce(keeper, delta, 'lv1', first, 48);
    const second = [...first, ...Array.from({ length: 48 }, (_, i) => row(`new${i}`, 3))];
    paintOnce(keeper, delta, 'lv1', second, 48);

    // ★上限があると人は消える。この審判は本物である。
    expect(snapshotLaneRosterDelta(delta).droppedTotal).toBeGreaterThan(0);
  });
});
