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

  it('SC2: v2スコア(base/bonus/bonusParts)があれば感性ボーナス行を出す', () => {
    const v2Score = { ...sampleScore, base: 90, bonus: 12, bonusParts: { reach: 4, breakthrough: 3, jackpot: 5 } };
    const html = buildBroadcastScorePanelHtml({ score: v2Score, isFinal: false, isFresh: true });
    expect(html).toContain('broadcastScoreBonusRow');
    expect(html).toContain('data-bonus="12"');
    expect(html).toContain('+12');
    expect(html).toContain('リーチ+4');
    expect(html).toContain('突破+3');
    expect(html).toContain('大当たり+5');
  });

  it('SC2: v1スコア(bonusなし)は感性ボーナス行を出さない', () => {
    const html = buildBroadcastScorePanelHtml({ score: sampleScore, isFinal: false, isFresh: true });
    expect(html).not.toContain('broadcastScoreBonusRow');
  });

  it('SC2: phaseChipがあれば現在フェーズ/Rを表示する', () => {
    const html = buildBroadcastScorePanelHtml({
      score: sampleScore,
      isFinal: false,
      isFresh: true,
      phaseChip: { phase: 'reach', r: 1.75 }
    });
    expect(html).toContain('nl-score-phase-chip');
    expect(html).toContain('リーチ');
    expect(html).toContain('R=1.75');
  });

  it('SC2: phaseChipが無ければ何も出さない(未観測はノイズにしない)', () => {
    const html = buildBroadcastScorePanelHtml({ score: sampleScore, isFinal: false, isFresh: true });
    expect(html).not.toContain('nl-score-phase-chip');
  });

  it('SC2: radarがあれば講評レーダーSVGを含む', () => {
    const radar = { axes: [{ key: 'commentDensity', label: 'コメント密度', value: 50 }] };
    const html = buildBroadcastScorePanelHtml({ score: sampleScore, isFinal: false, isFresh: true, radar });
    expect(html).toContain('broadcastScoreRadarSection');
    expect(html).toContain('nl-score-radar-svg');
  });

  it('SC2: highlightsがあれば3選のラベルを表示する', () => {
    const highlights = [
      { at: 1, kind: 'phase_jackpot', label: '大当たり到達' },
      { at: 2, kind: 'gift_large', label: 'ギフト大波(large)' }
    ];
    const html = buildBroadcastScorePanelHtml({ score: sampleScore, isFinal: false, isFresh: true, highlights });
    expect(html).toContain('broadcastScoreHighlights');
    expect(html).toContain('大当たり到達');
    expect(html).toContain('ギフト大波(large)');
  });

  it('SC2: highlightsが空配列なら何も出さない', () => {
    const html = buildBroadcastScorePanelHtml({ score: sampleScore, isFinal: false, isFresh: true, highlights: [] });
    expect(html).not.toContain('broadcastScoreHighlights');
  });

  it('SC2: highlightsのlabelはHTMLエスケープされる', () => {
    const highlights = [{ at: 1, kind: 'gift_large', label: '<script>x</script>' }];
    const html = buildBroadcastScorePanelHtml({ score: sampleScore, isFinal: false, isFresh: true, highlights });
    expect(html).not.toContain('<script>x</script>');
  });
});
