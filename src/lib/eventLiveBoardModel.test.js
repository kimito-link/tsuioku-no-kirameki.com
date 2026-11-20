import { describe, expect, it } from 'vitest';
import {
  sanitizeServerAnnotation,
  deriveEventNumbers,
  buildEventLiveBoardModel,
  buildEventFullListRows,
  formatJstHm,
  formatJstMdHm
} from './eventLiveBoardModel.js';
import { buildEventSelfCardHtml, buildEventFullListRowsHtml, buildEventFullListHeadHtml } from './eventLiveBoardHtml.js';

const JST = (s) => Date.parse(s + '+09:00');
// 2026-11-21 の実測値（紅組）: ゴリアテ 公式表 192900（6:30頃）、capi 年間 4426667（07:03）
const ANN = {
  ok: true,
  separateEventRanking: true,
  lastSnapAt: JST('2026-11-21T07:30:00'),
  official: {
    note: '11月21日（土）6時30分頃更新分',
    cutoffAt: JST('2026-11-21T06:30:00'),
    rows: [{ rank: 1, id: '41979749', name: 'ゴリアテ', score: 192900 }]
  },
  anchor: { cutoffAt: JST('2026-11-21T06:30:00'), snapAt: JST('2026-11-21T06:30:00'), scores: { 41979749: 4426667, 555: 163425 } },
  baselines: { 41979749: 4233767 }
};

describe('eventLiveBoardModel', () => {
  it('時刻は JST', () => {
    expect(formatJstHm(JST('2026-11-21T07:05:00'))).toBe('07:05');
    expect(formatJstMdHm(JST('2026-11-21T06:30:00'))).toBe('11/21 6:30');
  });

  it('sanitizeServerAnnotation: 形が違えば null・不正 id は捨てる', () => {
    expect(sanitizeServerAnnotation(null)).toBeNull();
    expect(sanitizeServerAnnotation({ ok: false })).toBeNull();
    const a = sanitizeServerAnnotation({ ...ANN, baselines: { 41979749: 4233767, bad: 1 } });
    expect(a.baselines).toEqual({ 41979749: 4233767 });
    expect(a.separateEventRanking).toBe(true);
  });

  it('deriveEventNumbers: 表に載った人は推定、載っていない人は +X だけ', () => {
    const a = sanitizeServerAnnotation(ANN);
    const g = deriveEventNumbers('41979749', 4428432, a);
    expect(g.estimated.value).toBe(194665);
    expect(g.estimated.basis).toContain('推定');
    expect(g.sinceUpdate).toEqual({ delta: 1765, sinceAt: JST('2026-11-21T06:30:00') });
    expect(g.official).toEqual({ rank: 1, score: 192900 });
    const o = deriveEventNumbers('555', 163500, a);
    expect(o.estimated).toBeNull();
    expect(o.sinceUpdate.delta).toBe(75);
    // 別のイベント表が無いイベントでは推定も +X も出さない（capi がそのままのスコア）
    expect(deriveEventNumbers('41979749', 1, { ...a, separateEventRanking: false })).toEqual({
      estimated: null,
      sinceUpdate: null,
      official: null
    });
  });

  it('buildEventLiveBoardModel: ラベルは分からなければ「年間」と書かない', () => {
    const ev = {
      key: '202611-kohaku-aka',
      title: '紅白',
      self: { id: '555', name: '成仏', rank: 47, score: 163500, scoreToNext: 1200 },
      rows: [],
      gotAt: JST('2026-11-21T07:31:00')
    };
    const m0 = buildEventLiveBoardModel(ev, null);
    expect(m0.scoreLabel).toBe('公式ランキングのスコア（リアルタイム）');
    expect(m0.self.toNext).toBe(1200);
    expect(m0.self.since).toBeNull();
    const m1 = buildEventLiveBoardModel(ev, sanitizeServerAnnotation(ANN));
    expect(m1.scoreLabel).toBe('年間（リアルタイム）');
    expect(m1.self.since).toEqual({ delta: 75, sinceAt: JST('2026-11-21T06:30:00'), kind: 'server' });
    // サーバが無いときは、この画面で初めて取得した時からの増加
    const m2 = buildEventLiveBoardModel({ ...ev, localFirstSeen: { at: JST('2026-11-21T07:00:00'), score: 163400 } }, null);
    expect(m2.self.since).toEqual({ delta: 100, sinceAt: JST('2026-11-21T07:00:00'), kind: 'local' });
  });

  it('次の順位まで: score_to_next_rank が無ければ1つ上の行から', () => {
    const m = buildEventLiveBoardModel(
      { key: 'k-1', title: '', self: { id: '2', rank: 2, score: 50 }, rows: [{ id: '1', name: 'a', rank: 1, score: 80 }], gotAt: 1 },
      null
    );
    expect(m.self.toNext).toBe(30);
    expect(m.self.nextRank).toBe(1);
  });

  it('推定順位: 公式表に載った人の中で', () => {
    const a = sanitizeServerAnnotation({ ...ANN, baselines: { 41979749: 4233767, 777: 1000 }, anchor: { ...ANN.anchor, scores: { ...ANN.anchor.scores, 777: 300000 } } });
    const m = buildEventLiveBoardModel(
      { key: 'k-1', title: '', self: { id: '41979749', rank: 4, score: 4428432 }, rows: [], gotAt: 1 },
      a
    );
    expect(m.self.estimated.value).toBe(194665);
    expect(m.self.estRank).toBe(2);
    expect(m.self.estToNext).toBe(299000 - 194665);
  });

  it('buildEventFullListRows: 自分の行に印', () => {
    const rows = buildEventFullListRows(
      [
        { id: '41979749', name: 'ゴリアテ', rank: 4, score: 4428432 },
        { id: '555', name: 'x', rank: 47, score: 163500 },
        { id: 'bad', name: 'y', rank: 1, score: 1 }
      ],
      '555',
      sanitizeServerAnnotation(ANN)
    );
    expect(rows).toHaveLength(2);
    expect(rows[1].isSelf).toBe(true);
    expect(rows[0].estimated).toBe(194665);
    expect(rows[1].sinceDelta).toBe(75);
  });
});

describe('eventLiveBoardHtml', () => {
  const ev = {
    key: '202611-kohaku-aka',
    title: '紅白<script>',
    self: { id: '41979749', name: 'ゴリアテ', rank: 4, score: 4428432, scoreToNext: 1000 },
    rows: [],
    gotAt: JST('2026-11-21T07:31:00')
  };
  it('先頭に順位・pt・次まで、推定には「推定」と根拠、最終取得時刻', () => {
    const html = buildEventSelfCardHtml(buildEventLiveBoardModel(ev, sanitizeServerAnnotation(ANN)), { showListButton: true });
    expect(html).toContain('紅白&lt;script&gt;');
    expect(html.indexOf('nl-evb__rank-num')).toBeLessThan(html.indexOf('推定'));
    expect(html).toContain('次の<strong>3位</strong>まで あと <strong>💎1,000</strong>');
    expect(html).toContain('年間（リアルタイム）');
    expect(html).toContain('推定');
    expect(html).toContain('公式表（11月21日（土）6時30分頃更新分）');
    expect(html).toContain('公式更新（11/21 6:30頃）以降');
    expect(html).toContain('最終取得 07:31');
    expect(html).toContain('data-evb-open');
  });
  it('有料・紹介・LINE の言葉を出さない', () => {
    const html = buildEventSelfCardHtml(buildEventLiveBoardModel(ev, sanitizeServerAnnotation(ANN)));
    expect(html).not.toMatch(/有料|紹介|LINE|サポーター/);
  });
  it('一覧の行と見出し', () => {
    const rows = buildEventFullListRows([{ id: '555', name: '<b>', rank: 47, score: 163500 }], '555', sanitizeServerAnnotation(ANN));
    const html = buildEventFullListRowsHtml(rows, { separate: true });
    expect(html).toContain('nl-evb__row--self');
    expect(html).toContain('&lt;b&gt;');
    expect(html).toContain('公式更新以降 +75');
    expect(buildEventFullListHeadHtml({ scoreLabel: '年間（リアルタイム）', gotAt: JST('2026-11-21T07:31:00'), totalCount: 146, shown: 25, officialNote: 'n' })).toContain('25 / 146人');
  });
});
