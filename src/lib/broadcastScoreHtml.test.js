import { describe, it, expect } from 'vitest';
import { buildBroadcastScorePanelHtml } from './broadcastScoreHtml.js';

const sampleScore = { total: 78, rank: 'A', parts: { volume: 25, people: 20, pace: 18, heat: 15 } };

describe('buildBroadcastScorePanelHtml', () => {
  it('null/未観測は空文字', () => {
    expect(buildBroadcastScorePanelHtml(null)).toBe('');
    expect(buildBroadcastScorePanelHtml({})).toBe('');
  });

  it('スコアがあれば data-target にtotal・カウントアップ用の初期値0を出す', () => {
    const html = buildBroadcastScorePanelHtml({ score: sampleScore, isFinal: false, isFresh: true });
    expect(html).toContain('data-target="78"');
    expect(html).toContain('>0<'); // カウントアップ前は表示0
    expect(html).toContain('現在のスコア');
  });

  it('isFinal=true は「最終スコア」表記になる', () => {
    const html = buildBroadcastScorePanelHtml({ score: sampleScore, isFinal: true, isFresh: true });
    expect(html).toContain('最終スコア');
    expect(html).toContain('data-nl-score-final="1"');
  });

  it('isFresh=false は古いデータの注記を出す', () => {
    const html = buildBroadcastScorePanelHtml({ score: sampleScore, isFinal: false, isFresh: false });
    expect(html).toContain('nl-score-stale');
  });

  it('4パーツの点数を表示する', () => {
    const html = buildBroadcastScorePanelHtml({ score: sampleScore, isFinal: false, isFresh: true });
    expect(html).toContain('25/30');
    expect(html).toContain('20/30');
    expect(html).toContain('18/20');
    expect(html).toContain('15/20');
  });

  it('ランクごとにCSSクラスが変わる', () => {
    const s = buildBroadcastScorePanelHtml({ score: { ...sampleScore, rank: 'S' }, isFinal: false, isFresh: true });
    const d = buildBroadcastScorePanelHtml({ score: { ...sampleScore, rank: 'D' }, isFinal: false, isFresh: true });
    expect(s).toContain('nl-score-rank--s');
    expect(d).toContain('nl-score-rank--d');
  });
});
