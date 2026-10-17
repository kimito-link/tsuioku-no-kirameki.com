import { describe, expect, it } from 'vitest';
import { giftThrowsForUser, giftThrowsSectionHtml } from './venueGiftThrowsForUser.js';

const LV = 'lv351615340';
const NOW = 1_800_000_000_000;
/** @param {Record<string, unknown>} o */
const row = (o) => ({
  itemName: 'シャンパーン',
  senderName: '花子',
  points: 900,
  time: '0:10:00',
  sortKey: 600,
  thumbnailUrl: 'https://example.com/i.png',
  userId: '111',
  kokenHistoryId: 'h1',
  ...o
});
const payload = (history, extra = {}) => ({ liveId: LV, capturedAt: NOW - 5_000, source: 'koken-api', history, totalCounts: [], ...extra });
const call = (history, over = {}) =>
  giftThrowsForUser({ payload: payload(history), uid: '111', liveId: LV, tileGiftPt: null, nowMs: NOW, ...over });

describe('結びつけは数値uidの完全一致だけ(名前では引かない)', () => {
  it('★同じ名前で別uidの行は混ざらない', () => {
    const r = call([row({ kokenHistoryId: 'a' }), row({ userId: '222', kokenHistoryId: 'b', points: 5000 })]);
    expect(r.rows.map((x) => x.points)).toEqual([900]);
  });
  it('★uid の無い行(匿名・DOM由来)は誰にも付かない。同名でも付かない', () => {
    const r = call([row({ userId: '', kokenHistoryId: 'c', senderName: '花子' }), row({ kokenHistoryId: 'd' })]);
    expect(r.rows).toHaveLength(1);
    expect(r.sumPoints).toBe(900);
  });
  it('★押した人の uid が数値でなければ何も出さない', () => {
    for (const bad of ['', 'a:xyz', '０12', '011', '12 3', undefined]) {
      expect(call([row({})], { uid: bad }).ok).toBe(false);
    }
  });
});

describe('配信の取り違え防止', () => {
  it('★別の配信の保存は使わない', () => {
    const r = giftThrowsForUser({ payload: payload([row({})], { liveId: 'lv999' }), uid: '111', liveId: LV, tileGiftPt: null, nowMs: NOW });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('live-mismatch');
  });
  it('★保存側の配信IDが空でも使わない(fail-closed)', () => {
    const r = giftThrowsForUser({ payload: payload([row({})], { liveId: '' }), uid: '111', liveId: LV, tileGiftPt: null, nowMs: NOW });
    expect(r.ok).toBe(false);
  });
  it('配信IDは大文字小文字・前後空白を無視して比べる', () => {
    const r = giftThrowsForUser({ payload: payload([row({})], { liveId: ' LV351615340 ' }), uid: '111', liveId: LV, tileGiftPt: null, nowMs: NOW });
    expect(r.ok).toBe(true);
  });
});

describe('合計の整合(嘘の明細を出さない)', () => {
  it('★明細の合計がタイルの🎁ptを超えるなら出さない(照合できません)', () => {
    const r = call([row({ points: 900 })], { tileGiftPt: 300 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('over-total');
  });
  it('明細の合計がタイルと一致すれば注記なしで出す', () => {
    const r = call([row({ points: 900 })], { tileGiftPt: 900 });
    expect(r.ok).toBe(true);
    expect(r.notes.join('')).not.toContain('全部ではありません');
  });
  it('★明細の合計がタイルより少なければ「全部ではありません」と明記する', () => {
    const r = call([row({ points: 900 })], { tileGiftPt: 2000 });
    expect(r.ok).toBe(true);
    expect(r.notes.join('')).toContain('全部ではありません');
    expect(r.notes.join('')).toContain('900');
    expect(r.notes.join('')).toContain('2,000');
  });
  it('タイルの値が不明(null)でも出せる(照合はしない)', () => {
    expect(call([row({})], { tileGiftPt: null }).ok).toBe(true);
  });
});

describe('重複・並び・古さ・匿名の注記', () => {
  it('★同じ kokenHistoryId は1件に畳む(二重表示しない)', () => {
    const r = call([row({ kokenHistoryId: 'x' }), row({ kokenHistoryId: 'x' })]);
    expect(r.rows).toHaveLength(1);
    expect(r.sumPoints).toBe(900);
  });
  it('新しい順に並べる', () => {
    const r = call([row({ kokenHistoryId: 'o', sortKey: 100, points: 1 }), row({ kokenHistoryId: 'n', sortKey: 900, points: 2 })]);
    expect(r.rows.map((x) => x.points)).toEqual([2, 1]);
  });
  it('★匿名の行が保存に含まれるときは「含みません」と注記する', () => {
    const r = call([row({}), row({ userId: '', kokenHistoryId: 'z' })]);
    expect(r.notes.join('')).toContain('匿名');
  });
  it('古い保存(5分超)は何分前の記録かを注記する', () => {
    const r = giftThrowsForUser({ payload: payload([row({})], { capturedAt: NOW - 8 * 60_000 }), uid: '111', liveId: LV, tileGiftPt: null, nowMs: NOW });
    expect(r.notes.join('')).toContain('8分前');
  });
  it('点数が0・壊れた行は1件だけ捨てる', () => {
    const r = call([null, 'x', row({ points: 0, kokenHistoryId: 'p' }), row({ kokenHistoryId: 'q' })]);
    expect(r.rows).toHaveLength(1);
  });
  it('空の履歴・壊れた保存は ok:false(例外にしない)', () => {
    expect(call([]).ok).toBe(false);
    expect(giftThrowsForUser({ payload: null, uid: '111', liveId: LV, tileGiftPt: null, nowMs: NOW }).ok).toBe(false);
    expect(giftThrowsForUser({ payload: { liveId: LV, history: 'x' }, uid: '111', liveId: LV, tileGiftPt: null, nowMs: NOW }).ok).toBe(false);
  });
});

describe('giftThrowsSectionHtml(外部入力の検疫)', () => {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  it('★アイテム名の HTML は無害化される', () => {
    const r = call([row({ itemName: '<img src=x onerror=alert(1)>' })]);
    const html = giftThrowsSectionHtml(r, esc);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
  it('★サムネは http(s) だけ。javascript: は出さない', () => {
    const r = call([row({ thumbnailUrl: 'javascript:alert(1)' })]);
    expect(giftThrowsSectionHtml(r, esc)).not.toContain('javascript:');
  });
  it('出せないとき(ok:false)は、照合できない理由だけ・over-total のみ文言を出し、他は空', () => {
    expect(giftThrowsSectionHtml(call([row({})], { tileGiftPt: 1 }), esc)).toContain('照合できません');
    expect(giftThrowsSectionHtml(call([]), esc)).toBe('');
  });
});
