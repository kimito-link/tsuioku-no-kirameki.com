import { describe, expect, it, vi } from 'vitest';
import { createVenueLiveCommentHandler } from './venueLiveCommentRoute.js';

function fixture(open) {
  const processSpeechRows = vi.fn();
  const touchRoster = vi.fn();
  const scheduleRosterCommit = vi.fn();
  const resetSpeechTracking = vi.fn();
  const onLiveComments = createVenueLiveCommentHandler({
    currentLiveId: () => 'lv1', speechLiveId: () => 'lv1', resetSpeechTracking,
    liveFeedRows: (rows) => rows.filter((r) => Number(r.commentNo) > 0),
    processSpeechRows, isOpen: () => open, rosterDriven: () => true,
    now: () => 1234, touchRoster, scheduleRosterCommit
  });
  return { onLiveComments, processSpeechRows, touchRoster, scheduleRosterCommit, resetSpeechTracking };
}

describe('会場の実 onLiveComments 経路', () => {
  it('閉会場でも音声を含む processSpeechRows へ渡し、描画 roster だけ止める', () => {
    const f = fixture(false);
    f.onLiveComments('lv1', [{ commentNo: 1, text: '閉じても読む' }], 'ndgr');
    expect(f.processSpeechRows).toHaveBeenCalledWith([{ commentNo: 1, text: '閉じても読む' }], 'live', 'ndgr');
    expect(f.touchRoster).not.toHaveBeenCalled();
    expect(f.scheduleRosterCommit).not.toHaveBeenCalled();
  });

  it('開会場では同じ音声経路の後に在席更新も行う', () => {
    const f = fixture(true);
    const row = { commentNo: 2, userId: 'u2', text: '開いた会場' };
    f.onLiveComments('lv1', [row], 'ndgr');
    expect(f.processSpeechRows).toHaveBeenCalledWith([row], 'live', 'ndgr');
    expect(f.touchRoster).toHaveBeenCalledWith(row, 1234);
    expect(f.scheduleRosterCommit).toHaveBeenCalledTimes(1);
  });

  it('別配信と本文の無い行は実処理へ流さない', () => {
    const f = fixture(false);
    f.onLiveComments('lv2', [{ commentNo: 1, text: '別配信' }]);
    f.onLiveComments('lv1', [{ commentNo: 0, text: '' }]);
    expect(f.processSpeechRows).not.toHaveBeenCalled();
  });
});
