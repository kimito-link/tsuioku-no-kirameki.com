import { describe, expect, it } from 'vitest';
import {
  RANK_STRIP_COMMENT_HEADING,
  RANK_STRIP_COMMENT_BADGE,
  RANK_STRIP_COMMENT_NOTE,
  RANK_STRIP_COMMENT_EMPTY_NOTE,
  RANK_STRIP_GIFT_HEADING,
  RANK_STRIP_GIFT_BADGE,
  RANK_STRIP_GIFT_NOTE,
  buildRankStripPillarRowHtml
} from './rankStripSectionLabels.js';

describe('rankStripSectionLabels', () => {
  it('コメント帯の注記にギフト帯との分離が書かれている', () => {
    expect(RANK_STRIP_COMMENT_NOTE).toMatch(/ギフト/);
    expect(RANK_STRIP_COMMENT_NOTE).toMatch(/別集計/);
  });

  it('ギフト帯の注記にコメント帯との分離が書かれている', () => {
    expect(RANK_STRIP_GIFT_NOTE).toMatch(/応援コメント/);
    expect(RANK_STRIP_GIFT_NOTE).toMatch(/別集計/);
  });

  it('見出しとバッジは空でないプレーン文言', () => {
    expect(RANK_STRIP_COMMENT_HEADING.length).toBeGreaterThan(0);
    expect(RANK_STRIP_COMMENT_BADGE.length).toBeGreaterThan(0);
    expect(RANK_STRIP_GIFT_HEADING.length).toBeGreaterThan(0);
    expect(RANK_STRIP_GIFT_BADGE.length).toBeGreaterThan(0);
    for (const s of [
      RANK_STRIP_COMMENT_NOTE,
      RANK_STRIP_COMMENT_EMPTY_NOTE,
      RANK_STRIP_GIFT_NOTE
    ]) {
      expect(s).not.toMatch(/</);
    }
  });

  it('buildRankStripPillarRowHtml: comments / gifts でクラスと文言が切り替わる', () => {
    const c = buildRankStripPillarRowHtml('comments');
    expect(c).toContain('nl-rank-strip-pillar--comments');
    expect(c).toContain(RANK_STRIP_COMMENT_HEADING);
    expect(c).toContain(RANK_STRIP_COMMENT_BADGE);
    expect(c).not.toContain('nl-rank-strip-pillar--gifts');

    const g = buildRankStripPillarRowHtml('gifts');
    expect(g).toContain('nl-rank-strip-pillar--gifts');
    expect(g).toContain(RANK_STRIP_GIFT_HEADING);
    expect(g).toContain(RANK_STRIP_GIFT_BADGE);
  });
});
