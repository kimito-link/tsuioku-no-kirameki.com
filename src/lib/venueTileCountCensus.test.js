import { describe, expect, it } from 'vitest';
import {
  VENUE_TILE_RECENT_CAP,
  createVenueTileCountState,
  noteVenueMirrorShrinkRefused,
  observeVenueTileCount,
  toVenueTileCountDiag
} from './venueTileCountCensus.js';

const obs = (st, tiles, origin = 'mirror', liveId = 'lv1', nowMs = 1_000_000) =>
  observeVenueTileCount(st, { liveId, tiles, origin, nowMs });

describe('観測なし', () => {
  it('★何も観測していなければ ⚪ 未観測(増え続けているとは言わない)', () => {
    const d = toVenueTileCountDiag(createVenueTileCountState(), 1_000_000);
    expect(d.verdict).toBe('idle');
    expect(d.line).toContain('会場の人数 ⚪');
    expect(d.line).toContain('未観測');
  });
});

describe('増えるだけは正常(ユーザー確定: 増えるのはいい)', () => {
  it('★0→10→50→90→120 と増えるだけなら ✅ で、減少0', () => {
    const st = createVenueTileCountState();
    for (const n of [0, 10, 50, 90, 90, 120]) obs(st, n);
    const d = toVenueTileCountDiag(st, 1_000_000);
    expect(d.verdict).toBe('ok');
    expect(d.drops).toBe(0);
    expect(d.line).toContain('会場の人数 ✅ 増え続けている(0→120枚');
  });

  it('★据え置きを何度観測しても「変化」を積まない(毎描画の呼び出しでも履歴が流れない)', () => {
    const st = createVenueTileCountState();
    obs(st, 50);
    for (let i = 0; i < 500; i += 1) obs(st, 50);
    expect(st.paints).toBe(501);
    expect(st.changes).toBe(1);
    expect(st.recent.length).toBe(1);
  });
});

describe('減ったら全部異常(方向を問わない・戻ってこなくても数える)', () => {
  it('★90→45 は 🔴 で、回数・最大の脱落・原因(供給元の切替)を名指しする', () => {
    const st = createVenueTileCountState();
    obs(st, 90, 'mirror', 'lv1', 1_000_000);
    obs(st, 45, 'fallback:staleHard', 'lv1', 1_010_000);
    const d = toVenueTileCountDiag(st, 1_020_000);
    expect(d.verdict).toBe('warn');
    expect(d.drops).toBe(1);
    expect(d.worstDrop).toBe(45);
    expect(d.worstFrom).toBe(90);
    expect(d.worstTo).toBe(45);
    expect(d.worstCause).toBe('mirror→fallback:staleHard');
    expect(d.line).toContain('🔴');
    expect(d.line).toContain('★減った1回(最大90→45枚=45枚減・原因 mirror→fallback:staleHard・10秒前)');
  });

  it('★1枚減るだけでも数える(閾値を設けない=「途中で減るのはだめ」)', () => {
    const st = createVenueTileCountState();
    obs(st, 10);
    obs(st, 9);
    expect(st.drops).toBe(1);
  });

  it('★減って戻っても(90→45→90)減った1回は消えない(累計)', () => {
    const st = createVenueTileCountState();
    obs(st, 90, 'mirror');
    obs(st, 45, 'fallback:empty');
    obs(st, 90, 'mirror');
    const d = toVenueTileCountDiag(st, 1_000_000);
    expect(d.drops).toBe(1);
    expect(d.verdict).toBe('warn');
  });

  it('★最大の脱落が更新される(小さい脱落の後に大きい脱落)', () => {
    const st = createVenueTileCountState();
    obs(st, 100, 'mirror');
    obs(st, 98, 'mirror-stale');
    obs(st, 100, 'mirror');
    obs(st, 20, 'fallback:absent');
    expect(st.drops).toBe(2);
    expect(st.worstDrop).toBe(80);
    expect(st.worstCause).toBe('mirror→fallback:absent');
  });

  it('★人数は同じでも供給元が替われば変化として積む(原因の手がかり)が、減少には数えない', () => {
    const st = createVenueTileCountState();
    obs(st, 50, 'mirror');
    obs(st, 50, 'mirror-stale');
    expect(st.changes).toBe(2);
    expect(st.drops).toBe(0);
  });
});

describe('配信が替わったら数え直す(切替は減少ではない)', () => {
  it('★lv1 で 90 → lv2 で 10 は減少ではない', () => {
    const st = createVenueTileCountState();
    obs(st, 90, 'mirror', 'lv1');
    obs(st, 10, 'mirror', 'lv2');
    expect(st.drops).toBe(0);
    expect(st.liveId).toBe('lv2');
    expect(toVenueTileCountDiag(st, 1_000_000).verdict).toBe('ok');
  });

  it('★liveId が取れない描画が挟まっても数え直さない(URL不明は切替ではない)', () => {
    const st = createVenueTileCountState();
    obs(st, 90, 'mirror', 'lv1');
    obs(st, 45, 'fallback:absent', '');
    expect(st.drops).toBe(1);
    expect(st.liveId).toBe('lv1');
  });
});

describe('直近の変化(有界)', () => {
  it('★変化の履歴は上限を超えない', () => {
    const st = createVenueTileCountState();
    for (let i = 1; i <= 50; i += 1) obs(st, i);
    expect(st.recent.length).toBe(VENUE_TILE_RECENT_CAP);
    expect(st.recent[st.recent.length - 1].tiles).toBe(50);
  });

  it('★行に「直近の変化」が出る(減った瞬間の前後が読める)', () => {
    const st = createVenueTileCountState();
    obs(st, 90, 'mirror', 'lv1', 1_000_000);
    obs(st, 40, 'fallback:empty', 'lv1', 1_005_000);
    const d = toVenueTileCountDiag(st, 1_010_000);
    expect(d.line).toContain('直近の変化: 90(mirror・10秒前) → 40(fallback:empty・5秒前)');
  });
});

describe('不正入力', () => {
  it('★NaN・負数・null でも落ちない(0扱い)', () => {
    const st = createVenueTileCountState();
    expect(() => observeVenueTileCount(st, { liveId: 'lv1', tiles: NaN, origin: '', nowMs: -1 })).not.toThrow();
    expect(() => observeVenueTileCount(st, null)).not.toThrow();
    expect(() => toVenueTileCountDiag(st, 0)).not.toThrow();
  });
});

describe('鏡の縮小を採らなかった回数', () => {
  it('★回数が行と構造化値に出る(0なら出ない)', () => {
    const st = createVenueTileCountState();
    obs(st, 50);
    expect(toVenueTileCountDiag(st, 1_000_000).line).not.toContain('縮んだ鏡');
    noteVenueMirrorShrinkRefused(st);
    noteVenueMirrorShrinkRefused(st);
    const d = toVenueTileCountDiag(st, 1_000_000);
    expect(d.shrinkRefused).toBe(2);
    expect(d.line).toContain('縮んだ鏡を採らなかった2回');
  });
});
