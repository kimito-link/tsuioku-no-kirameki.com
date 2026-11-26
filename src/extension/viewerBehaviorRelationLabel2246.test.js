// v0.1.2246: 動画ページの顔ごとの「記録がまだない」を出さない。なじみ／初めては出す。ライブは従来どおり。
import { describe, expect, it } from 'vitest';
import { viewerBehaviorRowsToLaneBuckets } from './viewerBehaviorLiveLayout.js';
import { viewerRelationLabel } from '../lib/viewerBehavior.js';

const row = (id, relation, extra = {}) => ({
  id, name: id, avatarUrl: '', relation, relationLabel: viewerRelationLabel(relation), commentCount: 1, ...extra,
});
const idLines = (b) => [...b.link, ...b.gift, ...b.ad, ...b.konta, ...b.tanu].map((i) => i.meta.idLine);

describe('顔の上の関係の札 (0.1.2246)', () => {
  it('動画: 記録がまだない は空、なじみ／初めて は出す', () => {
    const b = viewerBehaviorRowsToLaneBuckets({ contentKind: 'video', rows: [row('a', 'unknown'), row('b', 'new'), row('c', 'regular')] });
    const lines = idLines(b);
    expect(lines).toContain('');
    expect(lines).toContain('初めて');
    expect(lines).toContain('なじみ');
    expect(lines.join('|')).not.toContain('記録がまだない');
  });

  it('動画: 記録がまだない人のギフトや匿名の札は残す', () => {
    const b = viewerBehaviorRowsToLaneBuckets({
      contentKind: 'video',
      rows: [row('g', 'unknown', { giftCount: 1 }), { ...row('', 'unknown'), isAnonymous: true, relationLabel: '匿名' }],
    });
    expect(idLines(b)).toEqual(expect.arrayContaining(['ギフト', '匿名']));
  });

  it('ライブ: 記録がまだない は従来どおり出す', () => {
    const b = viewerBehaviorRowsToLaneBuckets({ contentKind: 'live', rows: [row('a', 'unknown'), row('b', 'new')] });
    expect(idLines(b)).toEqual(expect.arrayContaining(['記録がまだない', '初めて']));
  });
});
