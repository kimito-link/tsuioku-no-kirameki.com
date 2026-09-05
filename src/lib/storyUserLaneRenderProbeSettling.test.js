import { describe, it, expect } from 'vitest';
import {
  createStoryUserLaneRenderProbe,
  snapshotStoryUserLaneRenderProbe,
  buildStoryUserLaneRenderDiag,
  formatStoryUserLaneRenderDiagLines,
  storyUserLaneRenderDiagToActionCards,
  recordStoryUserLaneStep,
  recordStoryUserLaneHeavySettle,
  STORY_USER_LANE_STEPS,
  STORY_USER_LANE_HEAVY_SETTLE,
  notePaintDecision
} from './storyUserLaneRenderProbe.js';

/**
 * 「読み込み途中の0件」を🔴(描画停止)と誤報しないことの回帰テスト。
 *
 * ■ 実機で踏んだ誤報(2026-08-07T15:59 の状態速報)
 *   heavy が entries26 で走り domTiles0 の瞬間を切り取って
 *   「供給26件あるのに画面0件＝描画が止まっています」と🔴を出し、
 *   さらに対処カードで「開発者に共有してください」まで案内していた。
 *   しかし同じ報告の中で【鏡149件・会場152席は正常に出ており】描画経路は生きていた。
 *   実態は popup 起動283ms・幕が出たまま・heavyEverSettled=false で
 *   【まだ一度も読み切っていない】だけだった。
 *
 * ★[[instrument-name-can-mislead]] と同型= 計器が正常な挙動を犯人と名指しする。
 *   ただし【本物の異常の検出力は落とさない】ことが同じくらい重要なので両方を固定する。
 */

/** @param {boolean[]} paints provisional の並び。true=暫定 / false=確定 */
function buildDiag(paints, { everSettled = false, dom = 0, entriesLen = 26 } = {}) {
  const p = createStoryUserLaneRenderProbe();
  recordStoryUserLaneStep(p, STORY_USER_LANE_STEPS.START, {
    activePath: 'heavy',
    entriesLen,
    nowMs: Date.now()
  });
  for (const prov of paints) notePaintDecision(p, { provisional: prov, reason: 'none' });
  if (everSettled) recordStoryUserLaneHeavySettle(p, STORY_USER_LANE_HEAVY_SETTLE.SETTLED);
  recordStoryUserLaneStep(p, STORY_USER_LANE_STEPS.DONE, { domTilesPainted: dom });
  const snap = snapshotStoryUserLaneRenderProbe(p, Date.now());
  return buildStoryUserLaneRenderDiag(snap, { entriesLen, mirrorCells: 149 });
}

describe('応援レーン描画診断: 読み込み途中を🔴と言わない', () => {
  it('★実機再現(暫定2/確定0/未settle): settling になり🔴でも対処カードでもない', () => {
    const d = buildDiag([true, true]);
    expect(d.verdict).toBe('settling');
    const line = formatStoryUserLaneRenderDiagLines(d, {}).join('\n');
    expect(line).toContain('⏳');
    expect(line).not.toContain('🔴');
    expect(line).toContain('読み込み途中');
    // ★ここが本丸: 「開発者に共有してください」を出さない。
    expect(storyUserLaneRenderDiagToActionCards(d, {})).toHaveLength(0);
  });

  it('★本物の異常(確定paintがあるのに0件)は従来どおり🔴+対処カード', () => {
    const d = buildDiag([true, false]);
    expect(d.verdict).toBe('source_but_no_dom');
    const line = formatStoryUserLaneRenderDiagLines(d, {}).join('\n');
    expect(line).toContain('🔴');
    const cards = storyUserLaneRenderDiagToActionCards(d, {});
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe('story-user-lane-no-dom');
  });

  it('★一度でも settled 済みなら、暫定だけでも本物の異常として扱う', () => {
    // 読み切ったことがあるのに0件＝「まだ途中」では説明できない。
    const d = buildDiag([true, true], { everSettled: true });
    expect(d.verdict).toBe('source_but_no_dom');
    expect(storyUserLaneRenderDiagToActionCards(d, {})).toHaveLength(1);
  });

  it('描画できていれば settling ではなく ok', () => {
    const d = buildDiag([true, true], { dom: 26 });
    expect(d.verdict).toBe('ok');
    expect(formatStoryUserLaneRenderDiagLines(d, {}).join('\n')).toContain('✅');
  });

  it('供給0件は従来どおり empty_source(正常)', () => {
    const d = buildDiag([true, true], { entriesLen: 0 });
    expect(d.verdict).toBe('empty_source');
  });
});
