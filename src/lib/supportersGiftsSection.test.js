import { describe, expect, it } from 'vitest';
import {
  buildSupportersGiftsRows,
  sectionSupportersGiftsHtml,
  SUPPORTERS_GIFTS_MAX_COMMENTS_PER_USER,
  SUPPORTERS_GIFTS_MAX_COMMENT_ONLY_USERS
} from './supportersGiftsSection.js';

const c = (userId, text, at, nickname = '') => ({ userId, text, capturedAt: at, nickname });
const g = (senderLabel, userId, itemName, points, timeLabel = '0:10', extra = {}) => ({
  senderLabel, userId, itemName, points, timeLabel, sortKey: 0, thumbnailUrl: '', senderAvatarUrl: '', source: 'x', dedupeKey: `${senderLabel}${itemName}${timeLabel}`, ...extra
});

describe('buildSupportersGiftsRows: ユーザーごとに コメント+ギフト をまとめる', () => {
  it('同じ数値ID は、コメントとギフトを同じ人に合流する(ギフト pt 降順→コメント件数降順)', () => {
    const rows = buildSupportersGiftsRows({
      comments: [c('111', 'こんにちは', 1000), c('111', 'ありがとう', 2000), c('a:x', 'やあ', 1500)],
      giftRows: [g('太郎', '111', '星', 500), g('太郎', '111', '花', 300)]
    });
    expect(rows.map((r) => r.userKey)).toEqual(['uid:111', 'a:x']);
    const t = rows[0];
    expect(t.commentCount).toBe(2);
    expect(t.giftCount).toBe(2);
    expect(t.giftPoints).toBe(800);
    expect(t.comments.map((x) => x.text)).toEqual(['こんにちは', 'ありがとう']); // 時系列(古い順)
    expect(t.gifts.map((x) => x.itemName)).toEqual(['星', '花']);
  });

  it('並びは ギフト pt が先: ギフトを出した人は、コメントが少なくても、コメントだけの多い人より上', () => {
    const rows = buildSupportersGiftsRows({
      comments: [c('222', 'a', 1), c('222', 'b', 2), c('222', 'c', 3), c('222', 'd', 4), c('333', 'x', 5)],
      giftRows: [g('贈り主', '333', '星', 100)]
    });
    expect(rows.map((r) => r.userKey)).toEqual(['uid:333', 'uid:222']);
  });

  it('匿名のギフトの送り主(uid無し)は名前単位の行になる。コメント側の匿名IDとは混ぜない', () => {
    const rows = buildSupportersGiftsRows({
      comments: [c('a:x', 'こめ', 1000)],
      giftRows: [g('名無し', '', '星', 100)]
    });
    expect(rows.map((r) => r.userKey).sort()).toEqual(['a:x', 'name:名無し']);
    expect(rows.find((r) => r.userKey === 'name:名無し').commentCount).toBe(0);
  });

  it('配信者本人のコメントは除く・本文が空のコメントは数えない・userId 無しは除く', () => {
    const rows = buildSupportersGiftsRows({
      comments: [c('999', '配信者', 1), c('111', '', 2), c('', 'uid無し', 3), c('111', 'ok', 4)],
      giftRows: [],
      broadcasterUserId: '999'
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].commentCount).toBe(1);
  });

  it('1人あたりのコメント表示は上限まで(件数は実数を保つ)・コメントだけの人は上限人数まで(ギフトを出した人は必ず入る)', () => {
    const many = Array.from({ length: SUPPORTERS_GIFTS_MAX_COMMENTS_PER_USER + 7 }, (_, i) => c('111', `t${i}`, i + 1));
    const r = buildSupportersGiftsRows({ comments: many, giftRows: [] });
    expect(r[0].commentCount).toBe(SUPPORTERS_GIFTS_MAX_COMMENTS_PER_USER + 7);
    expect(r[0].comments).toHaveLength(SUPPORTERS_GIFTS_MAX_COMMENTS_PER_USER);
    expect(r[0].commentsOmitted).toBe(7);

    const crowd = Array.from({ length: SUPPORTERS_GIFTS_MAX_COMMENT_ONLY_USERS + 20 }, (_, i) => c(`a:${i}`, 'x', i + 1));
    const r2 = buildSupportersGiftsRows({ comments: crowd, giftRows: [g('贈り主', '5', '星', 10)] });
    expect(r2.filter((x) => x.giftCount === 0)).toHaveLength(SUPPORTERS_GIFTS_MAX_COMMENT_ONLY_USERS);
    expect(r2.some((x) => x.giftCount > 0)).toBe(true);
  });

  it('入力が不正でも落ちない', () => {
    expect(buildSupportersGiftsRows({ comments: null, giftRows: undefined })).toEqual([]);
    expect(buildSupportersGiftsRows(/** @type {any} */ (null))).toEqual([]);
  });
});

describe('sectionSupportersGiftsHtml: 畳める章の HTML', () => {
  const rows = buildSupportersGiftsRows({
    comments: [c('111', '<b>x</b>', 1_700_000_000_000), c('a:z', 'ふつう', 1_700_000_001_000)],
    giftRows: [g('太郎', '111', '星<i>', 500, '0:10')]
  });
  const identity = (row) => ({ thumbCell: '<span class="t"></span>', accountHtml: `acct:${row.label}`, idHtml: 'id' });

  it('ユーザーごとに <details>。本文・アイテム名は HTML エスケープされる', () => {
    const html = sectionSupportersGiftsHtml(rows, { maskShare: false, renderIdentity: identity });
    expect(html).toContain('id="mkt-supporters-gifts"');
    expect((html.match(/<details/g) || []).length).toBe(2);
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('星&lt;i&gt;');
    expect(html).not.toContain('<b>x</b>');
  });

  it('上位の人は開いた状態(open)・それ以外は閉じる', () => {
    const html = sectionSupportersGiftsHtml(rows, { maskShare: false, renderIdentity: identity, openTop: 1 });
    expect((html.match(/<details[^>]* open/g) || []).length).toBe(1);
  });

  it('伏せ字(共有モード)では、名前・サムネ・コメント本文・アイテム名の個別行を出さず、件数と pt だけ', () => {
    const html = sectionSupportersGiftsHtml(rows, { maskShare: true, renderIdentity: identity });
    expect(html).not.toContain('ふつう');
    expect(html).not.toContain('&lt;b&gt;x');
    expect(html).not.toContain('acct:');
    expect(html).toMatch(/コメント\s*1\s*件/);
    expect(html).toContain('500');
  });

  it('行が無いときは、理由の注記だけを出す', () => {
    const html = sectionSupportersGiftsHtml([], { maskShare: false, renderIdentity: identity });
    expect(html).toContain('id="mkt-supporters-gifts"');
    expect(html).not.toContain('<details');
  });

  it('切り捨てた分(コメント省略・コメントだけの人の省略)は注記に出す', () => {
    const many = Array.from({ length: SUPPORTERS_GIFTS_MAX_COMMENTS_PER_USER + 3 }, (_, i) => c('111', `t${i}`, i + 1));
    const r = buildSupportersGiftsRows({ comments: many, giftRows: [] });
    const html = sectionSupportersGiftsHtml(r, { maskShare: false, renderIdentity: identity });
    expect(html).toContain('ほか 3 件');
  });
});
