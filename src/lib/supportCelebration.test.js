import { describe, it, expect } from 'vitest';
import {
  pickCommentMilestoneCelebration,
  pickEventRankUpCelebration,
  pickGiftCountMilestoneCelebration,
  pickAdPointsMilestoneCelebration,
  pickAdAdvertiserCountMilestoneCelebration,
  pickAdPointsIncreaseCelebration,
  pickNicoadCommentCelebration,
  pickHighestCrossedMilestone,
  dropCountForCommentMilestone,
  commentMilestoneDurationMs,
  isSupportCelebrationAlreadyDone,
  markSupportCelebrationDone,
  celebratedKeysForLive,
  withCelebratedKeysForLive,
  COMMENT_MILESTONES
} from './supportCelebration.js';

describe('supportCelebration', () => {
  it('コメント件数の最高マイルストーンだけを返す', () => {
    expect(pickHighestCrossedMilestone(95, 105, COMMENT_MILESTONES)).toBe(100);
    const at100 = pickCommentMilestoneCelebration(95, 105);
    expect(at100?.dedupeKey).toBe('comment_100');
    expect(at100?.characterSet).toBe('mixed');
    expect(at100?.dropVariant).toBe('rinku_deluge');
    expect(at100?.message).toContain('アプリ記録');
    expect(pickCommentMilestoneCelebration(null, 100)).toBeNull();
    expect(pickCommentMilestoneCelebration(100, 100)).toBeNull();
  });

  it('1000件マイルストーンは大量のちっちゃいりんく', () => {
    const spec = pickCommentMilestoneCelebration(980, 1005);
    expect(spec?.dedupeKey).toBe('comment_1000');
    expect(dropCountForCommentMilestone(1000)).toBe(180);
    expect(commentMilestoneDurationMs(1000)).toBeGreaterThanOrEqual(6500);
    expect(spec?.dropVariant).toBe('rinku_deluge');
  });

  it('イベント順位 UP（数値が小さくなる）を検知する', () => {
    const spec = pickEventRankUpCelebration(7, 5);
    expect(spec?.kind).toBe('event_rank_up');
    expect(spec?.dedupeKey).toBe('event_rank_5');
    expect(spec?.message).toContain('7位 → 5位');
    expect(pickEventRankUpCelebration(5, 7)).toBeNull();
    expect(pickEventRankUpCelebration(null, 3)).toBeNull();
  });

  it('トップ3突入は mixed で強めの演出', () => {
    const spec = pickEventRankUpCelebration(4, 3);
    expect(spec?.characterSet).toBe('mixed');
    expect(spec?.dropCount).toBeGreaterThan(20);
  });

  it('ギフト件数マイルストーン', () => {
    expect(pickGiftCountMilestoneCelebration(0, 1)?.message).toContain('最初のギフト');
    expect(pickGiftCountMilestoneCelebration(9, 10)?.dedupeKey).toBe('gift_10');
    expect(pickGiftCountMilestoneCelebration(10, 10)).toBeNull();
  });

  it('ニコニ広告ptマイルストーン', () => {
    expect(pickAdPointsMilestoneCelebration(0, 1)?.message).toContain('最初のニコニ広告');
    expect(pickAdPointsMilestoneCelebration(9000, 12000)?.dedupeKey).toBe('ad_pts_10000');
    expect(pickAdPointsMilestoneCelebration(12000, 12000)).toBeNull();
  });

  it('広告主人数マイルストーン', () => {
    expect(pickAdAdvertiserCountMilestoneCelebration(0, 1)?.dedupeKey).toBe('ad_adv_1');
    expect(pickAdAdvertiserCountMilestoneCelebration(2, 5)?.message).toContain('5 人目');
  });

  it('累計ptの増加（マイルストーン未達）でも演出', () => {
    expect(pickAdPointsIncreaseCelebration(2200, 2300)?.message).toContain('+100');
    expect(pickAdPointsIncreaseCelebration(0, 1)).toBeNull();
    expect(pickAdPointsIncreaseCelebration(900, 1200)).toBeNull();
  });

  it('ニコニ広告コメントから演出', () => {
    const spec = pickNicoadCommentCelebration(
      { sender: 'テスト', point: 100 },
      'lv1|no:911'
    );
    expect(spec?.message).toContain('100 pt 広告');
    expect(spec?.dedupeKey).toBe('ad_comment_lv1|no:911');
  });

  it('dedupe キー管理', () => {
    expect(isSupportCelebrationAlreadyDone(['comment_100'], 'comment_100')).toBe(true);
    expect(markSupportCelebrationDone(['comment_50'], 'comment_100')).toEqual([
      'comment_50',
      'comment_100'
    ]);
    expect(celebratedKeysForLive({ lv1: ['a'] }, 'lv1')).toEqual(['a']);
    expect(
      withCelebratedKeysForLive({ lv1: ['a'] }, 'lv2', ['b'])
    ).toEqual({ lv1: ['a'], lv2: ['b'] });
  });
});
