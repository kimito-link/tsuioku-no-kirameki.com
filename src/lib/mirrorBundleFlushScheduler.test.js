import { describe, it, expect } from 'vitest';
import {
  createMirrorBundleFlushScheduler,
  buildLegacyMirrorSetPayload
} from './mirrorBundleFlushScheduler.js';
import { KEY_LANE_MIRROR } from './laneMirrorKey.js';
import { KEY_STAT_CARDS_MIRROR } from './statCardsMirrorKey.js';
import { KEY_TOP_SUPPORTERS_MIRROR } from './storageKeys.js';
import { KEY_NORTH_STAR_MIRROR } from './northStarMirrorKey.js';
import { KEY_COMMENT_TIMELINE_MIRROR } from './commentTimelineMirrorKey.js';

const LANE = { liveId: 'lv1', capturedAt: 10, link: [{ title: 'りんく' }] };
const STAT = { liveId: 'lv1', capturedAt: 11, recordsText: '3件' };
const NS = { liveId: 'lv1', capturedAt: 12, lanes: { contributionRanking: [{ name: '貢献A' }], adRanking: [] } };

/**
 * ★このテストは council/pop-foundation-then-parity-SYNTHESIS.md の「5鏡を1回の atomic set で書く」土台を固定する。
 *   特に (1)null セクションは同梱しない=既存 storage を消さない (2)min-gap は flush 一元 (3)gap 窓の更新を捨てない(F-1根治)。
 */
describe('buildLegacyMirrorSetPayload', () => {
  it('反映済みセクションだけを旧キーに載せ、null セクションは同梱しない(既存を消さない)', () => {
    const sched = createMirrorBundleFlushScheduler({ minGapMs: 0 });
    sched.reflect('lane', LANE, { liveId: 'lv1', nowMs: 100 });
    sched.reflect('statCards', STAT, { liveId: 'lv1', nowMs: 101 });
    const payload = buildLegacyMirrorSetPayload(sched.peekBundle());
    expect(payload[KEY_LANE_MIRROR]).toBe(LANE);
    expect(payload[KEY_STAT_CARDS_MIRROR]).toBe(STAT);
    // 未反映のセクションはキー自体が無い(=set しない=既存を消さない)。
    expect(KEY_TOP_SUPPORTERS_MIRROR in payload).toBe(false);
    expect(KEY_NORTH_STAR_MIRROR in payload).toBe(false);
    expect(KEY_COMMENT_TIMELINE_MIRROR in payload).toBe(false);
  });

  it('bundle が空/不正でも空ペイロード(投げない)', () => {
    expect(buildLegacyMirrorSetPayload(null)).toEqual({});
    expect(buildLegacyMirrorSetPayload({})).toEqual({});
  });
});

describe('createMirrorBundleFlushScheduler', () => {
  it('複数セクションを反映→1回の takeFlushPayload で全部同梱(同一tick一貫)', () => {
    const sched = createMirrorBundleFlushScheduler({ minGapMs: 0 });
    sched.reflect('lane', LANE, { liveId: 'lv1', nowMs: 100 });
    sched.reflect('statCards', STAT, { liveId: 'lv1', nowMs: 101 });
    sched.reflect('northStar', NS, { liveId: 'lv1', nowMs: 102 });

    const out = sched.takeFlushPayload(103);
    expect(out).not.toBeNull();
    expect(out.bundle.gen).toBe(1); // flush で gen+1
    expect(out.legacyPayload[KEY_LANE_MIRROR]).toBe(LANE);
    expect(out.legacyPayload[KEY_STAT_CARDS_MIRROR]).toBe(STAT);
    expect(out.legacyPayload[KEY_NORTH_STAR_MIRROR]).toBe(NS);
  });

  it('dirty でなければ flush しない(null)', () => {
    const sched = createMirrorBundleFlushScheduler({ minGapMs: 0 });
    expect(sched.takeFlushPayload(100)).toBeNull();
  });

  it('flush 後は dirty が下り、再反映するまで再 flush しない', () => {
    const sched = createMirrorBundleFlushScheduler({ minGapMs: 0 });
    sched.reflect('lane', LANE, { liveId: 'lv1', nowMs: 100 });
    expect(sched.takeFlushPayload(100)).not.toBeNull();
    expect(sched.isDirty()).toBe(false);
    expect(sched.takeFlushPayload(101)).toBeNull(); // 再反映が無い=出さない
  });

  it('min-gap 未経過は flush を見送るが、gap 中の更新はバッファに残り次 flush で載る(F-1根治)', () => {
    const sched = createMirrorBundleFlushScheduler({ minGapMs: 3000 });
    sched.reflect('lane', LANE, { liveId: 'lv1', nowMs: 100000 });
    expect(sched.takeFlushPayload(100000)).not.toBeNull(); // 初回 flush
    // gap 中に新しい lane が来る(捨てない=バッファに残る)。
    const lane2 = { ...LANE, link: [{ title: 'りんく2' }] };
    sched.reflect('lane', lane2, { liveId: 'lv1', nowMs: 101000 });
    expect(sched.takeFlushPayload(101000)).toBeNull(); // gap 未経過=まだ書かない
    // gap 経過後の flush で「gap 中に来た最新」が確実に載る。
    const out = sched.takeFlushPayload(103000);
    expect(out).not.toBeNull();
    expect(out.legacyPayload[KEY_LANE_MIRROR]).toBe(lane2);
  });

  it('gen は flush のたびに単調増加する', () => {
    const sched = createMirrorBundleFlushScheduler({ minGapMs: 0 });
    sched.reflect('lane', LANE, { liveId: 'lv1', nowMs: 1 });
    expect(sched.takeFlushPayload(1).bundle.gen).toBe(1);
    sched.reflect('statCards', STAT, { liveId: 'lv1', nowMs: 2 });
    expect(sched.takeFlushPayload(2).bundle.gen).toBe(2);
  });

  it('配信切替でセクションはリセットされ gen は温存(読み手が新配信を stale 誤判定しない)', () => {
    const sched = createMirrorBundleFlushScheduler({ minGapMs: 0 });
    sched.reflect('lane', LANE, { liveId: 'lv1', nowMs: 100 });
    sched.reflect('statCards', STAT, { liveId: 'lv1', nowMs: 101 });
    const first = sched.takeFlushPayload(101);
    expect(first.bundle.gen).toBe(1);

    const lv2Lane = { ...LANE, liveId: 'lv2' };
    sched.reflect('lane', lv2Lane, { liveId: 'lv2', nowMs: 200 });
    const out = sched.takeFlushPayload(200);
    expect(out.bundle.liveId).toBe('lv2');
    expect(out.bundle.gen).toBe(2); // 巻き戻さない
    // 旧配信 statCards は持ち越さない=同梱ペイロードに無い。
    expect(KEY_STAT_CARDS_MIRROR in out.legacyPayload).toBe(false);
    expect(out.legacyPayload[KEY_LANE_MIRROR]).toBe(lv2Lane);
  });

  it('ネガコン: null 反映は無視(dirty にしない)', () => {
    const sched = createMirrorBundleFlushScheduler({ minGapMs: 0 });
    sched.reflect('lane', null, { liveId: 'lv1', nowMs: 100 });
    expect(sched.isDirty()).toBe(false);
    expect(sched.takeFlushPayload(100)).toBeNull();
  });
});
