import { describe, it, expect } from 'vitest';
import {
  SELF_ACTION_CELEBRATION_MIN_GAP_MS,
  SELF_ACTION_GIFT_ZOOM_MIN_POINT,
  buildSelfAdCelebrationSpec,
  buildSelfCommentCelebrationSpec,
  buildSelfGiftCelebrationSpec,
  selfActionUsesGiftZoom,
  selfActionUsesAdPachinko,
  selfAdCelebrationAsPachinkoThrow,
  SELF_ACTION_AD_PACHINKO_MIN_POINT
} from './selfActionCelebration.js';

describe('selfActionCelebration', () => {
  it('コメント送信成功の軽量 spec を作る', () => {
    const spec = buildSelfCommentCelebrationSpec({ sessionDedupeKey: 'lv1:1' });
    expect(spec.kind).toBe('self_comment');
    expect(spec.message).toContain('コメント');
    expect(spec.durationMs).toBeGreaterThanOrEqual(1800);
    expect(spec.dropCount).toBeGreaterThanOrEqual(6);
    expect(spec.dropCount).toBeLessThanOrEqual(10);
    expect(spec.sessionDedupeKey).toBe('lv1:1');
  });

  it('本人ギフトは pt に応じて軽量またはズーム対象にする', () => {
    const small = buildSelfGiftCelebrationSpec({
      sender: 'りんく',
      item: '応援メガホン',
      point: 10,
      sessionDedupeKey: 'gift-small'
    });
    const medium = buildSelfGiftCelebrationSpec({
      sender: 'りんく',
      item: '応援メガホン',
      point: SELF_ACTION_GIFT_ZOOM_MIN_POINT,
      sessionDedupeKey: 'gift-medium'
    });
    expect(small.kind).toBe('self_gift');
    expect(small.message).toContain('ギフト');
    expect(selfActionUsesGiftZoom(small.kind, small.point)).toBe(false);
    expect(selfActionUsesGiftZoom(medium.kind, medium.point)).toBe(true);
    expect(medium.message).toContain(`${SELF_ACTION_GIFT_ZOOM_MIN_POINT}pt`);
  });

  it('本人広告 spec は pt と session dedupe を保持する', () => {
    const spec = buildSelfAdCelebrationSpec({
      sender: 'こん太',
      point: 1200,
      sessionDedupeKey: 'ad-comment-key'
    });
    expect(spec.kind).toBe('self_ad');
    expect(spec.message).toContain('1,200pt');
    expect(spec.sessionDedupeKey).toBe('ad-comment-key');
    expect(spec.dropCount).toBeGreaterThan(12);
  });

  it('30pt以上の本人広告はパチンコ風 ad_throw に載せ替え可能', () => {
    const spec = buildSelfAdCelebrationSpec({
      point: SELF_ACTION_AD_PACHINKO_MIN_POINT,
      sessionDedupeKey: 'ad-pachi'
    });
    expect(selfActionUsesAdPachinko(spec.kind, spec.point)).toBe(true);
    const pachi = selfAdCelebrationAsPachinkoThrow(spec);
    expect(pachi?.kind).toBe('ad_throw');
    expect(pachi?.dropVariant).toBe('rinku_deluge');
    expect(pachi?.dropCount).toBeGreaterThanOrEqual(16);
  });

  it('連投抑制の最小間隔は 2.5 秒', () => {
    expect(SELF_ACTION_CELEBRATION_MIN_GAP_MS).toBe(2500);
  });
});
