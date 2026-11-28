// v0.1.2265: 「声をかけてくれた人」は視聴者の ID(サービスの中)で数える。同じ名前の別の人をまとめない。
//   初めての人の上限(8人)は、重なりを外したあとに数える。どのサービスも同じ。
import { describe, expect, it } from 'vitest';
import { buildOperatorReportModel } from './marketingOperatorReport.js';
import { renderOperatorReportHtml } from './marketingOperatorReportHtml.js';

const T0 = Date.parse('2026-11-27T20:00:00+09:00');
const PLATFORMS = ['niconico', 'youtube', 'twitch', 'kick', 'twitcasting', 'tiktok', 'showroom', 'mixch', 'whowatch'];
const uidFor = (/** @type {string} */ p, /** @type {number} */ i) => (p === 'youtube' ? `UC${String(i).padStart(22, 'a')}` : String(80000000 + i));

/** @param {string} platformId @param {any[]} comments */
const build = (platformId, comments) => buildOperatorReportModel({
  liveId: 'lv900000000123', platformId, contentKind: 'live', comments,
  pastBroadcasts: [{ liveId: 'lv1', comments: [{ userId: 'someone-else', nickname: '過去の人' }] }],
});
const thanksOf = (/** @type {any} */ model) => model.sections.find((/** @type {any} */ s) => s.key === 'thanks')?.data.items || [];

describe.each(PLATFORMS)('%s: 声をかけてくれた人', (platformId) => {
  const row = (/** @type {number} */ i, /** @type {Record<string, any>} */ over = {}) => ({
    id: `c${i}-${over.ytKind || 't'}`, liveId: 'lv900000000123', text: 'こんばんは', userId: uidFor(platformId, i),
    nickname: 'さくら', capturedAt: T0 + i * 1000, ytPlatform: platformId, ...over,
  });
  it('贈った人と、同じ名前の別の初めての人を、両方出す(名前が同じでも ID が違えば別の人)', () => {
    const model = build(platformId, [
      row(1, { ytKind: 'superchat', ytAmount: 100, ytCurrency: 'JPY', text: 'ギフト' }),
      row(2),
    ]);
    const items = thanksOf(model);
    const uids = items.map((/** @type {any} */ x) => x.uid);
    expect(uids).toContain(uidFor(platformId, 1));
    expect(uids).toContain(uidFor(platformId, 2));
    expect(items.filter((/** @type {any} */ x) => x.kind === 'first').map((/** @type {any} */ x) => x.uid)).toContain(uidFor(platformId, 2));
  });
  it('同じ人(同じ ID)は、贈った人の欄だけに出す(初めての欄で二重にしない)', () => {
    const model = build(platformId, [
      row(1, { ytKind: 'superchat', ytAmount: 100, ytCurrency: 'JPY', text: 'ギフト' }),
      row(1, { id: 'c1-again' }),
    ]);
    const items = thanksOf(model);
    expect(items.filter((/** @type {any} */ x) => x.uid === uidFor(platformId, 1))).toHaveLength(1);
  });
  it('同じ名前の別の人には、見分ける小さな印を付ける(要るときだけ)', () => {
    const html = renderOperatorReportHtml(build(platformId, [row(1), row(2), row(3, { nickname: 'ひとり' })]));
    const thanks = (html.split('id="mkt-op-thanks"')[1] || '').split('</section>')[0];
    expect(thanks).toContain('さくら<span class="mkt-op-same" style="font-size:.7rem;color:#9c8678">（1）</span>');
    expect(thanks).toContain('さくら<span class="mkt-op-same" style="font-size:.7rem;color:#9c8678">（2）</span>');
    expect(thanks).toMatch(/ひとり(?!<span class="mkt-op-same">)/);
  });
  it('初めての人の上限8人は、贈った人との重なりを外したあとに数える', () => {
    const rows = [];
    for (let i = 1; i <= 3; i += 1) rows.push(row(i, { ytKind: 'superchat', ytAmount: 100, ytCurrency: 'JPY', text: 'ギフト', nickname: `贈${i}` }));
    for (let i = 1; i <= 3; i += 1) rows.push(row(i, { id: `again${i}`, nickname: `贈${i}` }));
    for (let i = 10; i < 20; i += 1) rows.push(row(i, { nickname: `新${i}` }));
    const items = thanksOf(build(platformId, rows));
    expect(items.filter((/** @type {any} */ x) => x.kind === 'first')).toHaveLength(8);
  });
});
