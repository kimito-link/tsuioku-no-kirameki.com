import { describe, expect, it } from 'vitest';
import { createBroadcasterUidTracker } from './broadcasterUidTracker.js';

const LID = 'lv1';

describe('createBroadcasterUidTracker', () => {
  it('初期状態は空(uid=空, confidence=0)', () => {
    const tracker = createBroadcasterUidTracker(() => 0);
    expect(tracker.current()).toMatchObject({ uid: '', confidence: 0, liveId: '' });
  });

  it('inferred 一意で uid を採用する(confidence=1)', () => {
    const tracker = createBroadcasterUidTracker(() => 100);
    const state = tracker.update({
      liveId: LID,
      entries: [{ userId: '142991637', nickname: 'アトミックおじさん' }],
      snapshot: { broadcasterName: 'アトミックおじさん' }
    });
    expect(state).toMatchObject({ uid: '142991637', confidence: 1, source: 'inferred' });
  });

  it('揺れ1→0: 候補が一瞬0件になっても保持を維持する(sticky の核心)', () => {
    const tracker = createBroadcasterUidTracker(() => 100);
    tracker.update({
      liveId: LID,
      entries: [{ userId: '142991637', nickname: 'アトミックおじさん' }],
      snapshot: { broadcasterName: 'アトミックおじさん' }
    });
    // 候補が消える(配信者コメントがまだ storage に反映されていない一瞬)。
    const state = tracker.update({
      liveId: LID,
      entries: [],
      snapshot: { broadcasterName: 'アトミックおじさん' }
    });
    expect(state.uid).toBe('142991637');
    expect(state.confidence).toBe(1);
    expect(state.diag.emptyStreak).toBe(1);
  });

  it('揺れ1→2候補: 同名の別ユーザーが増えて候補が2件(=inferred失敗)になっても保持を維持する', () => {
    const tracker = createBroadcasterUidTracker(() => 100);
    tracker.update({
      liveId: LID,
      entries: [{ userId: '142991637', nickname: 'アトミックおじさん' }],
      snapshot: { broadcasterName: 'アトミックおじさん' }
    });
    // 候補2件(matches.size!==1)は inferBroadcasterUserIdDetailed が source:'none' を返す
    // (規則4: inferred 空 = 保持維持)。emptyStreak が進む点は仕様どおり。
    const state = tracker.update({
      liveId: LID,
      entries: [
        { userId: '142991637', nickname: 'アトミックおじさん' },
        { userId: '999999', nickname: 'アトミックおじさん' }
      ],
      snapshot: { broadcasterName: 'アトミックおじさん' }
    });
    expect(state.uid).toBe('142991637');
    expect(state.confidence).toBe(1);
    expect(state.diag.emptyStreak).toBe(1);
  });

  it('異なる uid の inferred が来ても先勝ちで保持を維持し conflictCount を進める', () => {
    const tracker = createBroadcasterUidTracker(() => 100);
    tracker.update({
      liveId: LID,
      entries: [{ userId: '142991637', nickname: 'A' }],
      snapshot: { broadcasterName: 'A' }
    });
    const state = tracker.update({
      liveId: LID,
      entries: [{ userId: '55555555', nickname: 'A' }],
      snapshot: { broadcasterName: 'A' }
    });
    expect(state.uid).toBe('142991637');
    expect(state.diag.conflictCount).toBe(1);
  });

  it('liveId 切替で即時リセットする(前配信の uid を持ち越さない)', () => {
    const tracker = createBroadcasterUidTracker(() => 100);
    tracker.update({
      liveId: LID,
      entries: [{ userId: '142991637', nickname: 'A' }],
      snapshot: { broadcasterName: 'A' }
    });
    const state = tracker.update({
      liveId: 'lv2',
      entries: [],
      snapshot: {}
    });
    expect(state).toMatchObject({ uid: '', confidence: 0, liveId: 'lv2' });
  });

  it('conf=2(explicit)が後から出現すると保持を上書きする(矯正)', () => {
    const tracker = createBroadcasterUidTracker(() => 100);
    tracker.update({
      liveId: LID,
      entries: [{ userId: '142991637', nickname: 'A' }],
      snapshot: { broadcasterName: 'A' }
    });
    const state = tracker.update({
      liveId: LID,
      entries: [],
      snapshot: { broadcasterUserId: '99999999', broadcasterName: 'A' }
    });
    expect(state).toMatchObject({ uid: '99999999', confidence: 2, source: 'explicit' });
  });

  it('conf=2 確定後は inferred が異なる uid を出しても上書きされない', () => {
    const tracker = createBroadcasterUidTracker(() => 100);
    tracker.update({
      liveId: LID,
      entries: [],
      snapshot: { broadcasterUserId: '99999999' }
    });
    const state = tracker.update({
      liveId: LID,
      entries: [{ userId: '142991637', nickname: 'A' }],
      snapshot: { broadcasterName: 'A' }
    });
    expect(state).toMatchObject({ uid: '99999999', confidence: 2 });
  });

  it('pageUrl(confidence=2)も explicit と同様に無条件採用される', () => {
    const tracker = createBroadcasterUidTracker(() => 100);
    const state = tracker.update({
      liveId: LID,
      entries: [],
      snapshot: { broadcasterPageUrl: 'https://www.nicovideo.jp/user/142991637' }
    });
    expect(state).toMatchObject({ uid: '142991637', confidence: 2, source: 'pageUrl' });
  });
});
