import { describe, it, expect } from 'vitest';
import {
  shouldSkipProvisionalCommentMirror,
  createCommentMirrorPublishGate
} from './commentMirrorPublishGate.js';

describe('shouldSkipProvisionalCommentMirror — 暫定30件で全件鏡を潰さない判定(v0.1.1018)', () => {
  it('provisional=false(全件由来)は常に出す(skip しない)', () => {
    expect(shouldSkipProvisionalCommentMirror({ provisional: false, liveId: 'lv1', lastFull: { liveId: 'lv1', at: 1000 }, nowMs: 1000, guardMs: 30000 })).toBe(false);
  });
  it('provisional で同一配信の全件鏡が最近ある=skip', () => {
    expect(shouldSkipProvisionalCommentMirror({ provisional: true, liveId: 'lv1', lastFull: { liveId: 'lv1', at: 1000 }, nowMs: 1000 + 10000, guardMs: 30000 })).toBe(true);
  });
  it('provisional でも全件鏡が古い(guard超)=出す', () => {
    expect(shouldSkipProvisionalCommentMirror({ provisional: true, liveId: 'lv1', lastFull: { liveId: 'lv1', at: 1000 }, nowMs: 1000 + 40000, guardMs: 30000 })).toBe(false);
  });
  it('provisional で全件鏡が別配信=出す(初回/切替救済)', () => {
    expect(shouldSkipProvisionalCommentMirror({ provisional: true, liveId: 'lv2', lastFull: { liveId: 'lv1', at: 1000 }, nowMs: 1000, guardMs: 30000 })).toBe(false);
  });
  it('provisional で全件鏡がまだ無い=出す', () => {
    expect(shouldSkipProvisionalCommentMirror({ provisional: true, liveId: 'lv1', lastFull: { liveId: '', at: 0 }, nowMs: 1000, guardMs: 30000 })).toBe(false);
  });
});

describe('createCommentMirrorPublishGate — 状態込みゲート(v0.1.1018)', () => {
  it('liveId 不正 or コメント無しは decide=false', () => {
    const g = createCommentMirrorPublishGate();
    expect(g.decide({ liveId: 'bad', hasComments: true, provisional: false, nowMs: 1 })).toBe(false);
    expect(g.decide({ liveId: 'lv1', hasComments: false, provisional: false, nowMs: 1 })).toBe(false);
  });
  it('全件→publish可、直後の暫定はguardで見送り、全件は min-gap 経過後に再度可', () => {
    const g = createCommentMirrorPublishGate({ guardMs: 30000, minGapMs: 3000 });
    // 1回目(全件): 可
    expect(g.decide({ liveId: 'lv1', hasComments: true, provisional: false, nowMs: 100000 })).toBe(true);
    // 直後の暫定30件: 全件鏡が最近ある=見送り
    expect(g.decide({ liveId: 'lv1', hasComments: true, provisional: true, nowMs: 101000 })).toBe(false);
    // min-gap 経過後の全件: 可(状態更新)
    expect(g.decide({ liveId: 'lv1', hasComments: true, provisional: false, nowMs: 104000 })).toBe(true);
  });
  it('min-gap 未満の連続 publish は見送る', () => {
    const g = createCommentMirrorPublishGate({ minGapMs: 3000 });
    expect(g.decide({ liveId: 'lv1', hasComments: true, provisional: false, nowMs: 100000 })).toBe(true);
    expect(g.decide({ liveId: 'lv1', hasComments: true, provisional: false, nowMs: 102000 })).toBe(false);
  });
  it('全件鏡がまだ無い初回は暫定でも publish 可(空より30件)', () => {
    const g = createCommentMirrorPublishGate();
    expect(g.decide({ liveId: 'lv1', hasComments: true, provisional: true, nowMs: 100000 })).toBe(true);
  });
});
