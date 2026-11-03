import { describe, it, expect } from 'vitest';
import { estimateViewerRetention } from './viewerRetentionEstimate.js';
import { buildViewerRetentionSectionHtml, VIEWER_RETENTION_OPEN_ROWS } from './viewerRetentionSectionHtml.js';

const T0 = Date.parse('2026-11-03T12:00:00.000Z');
const MIN = 60_000;
/** @param {string} uid @param {number} min @param {string} [text] */
const c = (uid, min, text = 'わこつ') => ({ userId: uid, capturedAt: T0 + min * MIN, text, nickname: `n${uid}` });

describe('estimateViewerRetention', () => {
  // 配信 60分 → 終盤・序盤の幅は 6分(10%)
  const comments = [
    c('1', 0), c('1', 30), c('1', 59), // 始まりから最後まで
    c('2', 20), c('2', 58), // 途中から最後まで
    c('3', 1), c('3', 25), // 始まりから途中まで
    c('4', 40), // 1回だけ・途中
    c('999', 60), // 配信者(除外)・配信の終わりはこの人を含めない
    c('5', 60),
    { userId: '', capturedAt: T0 + 10 * MIN, text: 'x' }, // ID なしは数えない
    { userId: 'sys', capturedAt: T0 + 5 * MIN, text: '「料理」が好きな3人が来場しました' }
  ];
  const est = estimateViewerRetention(comments, { broadcasterUserId: '999' });

  it('最後まで見た人の割合を出す', () => {
    expect(est.ok).toBe(true);
    expect(est.totalUsers).toBe(5);
    expect(est.durationMs).toBe(60 * MIN);
    expect(est.edgeWindowMs).toBe(6 * MIN);
    expect(est.stayedCount).toBe(3); // 1,2,5
    expect(est.stayedPct).toBe(60);
  });

  it('一人ずつの視聴維持率を出す', () => {
    const by = Object.fromEntries(est.users.map((u) => [u.userId, u]));
    expect(by['1'].retentionPct).toBe(100);
    expect(by['1'].stayedToEnd && by['1'].fromStart).toBe(true);
    expect(by['2'].retentionPct).toBe(66.7); // 20分〜60分
    expect(by['3'].retentionPct).toBe(41.7); // 0〜25分(序盤にいた=始まりから)
    expect(by['3'].stayedToEnd).toBe(false);
    expect(by['4'].retentionPct).toBe(0);
    expect(by['4'].singleComment).toBe(true);
    expect(est.users[0].userId).toBe('1'); // 最後まで→維持率の高い順
  });

  it('始まりから最後までの割合', () => {
    expect(est.fromStartCount).toBe(2); // 1,3
    expect(est.fromStartStayedCount).toBe(1);
    expect(est.fromStartStayedPct).toBe(50);
  });

  it('番組の開始時刻があればそれを始まりにする', () => {
    const e2 = estimateViewerRetention([c('1', 10), c('1', 70)], { programStartAtMs: T0 });
    expect(e2.startSource).toBe('program');
    expect(e2.durationMs).toBe(70 * MIN);
    expect(e2.users[0].retentionPct).toBe(85.7); // 10〜70分 ÷ 70分
  });

  it('短すぎる配信・空は判定しない', () => {
    expect(estimateViewerRetention([c('1', 0), c('2', 3)]).ok).toBe(false);
    expect(estimateViewerRetention([]).totalUsers).toBe(0);
    expect(estimateViewerRetention(null).ok).toBe(false);
  });
});

describe('buildViewerRetentionSectionHtml', () => {
  const est = estimateViewerRetention([c('1', 0), c('1', 60), c('2', 10)]);
  it('全体の数字・一人ずつの表・推定の根拠を出す', () => {
    const html = buildViewerRetentionSectionHtml(est);
    expect(html).toContain('id="mkt-viewer-retention"');
    expect(html).toContain('50%');
    expect(html).toContain('推定の根拠');
    expect(html).toContain('最後まで');
    expect(html).toContain('途中まで');
  });
  it('共有用に伏せるときは名前を伏せる', () => {
    const html = buildViewerRetentionSectionHtml(est, { maskShare: true });
    expect(html).not.toContain('n1');
    expect(html).toContain('伏せ字');
  });
  it('判定できないときは理由を出す', () => {
    const html = buildViewerRetentionSectionHtml(estimateViewerRetention([c('1', 0), c('1', 2)]));
    expect(html).toContain('6分より短い');
  });
  it('誰もいなければ章ごと出さない', () => {
    expect(buildViewerRetentionSectionHtml(estimateViewerRetention([]))).toBe('');
  });
  it('v0.1.1856: 人が多いと上位だけ開き、残りは「残り N 人」に畳む(スクロールを軽くする)', () => {
    const many = [];
    for (let u = 0; u < VIEWER_RETENTION_OPEN_ROWS + 7; u++) many.push(c(String(1000 + u), u % 60), c(String(1000 + u), 59));
    const html = buildViewerRetentionSectionHtml(estimateViewerRetention(many));
    expect(html).toContain('<details class="mkt-vr__rest"><summary>残り 7人を見る</summary>');
    const [openPart, restPart] = html.split('<details class="mkt-vr__rest"');
    expect((openPart.match(/<tr>\n<td>/g) || []).length).toBe(VIEWER_RETENTION_OPEN_ROWS);
    expect((restPart.match(/<tr>\n<td>/g) || []).length).toBe(7);
  });
});
