import { describe, it, expect } from 'vitest';
import {
  rectsApproxEqual,
  createFirstPaintGateState,
  observeFirstPaintFrame
} from './inlineFirstPaintGate.js';

const R = (left, top, width, height) => ({ left, top, width, height });

describe('rectsApproxEqual', () => {
  it('許容差以内なら true', () => {
    expect(rectsApproxEqual(R(100, 20, 640, 600), R(101, 19, 641, 599), 2)).toBe(true);
  });
  it('許容差を超えたら false', () => {
    expect(rectsApproxEqual(R(100, 20, 640, 600), R(110, 20, 640, 600), 2)).toBe(false);
  });
  it('どちらか null なら false', () => {
    expect(rectsApproxEqual(null, R(1, 1, 1, 1), 2)).toBe(false);
    expect(rectsApproxEqual(R(1, 1, 1, 1), null, 2)).toBe(false);
  });
});

describe('observeFirstPaintFrame', () => {
  const opts = { deadlineMs: 800, stableFrames: 2, tolerancePx: 2 };

  it('挿入先未解決の間は描画しない（waiting）', () => {
    const st = createFirstPaintGateState({ startedAtMs: 0 });
    const r = observeFirstPaintFrame(st, { insertionRect: null, nowMs: 100, ...opts });
    expect(r.shouldPaint).toBe(false);
    expect(r.reason).toBe('waiting');
  });

  it('挿入先が 2 フレーム連続で安定したら描画（stable）', () => {
    const st = createFirstPaintGateState({ startedAtMs: 0 });
    const f1 = observeFirstPaintFrame(st, { insertionRect: R(656, 18, 640, 600), nowMs: 200, ...opts });
    expect(f1.shouldPaint).toBe(false); // 1 フレーム目はまだ
    const f2 = observeFirstPaintFrame(st, { insertionRect: R(656, 18, 640, 600), nowMs: 216, ...opts });
    expect(f2.shouldPaint).toBe(true);
    expect(f2.reason).toBe('stable');
  });

  it('挿入先が動いている間（差し替え途中）は安定カウントが進まない', () => {
    const st = createFirstPaintGateState({ startedAtMs: 0 });
    observeFirstPaintFrame(st, { insertionRect: R(656, 18, 640, 600), nowMs: 100, ...opts });
    // 中間 rect（動いた）→ カウント再スタート
    const moved = observeFirstPaintFrame(st, { insertionRect: R(700, 18, 640, 600), nowMs: 116, ...opts });
    expect(moved.shouldPaint).toBe(false);
    // ここからまた 2 フレーム必要
    observeFirstPaintFrame(st, { insertionRect: R(700, 18, 640, 600), nowMs: 132, ...opts });
    // 2 フレーム目で確定
    expect(st.settled).toBe(true);
  });

  it('解決→未解決に戻るとカウントがリセット（leo-player 差し替え）', () => {
    const st = createFirstPaintGateState({ startedAtMs: 0 });
    observeFirstPaintFrame(st, { insertionRect: R(656, 18, 640, 600), nowMs: 100, ...opts });
    const lost = observeFirstPaintFrame(st, { insertionRect: null, nowMs: 116, ...opts });
    expect(lost.shouldPaint).toBe(false);
    expect(st.stableCount).toBe(0);
    expect(st.lastRect).toBe(null);
  });

  it('deadline 超過なら未解決でも描画（安全網）', () => {
    const st = createFirstPaintGateState({ startedAtMs: 0 });
    const r = observeFirstPaintFrame(st, { insertionRect: null, nowMs: 801, ...opts });
    expect(r.shouldPaint).toBe(true);
    expect(r.reason).toBe('deadline');
  });

  it('一度 settled になったら以後は常に描画 OK（already）', () => {
    const st = createFirstPaintGateState({ startedAtMs: 0 });
    observeFirstPaintFrame(st, { insertionRect: R(656, 18, 640, 600), nowMs: 100, ...opts });
    observeFirstPaintFrame(st, { insertionRect: R(656, 18, 640, 600), nowMs: 116, ...opts });
    expect(st.settled).toBe(true);
    const after = observeFirstPaintFrame(st, { insertionRect: null, nowMs: 200, ...opts });
    expect(after.shouldPaint).toBe(true);
    expect(after.reason).toBe('already');
  });

  it('state が無くても安全（描画 OK にフォールバック）', () => {
    const r = observeFirstPaintFrame(null, { insertionRect: null, nowMs: 0, ...opts });
    expect(r.shouldPaint).toBe(true);
  });

  it('実機タイムライン再現: 226ms 未解決→ 533ms 解決→2frame で stable', () => {
    const st = createFirstPaintGateState({ startedAtMs: 0 });
    // 226ms: leo-player 未完成
    expect(observeFirstPaintFrame(st, { insertionRect: null, nowMs: 226, ...opts }).shouldPaint).toBe(false);
    // 533ms: 解決（1 frame 目）
    expect(observeFirstPaintFrame(st, { insertionRect: R(656, 18, 640, 600), nowMs: 533, ...opts }).shouldPaint).toBe(false);
    // 549ms: 同一で 2 frame 目 → 確定
    const settled = observeFirstPaintFrame(st, { insertionRect: R(656, 18, 640, 600), nowMs: 549, ...opts });
    expect(settled.shouldPaint).toBe(true);
    expect(settled.reason).toBe('stable');
  });
});
