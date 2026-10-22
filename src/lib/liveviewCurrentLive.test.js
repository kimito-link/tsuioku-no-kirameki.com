import { describe, expect, it } from 'vitest';
import { isLiveSwitched, pickLiveForCard, pickSnapshotLiveId } from './liveviewCurrentLive.js';

const lives = [
  { liveId: 'lv100', lv: 'lv100', title: 'A' },
  { liveId: 'lv200', lv: 'lv200', title: 'B' }
];

describe('スマホは1配信だけ映す(2026-10-21)', () => {
  it('★映す配信は鏡が指す配信(lives[0] ではない)', () => {
    const blob = { lives, laneMirror: { liveId: 'lv200' } };
    expect(pickSnapshotLiveId(blob)).toBe('lv200');
    expect(pickLiveForCard(blob).title).toBe('B');
  });
  it('鏡の優先順は 北極星 → 応援レーン → 数字カード', () => {
    expect(pickSnapshotLiveId({ northStarMirror: { liveId: 'LV1' }, laneMirror: { liveId: 'lv2' } })).toBe('lv1');
    expect(pickSnapshotLiveId({ statCardsMirror: { liveId: 'lv3' } })).toBe('lv3');
  });
  it('鏡が無いときは lives[0]・どちらも無ければ空', () => {
    expect(pickSnapshotLiveId({ lives })).toBe('lv100');
    expect(pickSnapshotLiveId({ lives: [{ lv: 'lv9' }] })).toBe('lv9');
    expect(pickSnapshotLiveId(null)).toBe('');
    expect(pickLiveForCard({ lives: [] })).toBe(null);
  });
  it('鏡の配信が lives に無ければ lives[0] で描く(空にしない)', () => {
    expect(pickLiveForCard({ lives, laneMirror: { liveId: 'lv999' } }).title).toBe('A');
  });
  it('切り替え判定は両方が有効な lv で違うときだけ', () => {
    expect(isLiveSwitched('lv1', 'lv2')).toBe(true);
    expect(isLiveSwitched('lv1', 'LV1')).toBe(false);
    expect(isLiveSwitched('', 'lv2')).toBe(false);
    expect(isLiveSwitched('lv1', '')).toBe(false);
    expect(isLiveSwitched('lv1', 'bad')).toBe(false);
  });
});
