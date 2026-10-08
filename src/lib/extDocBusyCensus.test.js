import { describe, it, expect } from 'vitest';
import {
  EXT_CENSUS_REPORT_MAX_BYTES,
  EXT_CENSUS_STALE_MS,
  EXT_CENSUS_MAX_DOCS,
  detectExtSurface,
  createDocCensus,
  noteLongTask,
  noteLag,
  noteOnChanged,
  noteHeap,
  summarizeDocCensus,
  mergeCensusReport,
  formatExtProcessCensusLines
} from './extDocBusyCensus.js';

/**
 * 拡張プロセス(全拡張ページが1本のメインスレッドを共有)の忙しさを「文書ごと」に残す台帳。
 *   実測(2026-10-08): longtask は【実行した当人のページにだけ】届く(別ページの重い処理は届かない)。
 *   ＝ 長い処理の合計が大きい文書=犯人 / 自分の遅れだけ大きい文書=被害者、と機械的に分けられる。
 *   従来の「(拡張の外)」と「後勝ちで1本の popup の値」では犯人を名指しできなかった。
 */

const T0 = 1_000_000;

describe('detectExtSurface — 文書の種類(popup は起動モードで分ける)', () => {
  it.each([
    ['/popup.html', '?inline=1&dock=sidepanel', 'popup-sidepanel'],
    ['/popup.html', '?inline=1&dock=status', 'popup-status'],
    ['/popup.html', '?inline=1&lv=lv1', 'popup-watch'],
    ['/popup.html', '?inline=1', 'popup-watch'],
    ['/popup.html', '?toolbar=1', 'popup-toolbar'],
    ['/popup.html', '', 'popup-tab'],
    ['/status.html', '', 'status'],
    ['/sidepanel.html', '', 'sidepanel'],
    ['/venue.html', '?lv=lv1', 'venue'],
    ['/comeview.html', '', 'comeview'],
    ['/live-view.html', '', 'live-view'],
    ['/offscreen.html', '', 'offscreen'],
    ['/something-new.html', '', 'something-new']
  ])('%s%s → %s', (p, s, want) => {
    expect(detectExtSurface(p, s)).toBe(want);
  });
});

describe('台帳: 長い処理(犯人)と受けた遅れ(被害者)は別の数字', () => {
  it('noteLongTask は回数・合計・最大を積む。負数・NaN は捨てる', () => {
    const c = createDocCensus({ surface: 'popup-tab', nowMs: T0, instanceId: 'aaaa1111' });
    noteLongTask(c, 120);
    noteLongTask(c, 80);
    noteLongTask(c, -5);
    noteLongTask(c, Number.NaN);
    expect(summarizeDocCensus(c, T0 + 10_000).lt).toEqual([2, 200, 120]);
  });

  it('★同じタブの他の文書(親/子 iframe)が実行した長い処理は lo(別枠)に積み、自分の lt に混ぜない', () => {
    const c = createDocCensus({ surface: 'sidepanel', nowMs: T0, instanceId: 'aaaa1111' });
    noteLongTask(c, 100); // 自分
    noteLongTask(c, 400, true); // 子 iframe が実行した(同じタブの別文書)
    noteLongTask(c, 300, true);
    const s = summarizeDocCensus(c, T0 + 10_000);
    expect(s.lt).toEqual([1, 100, 100]);
    expect(s.lo).toEqual([2, 700, 400]);
  });

  it('noteLag は別枠(被害者の数字)で、長い処理に混ざらない', () => {
    const c = createDocCensus({ surface: 'status', nowMs: T0, instanceId: 'bbbb2222' });
    noteLag(c, 300);
    noteLag(c, 700);
    const s = summarizeDocCensus(c, T0 + 10_000);
    expect(s.lg).toEqual([1000, 700, 2]);
    expect(s.lt).toEqual([0, 0, 0]);
  });

  it('★インスタンス識別: 同じ面でも instanceId が違えば別の台帳(後勝ちで潰さない)', () => {
    const a = createDocCensus({ surface: 'popup-watch', nowMs: T0, instanceId: 'aaaa1111' });
    const b = createDocCensus({ surface: 'popup-watch', nowMs: T0, instanceId: 'bbbb2222' });
    noteLongTask(a, 500);
    expect(summarizeDocCensus(a, T0 + 1000).lt[1]).toBe(500);
    expect(summarizeDocCensus(b, T0 + 1000).lt[1]).toBe(0);
    expect(summarizeDocCensus(a, T0).i).not.toBe(summarizeDocCensus(b, T0).i);
  });
});

describe('noteOnChanged — キー族ごとの回数と、バイトは30秒に1回だけ測る(計器が負荷にならない)', () => {
  it('配信ID等の可変部を畳んで数える(nls_comments_lv1 と nls_comments_lv2 は同じ族)', () => {
    const c = createDocCensus({ surface: 'popup-tab', nowMs: T0, instanceId: 'aaaa1111' });
    noteOnChanged(c, 'nls_comments_lv100', { nowMs: T0, bytesOf: () => 1000 });
    noteOnChanged(c, 'nls_comments_lv200', { nowMs: T0 + 10, bytesOf: () => 1000 });
    expect(summarizeDocCensus(c, T0 + 20).oc.map((x) => [x[0], x[1]])).toEqual([['nls_comments_*', 2]]);
  });

  it('bytesOf は族ごとに30秒に1回しか呼ばない(毎イベント stringify しない)', () => {
    const c = createDocCensus({ surface: 'popup-tab', nowMs: T0, instanceId: 'aaaa1111' });
    let calls = 0;
    const bytesOf = () => {
      calls += 1;
      return 2048;
    };
    for (let i = 0; i < 20; i += 1) noteOnChanged(c, 'nls_lane_mirror_v1', { nowMs: T0 + i * 100, bytesOf });
    expect(calls).toBe(1);
    noteOnChanged(c, 'nls_lane_mirror_v1', { nowMs: T0 + 31_000, bytesOf });
    expect(calls).toBe(2);
  });

  it('推定KB = 回数 × 直近に測った1回ぶん。上位3族だけ載せる', () => {
    const c = createDocCensus({ surface: 'popup-tab', nowMs: T0, instanceId: 'aaaa1111' });
    for (let i = 0; i < 10; i += 1) noteOnChanged(c, 'nls_lane_mirror_v1', { nowMs: T0 + i, bytesOf: () => 60 * 1024 });
    for (let i = 0; i < 5; i += 1) noteOnChanged(c, 'nls_a_v1', { nowMs: T0 + i, bytesOf: () => 1024 });
    for (let i = 0; i < 4; i += 1) noteOnChanged(c, 'nls_b_v1', { nowMs: T0 + i, bytesOf: () => 1024 });
    for (let i = 0; i < 3; i += 1) noteOnChanged(c, 'nls_c_v1', { nowMs: T0 + i, bytesOf: () => 1024 });
    const oc = summarizeDocCensus(c, T0 + 100).oc;
    expect(oc).toHaveLength(3);
    expect(oc[0]).toEqual(['nls_lane_mirror_v1', 10, 600]);
  });
});

describe('summarizeDocCensus — 1文書の要約は小さく(診断で storage を太らせない)', () => {
  it(`全部入りでも JSON が ${EXT_CENSUS_REPORT_MAX_BYTES}B 以内`, () => {
    const c = createDocCensus({ surface: 'popup-sidepanel', nowMs: T0, instanceId: 'aaaa1111' });
    noteLongTask(c, 999);
    noteLongTask(c, 888, true);
    noteLag(c, 888);
    noteHeap(c, 800 * 1024 * 1024, 4096 * 1024 * 1024);
    for (let i = 0; i < 12; i += 1) noteOnChanged(c, `nls_family_${i}_v1`, { nowMs: T0 + i, bytesOf: () => 5000 });
    const s = summarizeDocCensus(c, T0 + 5 * 60_000);
    expect(JSON.stringify(s).length).toBeLessThanOrEqual(EXT_CENSUS_REPORT_MAX_BYTES);
  });

  it('heap は最大値を保持し、MB に丸める', () => {
    const c = createDocCensus({ surface: 'status', nowMs: T0, instanceId: 'aaaa1111' });
    noteHeap(c, 500 * 1024 * 1024, 4096 * 1024 * 1024);
    noteHeap(c, 300 * 1024 * 1024, 4096 * 1024 * 1024);
    expect(summarizeDocCensus(c, T0 + 1000).hp).toEqual([500, 4096]);
  });
});

describe('mergeCensusReport — SW が読んで足して書く(メモリに持たない=SW が死んでも消えない)', () => {
  const mkReport = (id, surface, ltMs = 0, ageSec = 100) => ({
    i: id, s: surface, a: ageSec, lt: [ltMs ? 1 : 0, ltMs, ltMs], lg: [0, 0, 0], oc: [], hp: null
  });

  it('同じ instanceId は置き換え、別の instanceId は並べる', () => {
    let rec = mergeCensusReport(null, mkReport('aaaa1111', 'popup-watch', 100), T0);
    rec = mergeCensusReport(rec, mkReport('bbbb2222', 'popup-watch', 200), T0 + 1000);
    rec = mergeCensusReport(rec, mkReport('aaaa1111', 'popup-watch', 300), T0 + 2000);
    expect(rec.docs.map((d) => d.i).sort()).toEqual(['aaaa1111', 'bbbb2222']);
    expect(rec.docs.find((d) => d.i === 'aaaa1111').lt[1]).toBe(300);
  });

  it(`${EXT_CENSUS_STALE_MS / 1000}秒 無音の文書は落とす(閉じた文書が永久に残らない)`, () => {
    let rec = mergeCensusReport(null, mkReport('old00000', 'status'), T0);
    rec = mergeCensusReport(rec, mkReport('new00000', 'sidepanel'), T0 + EXT_CENSUS_STALE_MS + 1);
    expect(rec.docs.map((d) => d.i)).toEqual(['new00000']);
  });

  it(`文書は最大 ${EXT_CENSUS_MAX_DOCS} 件(上限で書き込みサイズを固定)`, () => {
    let rec = null;
    for (let i = 0; i < 15; i += 1) rec = mergeCensusReport(rec, mkReport(`id${String(i).padStart(6, '0')}`, 'popup-watch'), T0 + i);
    expect(rec.docs).toHaveLength(EXT_CENSUS_MAX_DOCS);
  });

  it('★起動回数: 新しい instanceId を見た回数を面ごとに数える(再生成ループの検出)', () => {
    let rec = null;
    for (let i = 0; i < 4; i += 1) rec = mergeCensusReport(rec, mkReport(`id${i}0000000`, 'popup-watch'), T0 + i * 1000);
    rec = mergeCensusReport(rec, mkReport('id00000000', 'popup-watch'), T0 + 5000); // 既知=数えない
    expect(rec.bl['popup-watch']).toHaveLength(4);
  });

  it('起動回数は10分より古いものを数えない', () => {
    let rec = mergeCensusReport(null, mkReport('id00000000', 'popup-watch'), T0);
    rec = mergeCensusReport(rec, mkReport('id11111111', 'popup-watch'), T0 + 11 * 60_000);
    expect(rec.bl['popup-watch']).toHaveLength(1);
  });

  it('壊れた報告(文字列・null・id 無し)は無視して既存の台帳をそのまま返す', () => {
    const rec = mergeCensusReport(null, mkReport('aaaa1111', 'status'), T0);
    expect(mergeCensusReport(rec, null, T0 + 1).docs).toHaveLength(1);
    expect(mergeCensusReport(rec, 'x', T0 + 1).docs).toHaveLength(1);
    expect(mergeCensusReport(rec, { s: 'status' }, T0 + 1).docs).toHaveLength(1);
  });
});

describe('formatExtProcessCensusLines — 速報の文言(誤診させない)', () => {
  const doc = (i, s, ltMs, ageSec, lgMs = 0) => ({
    i, s, a: ageSec, lt: [ltMs ? 3 : 0, ltMs, ltMs], lg: [lgMs, lgMs, lgMs ? 2 : 0], oc: [], hp: null, seenAt: T0, firstSeenAt: T0
  });

  it('台帳が無い/文書が0なら「未受信」と言う(0件の緑にしない)', () => {
    expect(formatExtProcessCensusLines(null, T0).join('\n')).toContain('未受信');
    expect(formatExtProcessCensusLines({ at: T0, docs: [], bl: {} }, T0).join('\n')).toContain('未受信');
  });

  it('稼働の10%以上を自分の長い処理で使った文書を「犯人候補」に名指しする', () => {
    const rec = { at: T0, bl: {}, docs: [doc('aaaa1111', 'popup-watch', 20_000, 100), doc('bbbb2222', 'status', 500, 100)] };
    const text = formatExtProcessCensusLines(rec, T0).join('\n');
    expect(text).toMatch(/犯人候補.*popup-watch#1111/);
    expect(text).not.toMatch(/犯人候補.*status#2222/);
  });

  it('遅れだけ大きく、自分の長い処理が小さい文書しか無いとき、犯人を断言しない', () => {
    const rec = { at: T0, bl: {}, docs: [doc('aaaa1111', 'status', 100, 100, 5000)] };
    const text = formatExtProcessCensusLines(rec, T0).join('\n');
    expect(text).not.toContain('犯人候補');
    expect(text).toContain('断言できません');
  });

  it('起動して30秒未満の文書は犯人判定から外す(起動コストを犯人にしない)', () => {
    const rec = { at: T0, bl: {}, docs: [doc('aaaa1111', 'popup-watch', 9_000, 10)] };
    expect(formatExtProcessCensusLines(rec, T0).join('\n')).not.toContain('犯人候補');
  });

  it('★同じタブの他の文書が実行した長い処理(lo)は「他文書」と併記し、その文書の犯人判定には使わない', () => {
    const d = { ...doc('aaaa1111', 'sidepanel', 100, 100), lo: [6, 40_000, 9000] };
    const text = formatExtProcessCensusLines({ at: T0, bl: {}, docs: [d] }, T0).join(' | ');
    expect(text).toContain('同じタブの他の文書が実行 6回/計40000ms');
    expect(text).not.toContain('犯人候補'); // 自分(sidepanel)の長い処理は100msだけ
  });

  it('古い形式(lo 無し)の台帳でも落ちない', () => {
    const d = doc('aaaa1111', 'status', 0, 100);
    expect(() => formatExtProcessCensusLines({ at: T0, bl: {}, docs: [d] }, T0)).not.toThrow();
  });

  it('起動回数(10分)が3回以上なら再生成ループの疑いを出す', () => {
    const rec = { at: T0, docs: [doc('aaaa1111', 'status', 0, 100)], bl: { 'popup-watch': [T0 - 1, T0 - 2, T0 - 3] } };
    expect(formatExtProcessCensusLines(rec, T0).join('\n')).toMatch(/popup-watch×3/);
  });
});
