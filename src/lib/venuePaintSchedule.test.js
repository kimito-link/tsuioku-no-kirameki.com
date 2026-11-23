import { describe, expect, it } from 'vitest';
import {
  shouldAnimateVenueCrowd,
  unusedSeatNeedsCleanup,
  requiredSeatNodeCount,
  growVenueSeatNodes,
  isVenuePageHidden,
  resolveVenueSpeechPaintSkip,
  shouldSyncVenueSeatCommit,
  createVenuePaintSchedule,
  createVenueCrowdMotion,
} from './venuePaintSchedule.js';

describe('shouldAnimateVenueCrowd', () => {
  it('開いていて観客がいるときだけ動く(しまっている・裏タブ・動きを減らす設定では動かない)', () => {
    const base = { open: true, tucked: false, hidden: false, reducedMotion: false, count: 85 };
    expect(shouldAnimateVenueCrowd(base)).toBe(true);
    expect(shouldAnimateVenueCrowd({ ...base, open: false })).toBe(false);
    expect(shouldAnimateVenueCrowd({ ...base, tucked: true })).toBe(false);
    expect(shouldAnimateVenueCrowd({ ...base, hidden: true })).toBe(false);
    expect(shouldAnimateVenueCrowd({ ...base, reducedMotion: true })).toBe(false);
    expect(shouldAnimateVenueCrowd({ ...base, count: 0 })).toBe(false);
  });
});

describe('unusedSeatNeedsCleanup', () => {
  it('見えている席は掃除しない', () => {
    expect(unusedSeatNeedsCleanup({ seat: { parentElement: {}, childNodes: { length: 1 } }, tile: {} }, true)).toBe(false);
  });

  it('既に外して空の席は触らない', () => {
    expect(unusedSeatNeedsCleanup({ seat: { parentElement: null, childNodes: { length: 0 } }, tile: null }, false)).toBe(false);
  });

  it('まだ付いている・中身がある・タイルが残っている席だけ掃除する', () => {
    expect(unusedSeatNeedsCleanup({ seat: { parentElement: {}, childNodes: { length: 0 } }, tile: null }, false)).toBe(true);
    expect(unusedSeatNeedsCleanup({ seat: { parentElement: null, childNodes: { length: 2 } }, tile: null }, false)).toBe(true);
    expect(unusedSeatNeedsCleanup({ seat: { parentElement: null, childNodes: { length: 0 } }, tile: {} }, false)).toBe(true);
  });
});

describe('requiredSeatNodeCount', () => {
  it('見える席の最大 index まで足し、上限で切る。少ない人数では 500 個作らない', () => {
    expect(requiredSeatNodeCount([{ seatIndex: 0 }, { seatIndex: 84 }], 0, 500)).toBe(85);
    expect(requiredSeatNodeCount([{ seatIndex: 84 }], 10, 500)).toBe(85);
    expect(requiredSeatNodeCount([{ seatIndex: 900 }], 0, 500)).toBe(500);
    expect(requiredSeatNodeCount([], 0, 500)).toBe(0);
  });
});

describe('shouldSyncVenueSeatCommit', () => {
  it('新しい発言者の席が無いときだけ同期描画する。しまった・裏タブ・閉じているときは描かない', () => {
    const seated = new Set(['a']);
    const hasSeat = (uid) => seated.has(uid);
    expect(shouldSyncVenueSeatCommit({ open: true, speakerIds: ['b'], hasSeat })).toBe(true);
    expect(shouldSyncVenueSeatCommit({ open: true, speakerIds: ['a'], hasSeat })).toBe(false);
    expect(shouldSyncVenueSeatCommit({ open: true, tucked: true, speakerIds: ['b'], hasSeat })).toBe(false);
    expect(shouldSyncVenueSeatCommit({ open: true, hidden: true, speakerIds: ['b'], hasSeat })).toBe(false);
    expect(shouldSyncVenueSeatCommit({ open: false, speakerIds: ['b'], hasSeat })).toBe(false);
  });
});

describe('createVenuePaintSchedule', () => {
  it('同じ時間に何度来ても 1 回にまとめ、隠している間は保留し、kick で 1 回だけ走る', () => {
    const queue = [];
    let now = 1000;
    let hidden = false;
    const sched = createVenuePaintSchedule({
      raf: (cb) => {
        queue.push(cb);
        return queue.length;
      },
      caf: () => {
        queue.length = 0;
      },
      now: () => now,
      isHidden: () => hidden,
      isPaused: () => false,
      minIntervalMs: 80,
    });
    let ran = 0;
    expect(sched.schedule(() => {
      ran += 1;
    })).toBe('scheduled');
    expect(sched.schedule(() => {
      ran += 10;
    })).toBe('coalesced');
    expect(queue.length).toBe(1);
    queue.shift()();
    expect(ran).toBe(10);

    hidden = true;
    expect(sched.schedule(() => {
      ran += 1;
    })).toBe('deferred');
    expect(queue.length).toBe(0);
    hidden = false;
    sched.kick();
    expect(queue.length).toBe(1);
    now += 80;
    queue.shift()();
    expect(ran).toBe(11);
  });
});

describe('growVenueSeatNodes', () => {
  it('足りない席だけ足し、上限は超えない', () => {
    const nodes = ['a', 'b'];
    growVenueSeatNodes(nodes, [{ seatIndex: 4 }], 500, (i) => `n${i}`);
    expect(nodes).toEqual(['a', 'b', 'n2', 'n3', 'n4']);
    growVenueSeatNodes(nodes, [{ seatIndex: 900 }], 6, (i) => `n${i}`);
    expect(nodes).toHaveLength(6);
  });
});

describe('isVenuePageHidden / resolveVenueSpeechPaintSkip', () => {
  it('裏タブを hidden とみなす', () => {
    expect(isVenuePageHidden({ visibilityState: 'hidden' })).toBe(true);
    expect(isVenuePageHidden({ visibilityState: 'visible' })).toBe(false);
    expect(isVenuePageHidden(null)).toBe(false);
  });

  it('開いて見えるときだけ席を描き、しまったときは声だけ、裏タブは待ち行列も貯めない', () => {
    expect(resolveVenueSpeechPaintSkip({ open: true }).skipSeats).toBe(false);
    const tucked = resolveVenueSpeechPaintSkip({ open: true, tucked: true, voiceEnabled: true });
    expect(tucked).toEqual({ skipSeats: true, skipEnqueue: false, venueGate: 'ok' });
    const hidden = resolveVenueSpeechPaintSkip({ open: true, hidden: true, voiceEnabled: true });
    expect(hidden).toEqual({ skipSeats: true, skipEnqueue: true, venueGate: 'headless' });
    const closed = resolveVenueSpeechPaintSkip({ open: false, readingWanted: true });
    expect(closed).toEqual({ skipSeats: true, skipEnqueue: false, venueGate: 'headless-waiting-engine' });
  });
});

describe('createVenueCrowdMotion', () => {
  it('allowed が false なら動かず、許可されても短い間隔では 1 回しか描かない', () => {
    const queue = [];
    let now = 0;
    let allowed = false;
    let drew = 0;
    const motion = createVenueCrowdMotion({
      raf: (cb) => {
        queue.push(cb);
        return queue.length;
      },
      caf: () => { queue.length = 0; },
      now: () => now,
      allowed: () => allowed,
      minFrameMs: 55,
      draw: () => { drew += 1; },
    });
    expect(motion.start()).toBe(false);
    allowed = true;
    expect(motion.start()).toBe(true);
    expect(queue).toHaveLength(1);
    queue.shift()();
    expect(drew).toBe(1);
    now += 10;
    queue.shift()();
    expect(drew).toBe(1);
    now += 55;
    queue.shift()();
    expect(drew).toBe(2);
    motion.stop();
    expect(queue).toHaveLength(0);
  });
});
