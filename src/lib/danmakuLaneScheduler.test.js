import { describe, it, expect } from 'vitest';
import {
  createDanmakuSchedulerState,
  normalizeDanmakuText,
  computeRowSpeed,
  admitComment,
  retireRow,
  shouldBurstDanmaku,
} from './danmakuLaneScheduler.js';

describe('normalizeDanmakuText', () => {
  it('空白除去・小文字化', () => {
    expect(normalizeDanmakuText('  Na イス ！ ')).toBe('naイス！');
    expect(normalizeDanmakuText(null)).toBe('');
  });
});

describe('computeRowSpeed', () => {
  it('長文ほど duration が長い(読み切れる)', () => {
    const short = computeRowSpeed('草');
    const long = computeRowSpeed('これはとても長いコメントなのでゆっくり流れてほしい文章です');
    expect(long).toBeGreaterThan(short);
  });
  it('maxMs で頭打ち', () => {
    const huge = computeRowSpeed('あ'.repeat(1000), { maxMs: 16000 });
    expect(huge).toBe(16000);
  });
});

describe('admitComment cap厳守(白化/重さの回帰ガード)', () => {
  it('1000件流し込んでも onScreen は maxOnScreen 以下', () => {
    let state = createDanmakuSchedulerState();
    for (let i = 0; i < 1000; i += 1) {
      const r = admitComment(state, { id: `c${i}`, text: `コメント${i}` }, 1000 + i, {
        maxOnScreen: 8,
      });
      state = r.state;
    }
    expect(state.onScreen.length).toBeLessThanOrEqual(8);
    expect(state.onScreen.length).toBe(8);
  });
  it('超過分は最古から evicted で返る', () => {
    let state = createDanmakuSchedulerState();
    let lastEvicted = [];
    for (let i = 0; i < 10; i += 1) {
      const r = admitComment(state, { id: `c${i}`, text: 'x' }, 1000 + i, { maxOnScreen: 3 });
      state = r.state;
      lastEvicted = r.evicted;
    }
    expect(state.onScreen.length).toBe(3);
    expect(lastEvicted.length).toBe(1);
    expect(lastEvicted[0].id).toBe('c6'); // 直近3=c7,c8,c9 なので c6 が落ちる
  });
  it('state は in-place 変更されない(純関数)', () => {
    const state = createDanmakuSchedulerState();
    const r = admitComment(state, { id: 'a', text: 'a' }, 1, { maxOnScreen: 2 });
    expect(state.onScreen.length).toBe(0); // 元 state 不変
    expect(r.state.onScreen.length).toBe(1);
  });
});

describe('pickLane レーン非衝突', () => {
  it('空きレーンを最小番号から埋める', () => {
    let state = createDanmakuSchedulerState();
    const lanes = [];
    for (let i = 0; i < 4; i += 1) {
      const r = admitComment(state, { id: `c${i}`, text: 'x' }, 1000 + i, {
        laneCount: 4,
        maxOnScreen: 8,
      });
      state = r.state;
      lanes.push(r.row.lane);
    }
    expect(lanes).toEqual([0, 1, 2, 3]); // 衝突せず別レーン
  });
  it('全レーン埋まったら最古レーンを再利用', () => {
    let state = createDanmakuSchedulerState();
    for (let i = 0; i < 2; i += 1) {
      state = admitComment(state, { id: `c${i}`, text: 'x' }, 1000 + i, {
        laneCount: 2,
        maxOnScreen: 8,
      }).state;
    }
    // lane0 が最古(admittedAt=1000) → 次は lane0 を再利用
    const r = admitComment(state, { id: 'c2', text: 'x' }, 1002, { laneCount: 2, maxOnScreen: 8 });
    expect(r.row.lane).toBe(0);
  });
});

describe('retireRow', () => {
  it('指定idを画面から外す', () => {
    let state = createDanmakuSchedulerState();
    state = admitComment(state, { id: 'a', text: 'a' }, 1, { maxOnScreen: 8 }).state;
    state = admitComment(state, { id: 'b', text: 'b' }, 2, { maxOnScreen: 8 }).state;
    state = retireRow(state, 'a');
    expect(state.onScreen.map((r) => r.id)).toEqual(['b']);
  });
});

describe('shouldBurstDanmaku 弾幕検出', () => {
  const feed = (texts, now = 1000) => {
    let state = createDanmakuSchedulerState();
    texts.forEach((t, i) => {
      state = admitComment(state, { id: `c${i}`, text: t }, now + i, { maxOnScreen: 50 }).state;
    });
    return state;
  };

  it('同一コメント4連で burst=true', () => {
    const state = feed(['草', '草', '草']);
    const r = shouldBurstDanmaku(state, '草', { threshold: 4 });
    expect(r.burst).toBe(true);
    expect(r.count).toBe(4); // 窓内3 + candidate1
  });
  it('無関係コメントは burst=false', () => {
    const state = feed(['あ', 'い', 'う']);
    expect(shouldBurstDanmaku(state, 'え', { threshold: 4 }).burst).toBe(false);
  });
  it('888 の伸縮は前方一致で数える', () => {
    const state = feed(['888', '88888', '8888888']);
    const r = shouldBurstDanmaku(state, '888', { threshold: 4 });
    expect(r.burst).toBe(true);
  });
  it('空テキストは burst しない', () => {
    const state = feed(['草', '草', '草']);
    expect(shouldBurstDanmaku(state, '', { threshold: 4 }).burst).toBe(false);
  });
  it('窓外の古いコメントは数えない', () => {
    let state = createDanmakuSchedulerState();
    // 古い3件(t=0)を入れ、窓(8000ms)外の now で判定
    ['草', '草', '草'].forEach((t, i) => {
      state = admitComment(state, { id: `c${i}`, text: t }, 0, {
        maxOnScreen: 50,
        burstWindowMs: 8000,
      }).state;
    });
    // 次のコメントを 20000ms に入れると古い3件は窓外に間引かれる
    const r2 = admitComment(state, { id: 'late', text: '草' }, 20000, {
      maxOnScreen: 50,
      burstWindowMs: 8000,
    });
    const r = shouldBurstDanmaku(r2.state, '草', { threshold: 4 });
    expect(r.burst).toBe(false); // 窓内は late の1件だけ
  });
});
