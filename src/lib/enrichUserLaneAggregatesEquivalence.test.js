import { describe, it, expect } from 'vitest';
import { enrichUserLaneAggregatesWithProfileAndDisplay } from './userLaneCandidatesFromStorage.js';
import {
  pickBetterInterceptNickname,
  pickGiftRankDisplayNicknameWithUidFallback
} from './giftDisplayNickname.js';
import { isAvatarObservedInCommentProfileMap } from './popupAvatarResolver.js';

/**
 * enrichUserLaneAggregatesWithProfileAndDisplay の「ユーザーごとに全コメントを走査」(O(ユーザー×コメント))を
 * 「コメントを1回だけ userId で束ねる」(O(コメント+ユーザー))に変えた版が、元の実装と【出力まで同一】であることの固定。
 * 実機(2026-10-11)で、この関数の bestNicknameFromEntries が拡張プロセスの CPU の約2割(自分の時間10秒/52秒)を使っていた。
 * 基準(reference)は変更前の実装そのもの(テスト内に写した)。
 */
function rowCapturedAt(row) {
  const n = Number(row?.capturedAt);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function referenceEnrich(aggregates, displayEntries, profileMap) {
  if (!Array.isArray(aggregates) || aggregates.length === 0) {
    return Array.isArray(aggregates) ? aggregates : Object.freeze([]);
  }
  const entries = Array.isArray(displayEntries) ? displayEntries : [];
  const map = profileMap && typeof profileMap === 'object' && !Array.isArray(profileMap) ? profileMap : {};
  function bestNicknameFromEntries(uid) {
    const id = String(uid || '').trim();
    if (!id || !entries.length) return '';
    const hits = [];
    for (const e of entries) {
      if (String(e?.userId ?? '').trim() !== id) continue;
      hits.push(e);
    }
    if (!hits.length) return '';
    hits.sort((a, b) => rowCapturedAt(a) - rowCapturedAt(b));
    let nick = '';
    for (const e of hits) {
      const n = String(e?.nickname ?? '').trim();
      if (!n) continue;
      nick = pickBetterInterceptNickname(id, nick, n);
    }
    return nick;
  }
  let anyChange = false;
  const built = aggregates.map((agg) => {
    const uid = String(agg.userId || '').trim();
    const stored = String(agg.nickname || '').trim();
    const intercept = String(map[uid]?.nickname ?? '').trim();
    const fromDisplay = bestNicknameFromEntries(uid);
    const merged = pickGiftRankDisplayNicknameWithUidFallback(uid, stored, fromDisplay, intercept);
    const observedNext = Boolean(agg.avatarObserved) || isAvatarObservedInCommentProfileMap(uid, map);
    const nickChanged = merged !== stored;
    const observedChanged = observedNext !== Boolean(agg.avatarObserved);
    if (!nickChanged && !observedChanged) return agg;
    anyChange = true;
    return Object.freeze({ ...agg, nickname: nickChanged ? merged : agg.nickname, avatarObserved: observedNext });
  });
  if (!anyChange) return aggregates;
  return Object.freeze(built);
}

/** 決定的な疑似乱数(mulberry32) */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

function makeCase(seed) {
  const r = rng(seed);
  const uids = ['1001', '1002', ' 1003 ', '2004', 'a:xyz', 'a:abc', '', '  ', '4444444', 99999];
  const nicks = ['', ' ', 'たろう', 'ユーザー', 'ゆうこ', '匿名', 'ABC', '  はなこ  ', 'user 1001', 'a:xyz', null, undefined, 42];
  const entries = [];
  const nE = Math.floor(r() * 60);
  for (let i = 0; i < nE; i += 1) {
    entries.push({
      userId: pick(r, [...uids, null, undefined]),
      nickname: pick(r, nicks),
      // 同時刻(同点)・0・負・NaN を混ぜる=安定ソートの順序も一致させる
      capturedAt: pick(r, [0, -5, NaN, 100, 100, 100, 200, 300, Math.floor(r() * 1000), '150', null])
    });
  }
  const aggregates = [];
  const nA = Math.floor(r() * 12);
  for (let i = 0; i < nA; i += 1) {
    aggregates.push(
      Object.freeze({
        userId: pick(r, uids),
        nickname: pick(r, nicks),
        avatarUrl: pick(r, ['', 'https://example.com/a.jpg']),
        avatarObserved: r() < 0.3,
        liveId: 'lv1',
        commentCount: Math.floor(r() * 9),
        giftCount: Math.floor(r() * 3),
        recentTexts: Object.freeze(['x']),
        _laneSortAt: Math.floor(r() * 1000)
      })
    );
  }
  const profile =
    r() < 0.15
      ? null
      : Object.fromEntries(
          uids
            .filter(() => r() < 0.5)
            .map((u) => [String(u).trim(), { nickname: pick(r, nicks), avatarUrl: pick(r, ['', 'https://example.com/p.jpg']) }])
        );
  return { entries: r() < 0.05 ? null : entries, aggregates, profile };
}

describe('enrichUserLaneAggregatesWithProfileAndDisplay: 索引化しても出力は元と同一', () => {
  it('★ランダム 1,500 ケースで、新旧の出力が(中身も「変更なしなら同じ配列」という同一性も)一致する', () => {
    for (let seed = 1; seed <= 1500; seed += 1) {
      const { entries, aggregates, profile } = makeCase(seed);
      const before = JSON.stringify(entries);
      const got = enrichUserLaneAggregatesWithProfileAndDisplay(aggregates, entries, profile);
      const want = referenceEnrich(aggregates, entries, profile);
      expect(JSON.stringify(got), `seed ${seed}`).toBe(JSON.stringify(want));
      expect(got === aggregates, `identity seed ${seed}`).toBe(want === aggregates);
      expect(JSON.stringify(entries), `entries mutated seed ${seed}`).toBe(before); // 入力を壊さない
    }
  });

  it('入力の配列(コメント行)の順序を変えない(索引化の並べ替えが元の配列に及ばない)', () => {
    const entries = [
      { userId: '1', nickname: 'b', capturedAt: 300 },
      { userId: '1', nickname: 'a', capturedAt: 100 }
    ];
    const snapshot = JSON.stringify(entries);
    enrichUserLaneAggregatesWithProfileAndDisplay(
      [{ userId: '1', nickname: '', avatarUrl: '', avatarObserved: false, liveId: 'lv1' }],
      entries,
      {}
    );
    expect(JSON.stringify(entries)).toBe(snapshot);
  });
});

describe('性能: ユーザー×コメントの総当たりをしない', () => {
  it('★3,000人×30,000件が 250ms 以内(総当たりだと約9千万回の走査で超える)', () => {
    const U = 3000;
    const E = 30000;
    const entries = [];
    for (let i = 0; i < E; i += 1) entries.push({ userId: String(1000 + (i % U)), nickname: 'n' + (i % 7), capturedAt: i + 1 });
    const aggregates = [];
    for (let u = 0; u < U; u += 1) {
      aggregates.push(Object.freeze({ userId: String(1000 + u), nickname: '', avatarUrl: '', avatarObserved: false, liveId: 'lv1' }));
    }
    const t0 = performance.now();
    const out = enrichUserLaneAggregatesWithProfileAndDisplay(aggregates, entries, {});
    const ms = performance.now() - t0;
    expect(out.length).toBe(U);
    expect(ms).toBeLessThan(250);
  });
});
