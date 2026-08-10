import { describe, it, expect } from 'vitest';
import {
  createVenueMirrorIntakeState,
  observeVenueMirrorChange,
  observeVenueMirrorAccept,
  formatVenueMirrorIntakeLine
} from './venueMirrorIntakeDiag.js';

/**
 * ★この計器が答えるべき問い（2026-08-10・会場が完全一致しない件）:
 *   書き手は毎秒動いているのに会場の鏡が11分古い。なぜ更新が止まったのか。
 *   (a)通知が来ない / (b)キー不一致 / (c)関所で却下 のどれかを【名指し】する。
 */
describe('venueMirrorIntakeDiag', () => {
  it('観測ゼロなら1行も出さない(普段の速報を汚さない)', () => {
    expect(formatVenueMirrorIntakeLine(createVenueMirrorIntakeState(), 1000)).toBe('');
    expect(formatVenueMirrorIntakeLine(null, 1000)).toBe('');
  });

  it('★(a) 通知が一度も来ていないなら「購読が効いていない」と名指しする', () => {
    const s = createVenueMirrorIntakeState();
    // 鏡と無関係の onChanged だけが来ている状態
    observeVenueMirrorChange(s, { changedKeys: ['nls_other'], expectedKey: 'nls_lane_mirror_v2_lv1', matched: false });
    const line = formatVenueMirrorIntakeLine(s, 1000);
    expect(line).toContain('一度も届いていません');
    expect(line).toContain('購読が効いていない');
  });

  it('★(b) キー不一致なら liveId の食い違いを名指しし、期待/実際の両方を出す', () => {
    const s = createVenueMirrorIntakeState();
    observeVenueMirrorChange(s, {
      changedKeys: ['nls_lane_mirror_v2_lv999'],
      expectedKey: 'nls_lane_mirror_v2_lv111',
      matched: false
    });
    const line = formatVenueMirrorIntakeLine(s, 1000);
    expect(line).toContain('キーが一致しない');
    expect(line).toContain('nls_lane_mirror_v2_lv111'); // 期待
    expect(line).toContain('nls_lane_mirror_v2_lv999'); // 実際
    expect(line).toContain('liveId が食い違って');
  });

  it('★(c) 届いて一致しているのに関所が全部却下したらそれを名指しする', () => {
    const s = createVenueMirrorIntakeState();
    observeVenueMirrorChange(s, { changedKeys: ['nls_lane_mirror_v2_lv1'], expectedKey: 'nls_lane_mirror_v2_lv1', matched: true });
    observeVenueMirrorAccept(s, { accepted: false, reason: '段が無い' });
    const line = formatVenueMirrorIntakeLine(s, 1000);
    expect(line).toContain('関所で全部捨てられ');
    expect(line).toContain('段が無い');
  });

  it('★正常時は原因を名乗らない(採用できている)', () => {
    const s = createVenueMirrorIntakeState();
    observeVenueMirrorChange(s, { changedKeys: ['nls_lane_mirror_v2_lv1'], expectedKey: 'nls_lane_mirror_v2_lv1', matched: true });
    observeVenueMirrorAccept(s, { accepted: true, nowMs: 5000 });
    const line = formatVenueMirrorIntakeLine(s, 8000);
    expect(line).toContain('採用1');
    expect(line).toContain('最終採用3秒前');
    expect(line).not.toContain('★原因');
  });

  it('採用がゼロなら「まだ一度も採用していません」と出す', () => {
    const s = createVenueMirrorIntakeState();
    observeVenueMirrorChange(s, { changedKeys: ['nls_lane_mirror_v2_lv1'], expectedKey: 'nls_lane_mirror_v2_lv1', matched: true });
    expect(formatVenueMirrorIntakeLine(s, 1000)).toContain('まだ一度も採用していません');
  });

  it('無関係キーの変更は keyMissed に数えない(意味が薄れる)', () => {
    const s = createVenueMirrorIntakeState();
    observeVenueMirrorChange(s, { changedKeys: ['nls_panel_summary_lv1'], expectedKey: 'k', matched: false });
    expect(s.keyMissed).toBe(0);
    expect(s.changedEvents).toBe(1);
  });

  it('壊れた入力でも throw しない', () => {
    const s = createVenueMirrorIntakeState();
    expect(() => observeVenueMirrorChange(null, {})).not.toThrow();
    expect(() => observeVenueMirrorChange(s, null)).not.toThrow();
    expect(() => observeVenueMirrorAccept(s, null)).not.toThrow();
    expect(() => formatVenueMirrorIntakeLine(s, NaN)).not.toThrow();
  });
});
