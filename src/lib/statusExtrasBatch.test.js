import { describe, it, expect } from 'vitest';
import { EXTRAS_BATCH_KEYS, pickExtrasBatchValues } from './statusExtrasBatch.js';
import { KEY_VOICE_DIAG } from './voiceDiagKey.js';
import { KEY_VENUE_SEATS_DIAG } from './venueSeatsDiagKey.js';
import { KEY_REPORT_PREVIEW, REPORT_PREVIEW_MAX_AGE_MS } from './reportPreviewKey.js';
import { KEY_LANE_DIAG } from './laneDiagKey.js';
import { KEY_LANE_MIRROR } from './laneMirrorKey.js';
import { KEY_STAT_CARDS_MIRROR } from './statCardsMirrorKey.js';
import { KEY_NORTH_STAR_MIRROR } from './northStarMirrorKey.js';
import { KEY_LIVEVIEW_PUBLISH_OUTCOME } from './liveviewPublishOutcomeKey.js';
import { KEY_COMMENT_TIMELINE_MIRROR } from './commentTimelineMirrorKey.js';
import { KEY_PREVIEW_RENDER_ACK } from './previewRenderAckKey.js';
import { KEY_BACKFILL_LIVE_METRIC } from './storageKeys.js';
import { KEY_GIFT_EFFECT_DIAG } from './giftEffectDiagKey.js';
import { KEY_MILESTONE_EFFECT_DIAG } from './milestoneEffectDiagKey.js';
import { KEY_VOICE_EFFECT_DIAG } from './voiceEffectDiagKey.js';
import { KEY_BGM_PHASE_DIAG } from './bgmPhaseDiagKey.js';
import { KEY_OP_SOUND_EFFECT_DIAG } from './opSoundEffectDiagKey.js';
import { KEY_COMMENT_POST_DIAG } from './commentPostDiagKey.js';
import { KEY_INSTANT_PUSH_DIAG } from './instantPushDiagKey.js';

describe('EXTRAS_BATCH_KEYS', () => {
  // 会議設計時点の列挙(16キー)+ v0.1.1083 の commentPostDiag + v0.1.1092 の instantPushDiag で実際は18キー。
  //   「漏れなく統合したか」を人力の数え間違いに頼らず固定するため、実装済みの全キーを列挙して突合する。
  it('18キーすべてを含む(v0.1.1083 の commentPostDiag / v0.1.1092 の instantPushDiag も含む)', () => {
    const expectedKeys = [
      KEY_VOICE_DIAG,
      KEY_VENUE_SEATS_DIAG,
      KEY_REPORT_PREVIEW,
      KEY_LANE_DIAG,
      KEY_LANE_MIRROR,
      KEY_STAT_CARDS_MIRROR,
      KEY_NORTH_STAR_MIRROR,
      KEY_LIVEVIEW_PUBLISH_OUTCOME,
      KEY_COMMENT_TIMELINE_MIRROR,
      KEY_PREVIEW_RENDER_ACK,
      KEY_BACKFILL_LIVE_METRIC,
      KEY_GIFT_EFFECT_DIAG,
      KEY_MILESTONE_EFFECT_DIAG,
      KEY_VOICE_EFFECT_DIAG,
      KEY_BGM_PHASE_DIAG,
      KEY_OP_SOUND_EFFECT_DIAG,
      KEY_COMMENT_POST_DIAG,
      KEY_INSTANT_PUSH_DIAG
    ];
    expect(expectedKeys).toHaveLength(18);
    expect(EXTRAS_BATCH_KEYS).toHaveLength(18);
    expect(EXTRAS_BATCH_KEYS).toEqual(expect.arrayContaining(expectedKeys));
  });

  it('重複キーが無い(誤って同じキーを二重統合していない)', () => {
    expect(new Set(EXTRAS_BATCH_KEYS).size).toBe(EXTRAS_BATCH_KEYS.length);
  });
});

describe('pickExtrasBatchValues', () => {
  const NOW = 1_000_000;

  it('bag に全キーが揃っていれば全項目を取り出す', () => {
    const bag = {
      [KEY_VOICE_DIAG]: { a: 1 },
      [KEY_VENUE_SEATS_DIAG]: { b: 2 },
      [KEY_REPORT_PREVIEW]: { at: NOW, kpi: 3 },
      [KEY_LANE_DIAG]: { c: 4 },
      [KEY_LANE_MIRROR]: { d: 5 },
      [KEY_STAT_CARDS_MIRROR]: { e: 6 },
      [KEY_NORTH_STAR_MIRROR]: { f: 7 },
      [KEY_LIVEVIEW_PUBLISH_OUTCOME]: { g: 8 },
      [KEY_COMMENT_TIMELINE_MIRROR]: { h: 9 },
      [KEY_PREVIEW_RENDER_ACK]: { i: 10 },
      [KEY_BACKFILL_LIVE_METRIC]: { j: 11 },
      [KEY_GIFT_EFFECT_DIAG]: { k: 12 },
      [KEY_MILESTONE_EFFECT_DIAG]: { l: 13 },
      [KEY_VOICE_EFFECT_DIAG]: { m: 14 },
      [KEY_BGM_PHASE_DIAG]: { n: 15 },
      [KEY_OP_SOUND_EFFECT_DIAG]: { o: 16 },
      [KEY_COMMENT_POST_DIAG]: { p: 17 },
      [KEY_INSTANT_PUSH_DIAG]: { q: 18 }
    };
    const picked = pickExtrasBatchValues(bag, NOW);
    expect(picked.voiceDiag).toEqual({ a: 1 });
    expect(picked.venueSeatsDiag).toEqual({ b: 2 });
    expect(picked.reportPreview).toEqual({ at: NOW, kpi: 3 });
    expect(picked.laneDiag).toEqual({ c: 4 });
    expect(picked.laneMirror).toEqual({ d: 5 });
    expect(picked.statCardsMirror).toEqual({ e: 6 });
    expect(picked.northStarMirror).toEqual({ f: 7 });
    expect(picked.publishOutcomeRec).toEqual({ g: 8 });
    expect(picked.commentTimelineMirror).toEqual({ h: 9 });
    expect(picked.previewRenderAck).toEqual({ i: 10 });
    expect(picked.backfillLiveMetric).toEqual({ j: 11 });
    expect(picked.giftEffectDiag).toEqual({ k: 12 });
    expect(picked.milestoneEffectDiag).toEqual({ l: 13 });
    expect(picked.voiceEffectDiag).toEqual({ m: 14 });
    expect(picked.bgmPhaseDiag).toEqual({ n: 15 });
    expect(picked.opSoundEffectDiag).toEqual({ o: 16 });
    expect(picked.commentPostDiag).toEqual({ p: 17 });
    expect(picked.instantPushDiag).toEqual({ q: 18 });
  });

  it('欠損キーは null(各 loadXxxSafe の bag?.[KEY] || null と同値)', () => {
    const picked = pickExtrasBatchValues({}, NOW);
    expect(picked.voiceDiag).toBeNull();
    expect(picked.venueSeatsDiag).toBeNull();
    expect(picked.reportPreview).toBeNull();
    expect(picked.laneDiag).toBeNull();
    expect(picked.laneMirror).toBeNull();
    expect(picked.statCardsMirror).toBeNull();
    expect(picked.northStarMirror).toBeNull();
    expect(picked.publishOutcomeRec).toBeNull();
    expect(picked.commentTimelineMirror).toBeNull();
    expect(picked.previewRenderAck).toBeNull();
    expect(picked.backfillLiveMetric).toBeNull();
    expect(picked.giftEffectDiag).toBeNull();
    expect(picked.milestoneEffectDiag).toBeNull();
    expect(picked.voiceEffectDiag).toBeNull();
    expect(picked.bgmPhaseDiag).toBeNull();
    expect(picked.opSoundEffectDiag).toBeNull();
    expect(picked.commentPostDiag).toBeNull();
    expect(picked.instantPushDiag).toBeNull();
  });

  it('bag が undefined/null/非オブジェクトでも安全(全項目 null)', () => {
    for (const bad of [undefined, null, 42, 'x', []]) {
      const picked = pickExtrasBatchValues(bad, NOW);
      expect(picked.voiceDiag).toBeNull();
      expect(picked.reportPreview).toBeNull();
      expect(picked.commentPostDiag).toBeNull();
    }
  });

  describe('reportPreview の鮮度判定(isReportPreviewFresh 相当)', () => {
    it('新しい(maxAge 以内)レコードはそのまま通す', () => {
      const rec = { at: NOW, kpi: 'x' };
      const picked = pickExtrasBatchValues({ [KEY_REPORT_PREVIEW]: rec }, NOW + 1000);
      expect(picked.reportPreview).toEqual(rec);
    });

    it('at ちょうど maxAge 経過は境界含みで通す(isReportPreviewFresh は <=)', () => {
      const rec = { at: NOW };
      const picked = pickExtrasBatchValues(
        { [KEY_REPORT_PREVIEW]: rec },
        NOW + REPORT_PREVIEW_MAX_AGE_MS
      );
      expect(picked.reportPreview).toEqual(rec);
    });

    it('maxAge を超えて古いレコードは null(表示しない)', () => {
      const rec = { at: NOW };
      const picked = pickExtrasBatchValues(
        { [KEY_REPORT_PREVIEW]: rec },
        NOW + REPORT_PREVIEW_MAX_AGE_MS + 1
      );
      expect(picked.reportPreview).toBeNull();
    });

    it('at 欠損/0以下のレコードは null', () => {
      expect(pickExtrasBatchValues({ [KEY_REPORT_PREVIEW]: {} }, NOW).reportPreview).toBeNull();
      expect(
        pickExtrasBatchValues({ [KEY_REPORT_PREVIEW]: { at: 0 } }, NOW).reportPreview
      ).toBeNull();
      expect(
        pickExtrasBatchValues({ [KEY_REPORT_PREVIEW]: { at: -5 } }, NOW).reportPreview
      ).toBeNull();
    });

    it('reportPreview 自体が欠損なら null', () => {
      expect(pickExtrasBatchValues({}, NOW).reportPreview).toBeNull();
    });
  });
});
