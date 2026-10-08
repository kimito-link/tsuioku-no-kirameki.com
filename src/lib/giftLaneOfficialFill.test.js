import { describe, it, expect } from 'vitest';
import { officialGiftPicksFromRows, mergeGiftPicksWithOfficial } from './giftLaneOfficialFill.js';

const io = { yukkuriFaceFor: (k) => `face:${k}`, limit: 24 };
// koken 正規化後の行(kokenContributionRankingApi.js の形)
const rows = [
  { rank: 1, name: 'たまご店長', thumbnailUrl: 'https://img.nicoprofile.nimg.jp/usericon/139/1398339.jpg', userPageUrl: 'https://www.nicovideo.jp/user/1398339', contribution: 3000, isAnonymous: false },
  { rank: 2, name: '名無し', thumbnailUrl: '', contribution: 3000, isAnonymous: true },
  { rank: 3, name: 'にちゃい', thumbnailUrl: '', userPageUrl: 'https://www.nicovideo.jp/user/13418830', contribution: 1000, isAnonymous: false }
];

describe('officialGiftPicksFromRows', () => {
  const picks = officialGiftPicksFromRows(rows, io);
  it('公式の貢献者を順位順にタイル化する(記名は数値ID・匿名は名無し)', () => {
    expect(picks.map((p) => p.title)).toEqual(['たまご店長', '名無し', 'にちゃい']);
    expect(picks.map((p) => p.entry.userId)).toEqual(['1398339', '', '13418830']);
  });
  it('★ギフトとして出す: ID行は「広告」ではなく「ギフト」、3行目は giftPt(adPt ではない)', () => {
    expect(picks[0].meta.idLine).toBe('ギフト');
    expect(picks[0].stats).toEqual({ commentCount: null, giftPt: 3000, adPt: null });
    expect(JSON.stringify(picks)).not.toContain('広告');
  });
  it('匿名(ID無し)は順位を ID 行に出す', () => {
    expect(picks[1].meta.idLine).toBe('#2');
  });
  it('壊れた入力は空配列(fail-soft)', () => {
    expect(officialGiftPicksFromRows(null, io)).toEqual([]);
    expect(officialGiftPicksFromRows([null, 1, 'x'], io)).toEqual([]);
  });
});

describe('mergeGiftPicksWithOfficial', () => {
  const official = officialGiftPicksFromRows(rows, io);
  const recorded = [{ title: 'たまご店長', entry: { userId: '1398339' }, displaySrc: 'real.jpg', meta: { idLine: '1398339', nameLine: 'たまご店長' } }];
  it('★記録で取れた人が先・同じ数値IDの公式は重ねない', () => {
    const out = mergeGiftPicksWithOfficial(recorded, official, 24);
    expect(out[0]).toBe(recorded[0]);
    expect(out.filter((p) => p.entry.userId === '1398339')).toHaveLength(1);
    expect(out.map((p) => p.title)).toEqual(['たまご店長', '名無し', 'にちゃい']);
  });
  it('記録が空なら公式だけで埋まる(今回の「該当者がいません」の解消)', () => {
    expect(mergeGiftPicksWithOfficial([], official, 24)).toHaveLength(3);
  });
  it('上限を超えない・公式が空なら記録のまま(挙動不変)', () => {
    expect(mergeGiftPicksWithOfficial([], official, 2)).toHaveLength(2);
    expect(mergeGiftPicksWithOfficial(recorded, [], 24)).toEqual(recorded);
  });
  it('配列でない入力でも落ちない', () => {
    expect(mergeGiftPicksWithOfficial(null, undefined, 5)).toEqual([]);
  });
});
