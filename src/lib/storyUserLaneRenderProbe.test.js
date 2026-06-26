import { describe, it, expect } from 'vitest';
import {
  STORY_USER_LANE_STEPS,
  createStoryUserLaneRenderProbe,
  recordStoryUserLaneStep,
  snapshotStoryUserLaneRenderProbe,
  buildStoryUserLaneRenderDiag,
  formatStoryUserLaneRenderDiagLines,
  storyUserLaneRenderDiagToActionCards
} from './storyUserLaneRenderProbe.js';

const NOW = 1_000_000_000_000;

describe('recordStoryUserLaneStep / snapshot', () => {
  it('start で started++ と lastRunAtBase 記録、done で completed++', () => {
    const p = createStoryUserLaneRenderProbe();
    recordStoryUserLaneStep(p, STORY_USER_LANE_STEPS.START, { activePath: 'mirror', nowMs: NOW });
    expect(p.started).toBe(1);
    expect(p.activePath).toBe('mirror');
    expect(p.lastRunAtBase).toBe(NOW);
    recordStoryUserLaneStep(p, STORY_USER_LANE_STEPS.PAINTED, { domTilesPainted: 5 });
    expect(p.domTilesPainted).toBe(5);
    recordStoryUserLaneStep(p, STORY_USER_LANE_STEPS.DONE);
    expect(p.completed).toBe(1);
    expect(p.lastReachedStep).toBe('done');
  });

  it('start で lastError をクリアする', () => {
    const p = createStoryUserLaneRenderProbe();
    recordStoryUserLaneStep(p, STORY_USER_LANE_STEPS.START, { error: '前回のエラー' });
    expect(p.lastError).toBe(''); // start は error をクリア
  });

  it('error は 200字に切る', () => {
    const p = createStoryUserLaneRenderProbe();
    recordStoryUserLaneStep(p, STORY_USER_LANE_STEPS.PAINTED, { error: 'x'.repeat(500) });
    expect(p.lastError.length).toBe(200);
  });

  it('snapshot は lastRunAgoMs を nowMs から算出', () => {
    const p = createStoryUserLaneRenderProbe();
    recordStoryUserLaneStep(p, STORY_USER_LANE_STEPS.START, { nowMs: NOW - 3000 });
    const snap = snapshotStoryUserLaneRenderProbe(p, NOW);
    expect(snap.lastRunAgoMs).toBe(3000);
  });

  it('未実行なら lastRunAgoMs は null', () => {
    const p = createStoryUserLaneRenderProbe();
    const snap = snapshotStoryUserLaneRenderProbe(p, NOW);
    expect(snap.lastRunAgoMs).toBe(null);
  });
});

describe('buildStoryUserLaneRenderDiag', () => {
  it('probe が無ければ present:false', () => {
    expect(buildStoryUserLaneRenderDiag(null)).toEqual({ present: false });
  });

  it('(A) 鏡が空＝empty_source（正常）', () => {
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'mirror', started: 1, completed: 1, mirrorCells: 0, domTilesPainted: 0, lastReachedStep: 'mirror-empty'
    });
    expect(d.verdict).toBe('empty_source');
    expect(d.reason).toContain('正常');
  });

  it('(B) 鏡にあるのに画面0件＝source_but_no_dom', () => {
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'mirror', started: 1, completed: 0, mirrorCells: 5, domTilesPainted: 0, lastReachedStep: 'mirror-empty'
    });
    expect(d.verdict).toBe('source_but_no_dom');
    expect(d.expected).toBe(5);
    expect(d.reason).toContain('供給5件');
  });

  it('(C) heavy 経路で entries が空', () => {
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'heavy', started: 1, completed: 0, entriesLen: 0, domTilesPainted: 0, lastReachedStep: 'entries-empty-return'
    });
    expect(d.verdict).toBe('empty_source'); // 供給0＝正常扱い（=heavy未完走で entries 空。カード側で既知地雷を説明）
    expect(d.expected).toBe(0);
  });

  it('描画成功＝ok', () => {
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'mirror', started: 1, completed: 1, mirrorCells: 5, domTilesPainted: 5, lastReachedStep: 'done'
    });
    expect(d.verdict).toBe('ok');
    expect(d.reason).toContain('5件');
  });

  it('一度も描画していない＝not_started', () => {
    const d = buildStoryUserLaneRenderDiag({ activePath: '', started: 0, completed: 0 });
    expect(d.verdict).toBe('not_started');
  });

  it('例外で落ちた＝errored', () => {
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'mirror', started: 1, completed: 0, mirrorCells: 5, domTilesPainted: 0, lastError: 'boom'
    });
    expect(d.verdict).toBe('errored');
    expect(d.reason).toContain('boom');
  });

  it('描画したが完走していない＝painted_not_completed', () => {
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'heavy', started: 1, completed: 0, entriesLen: 10, domTilesPainted: 8, lastReachedStep: 'painted'
    });
    expect(d.verdict).toBe('painted_not_completed');
  });
});

describe('formatStoryUserLaneRenderDiagLines', () => {
  it('present:false なら空配列', () => {
    expect(formatStoryUserLaneRenderDiagLines({ present: false })).toEqual([]);
  });

  it('source_but_no_dom を1行で見せる', () => {
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'mirror', started: 1, completed: 0, mirrorCells: 5, domTilesPainted: 0, lastReachedStep: 'mirror-empty'
    });
    const text = formatStoryUserLaneRenderDiagLines(d).join('\n');
    expect(text).toContain('応援レーン描画');
    expect(text).toContain('鏡5件');
    expect(text).toContain('画面0件描画');
    expect(text).toContain('🔴');
  });

  it('描画済みなのにローディング継続を警告', () => {
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'mirror', started: 1, completed: 1, mirrorCells: 5, domTilesPainted: 5, lastReachedStep: 'done'
    });
    const text = formatStoryUserLaneRenderDiagLines(d, { loadingActive: true }).join('\n');
    expect(text).toContain('ローディング表示が続いています');
  });

  it('ローディング非表示なら overlay 警告を出さない', () => {
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'mirror', started: 1, completed: 1, mirrorCells: 5, domTilesPainted: 5, lastReachedStep: 'done'
    });
    const text = formatStoryUserLaneRenderDiagLines(d, { loadingActive: false }).join('\n');
    expect(text).not.toContain('ローディング表示が続いています');
  });
});

describe('storyUserLaneRenderDiagToActionCards', () => {
  it('source_but_no_dom で bad カード', () => {
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'mirror', started: 1, completed: 0, mirrorCells: 5, domTilesPainted: 0, lastReachedStep: 'mirror-empty'
    });
    const cards = storyUserLaneRenderDiagToActionCards(d);
    expect(cards.some((c) => c.id === 'story-user-lane-no-dom' && c.severity === 'bad')).toBe(true);
  });

  it('heavy で entries 0 のとき既知地雷の説明を入れる', () => {
    // entriesLen 0 は empty_source だが、source_but_no_dom にならないので no-dom カードは出ない。
    // 一方、もし供給を heavy で取れているのに画面0なら既知地雷文言が cause に入ることを確認する。
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'heavy', started: 1, completed: 0, entriesLen: 12, domTilesPainted: 0, lastReachedStep: 'painted'
    });
    const cards = storyUserLaneRenderDiagToActionCards(d);
    const card = cards.find((c) => c.id === 'story-user-lane-no-dom');
    expect(card).toBeTruthy();
    expect(card.cause).toContain('早期 return');
  });

  it('errored で bad カード', () => {
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'mirror', started: 1, completed: 0, mirrorCells: 5, domTilesPainted: 0, lastError: 'boom'
    });
    const cards = storyUserLaneRenderDiagToActionCards(d);
    expect(cards.some((c) => c.id === 'story-user-lane-error')).toBe(true);
  });

  it('描画済みなのにローディング継続で warn カード', () => {
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'mirror', started: 1, completed: 1, mirrorCells: 5, domTilesPainted: 5, lastReachedStep: 'done'
    });
    const cards = storyUserLaneRenderDiagToActionCards(d, { loadingActive: true });
    expect(cards.some((c) => c.id === 'story-user-lane-loading-stuck')).toBe(true);
  });

  it('正常(ok)ならカードゼロ', () => {
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'mirror', started: 1, completed: 1, mirrorCells: 5, domTilesPainted: 5, lastReachedStep: 'done'
    });
    const cards = storyUserLaneRenderDiagToActionCards(d, { loadingActive: false });
    expect(cards).toEqual([]);
  });

  it('present:false ならカードゼロ', () => {
    expect(storyUserLaneRenderDiagToActionCards({ present: false })).toEqual([]);
  });
});
