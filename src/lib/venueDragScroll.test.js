import { describe, it, expect } from 'vitest';
import {
  VENUE_DRAG_THRESHOLD_PX,
  initVenueDragState,
  beginVenueDrag,
  updateVenueDrag,
  endVenueDrag
} from './venueDragScroll.js';

describe('venueDragScroll', () => {
  it('初期状態は非アクティブ', () => {
    const s = initVenueDragState();
    expect(s.active).toBe(false);
    expect(s.moved).toBe(false);
  });

  it('beginVenueDrag で基準を記録する', () => {
    const s = beginVenueDrag(300, 50);
    expect(s.active).toBe(true);
    expect(s.startY).toBe(300);
    expect(s.startScrollTop).toBe(50);
    expect(s.moved).toBe(false);
  });

  it('下にドラッグすると scrollTop が減る(上のコンテンツが見える=指追従)', () => {
    const s = beginVenueDrag(300, 100);
    const { scrollTop } = updateVenueDrag(s, 340, 500); // 40px 下へ
    expect(scrollTop).toBe(60); // 100 - 40
  });

  it('上にドラッグすると scrollTop が増える', () => {
    const s = beginVenueDrag(300, 100);
    const { scrollTop } = updateVenueDrag(s, 260, 500); // 40px 上へ
    expect(scrollTop).toBe(140); // 100 + 40
  });

  it('scrollTop は 0..max にクランプされる', () => {
    const s = beginVenueDrag(300, 10);
    // 大きく下へ → 0 未満にならない
    expect(updateVenueDrag(s, 600, 500).scrollTop).toBe(0);
    const s2 = beginVenueDrag(300, 480);
    // 大きく上へ → max(500) を超えない
    expect(updateVenueDrag(s2, 0, 500).scrollTop).toBe(500);
  });

  it('閾値未満の移動は moved=false(クリック扱い・リンクを潰さない)', () => {
    const s = beginVenueDrag(300, 100);
    const r = updateVenueDrag(s, 303, 500); // 3px だけ
    expect(r.state.moved).toBe(false);
    expect(VENUE_DRAG_THRESHOLD_PX).toBe(6);
  });

  it('閾値以上の移動で moved=true(以後リンククリック抑止)', () => {
    const s = beginVenueDrag(300, 100);
    const r = updateVenueDrag(s, 310, 500); // 10px
    expect(r.state.moved).toBe(true);
  });

  it('moved は一度立つと維持される(戻しても)', () => {
    let s = beginVenueDrag(300, 100);
    s = updateVenueDrag(s, 320, 500).state; // moved=true
    const r = updateVenueDrag(s, 301, 500); // 1px に戻る
    expect(r.state.moved).toBe(true);
  });

  it('endVenueDrag: ドラッグした後は wasDrag=true・状態リセット', () => {
    let s = beginVenueDrag(300, 100);
    s = updateVenueDrag(s, 320, 500).state;
    const { state, wasDrag } = endVenueDrag(s);
    expect(wasDrag).toBe(true);
    expect(state.active).toBe(false);
  });

  it('endVenueDrag: ほぼ動かさず離した(クリック)は wasDrag=false', () => {
    let s = beginVenueDrag(300, 100);
    s = updateVenueDrag(s, 302, 500).state; // 2px
    const { wasDrag } = endVenueDrag(s);
    expect(wasDrag).toBe(false);
  });

  it('非アクティブ state への update は安全', () => {
    const r = updateVenueDrag(initVenueDragState(), 300, 500);
    expect(r.scrollTop).toBe(0);
  });
});
