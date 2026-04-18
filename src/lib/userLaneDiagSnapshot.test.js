import { describe, it, expect } from 'vitest';
import { buildUserLaneDiagSnapshot } from './userLaneDiagSnapshot.js';

describe('buildUserLaneDiagSnapshot contract', () => {
  it('D1: state={} でも throw せず、counts は既定 0 shape を返す', () => {
    /** @type {ReturnType<typeof buildUserLaneDiagSnapshot>|undefined} */
    let snapshot;
    expect(() => {
      snapshot = buildUserLaneDiagSnapshot({});
    }).not.toThrow();
    expect(snapshot).toBeTruthy();
    expect(snapshot?.counts).toEqual({
      storageRows: 0,
      entries: 0,
      laneAggregates: 0,
      observedUsers: 0
    });
  });

  it('D2: storageRowsForCurrentLive が 7 件なら counts=7, samples は先頭 5 件に truncate', () => {
    const storageRowsForCurrentLive = Array.from({ length: 7 }, (_, idx) => ({
      liveId: 'lv123',
      userId: `${idx + 1}`,
      avatarObserved: idx % 2 === 0
    }));
    const snapshot = buildUserLaneDiagSnapshot({ storageRowsForCurrentLive });
    expect(snapshot.counts.storageRows).toBe(7);
    expect(snapshot.samples.storageRows).toHaveLength(5);
  });

  it("D3: state.liveId は meta.liveId で正規化（'123'→'lv123', 'LV999'→'lv999'）", () => {
    const s1 = buildUserLaneDiagSnapshot({ liveId: '123' });
    const s2 = buildUserLaneDiagSnapshot({ liveId: 'LV999' });
    expect(s1.meta.liveId).toBe('lv123');
    expect(s2.meta.liveId).toBe('lv999');
  });

  it('D4: laneAggregates に avatarObserved:true が 3 件なら counts/invariants が一致', () => {
    const laneAggregates = [
      { userId: '1', avatarObserved: true },
      { userId: '2', avatarObserved: true },
      { userId: '3', avatarObserved: true },
      { userId: '4', avatarObserved: false }
    ];
    const snapshot = buildUserLaneDiagSnapshot({ laneAggregates });
    expect(snapshot.counts.observedUsers).toBe(3);
    expect(snapshot.invariants.observedExists).toBe(true);
  });

  it('D5: 直下キーと samples 直下キーの必須セットが常に揃う', () => {
    const snapshot = buildUserLaneDiagSnapshot({});
    for (const key of ['meta', 'counts', 'liveIdCheck', 'samples', 'invariants']) {
      expect(snapshot).toHaveProperty(key);
    }
    for (const key of ['storageRows', 'laneAggregates', 'entries']) {
      expect(snapshot.samples).toHaveProperty(key);
    }
  });
});
