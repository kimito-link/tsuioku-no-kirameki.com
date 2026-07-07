import { describe, it, expect } from 'vitest';
import { pruneLiveViewPublishBlob } from './pruneLiveViewPublishBlob.js';

/** 指定バイト数に近い文字列を作る(prune 発動を誘発するダミー本文)。 */
function bigText(bytes) {
  return 'x'.repeat(Math.max(0, bytes));
}

describe('pruneLiveViewPublishBlob', () => {
  it('容量以下ならそのまま返し pruned は空(挙動不変)', () => {
    const blob = {
      commentTimelineMirror: { rows: [{ text: 'a' }, { text: 'b' }], totalSeen: 2 },
      topSupporters: { liveId: 'lv1', rows: [{ name: 'x' }] },
      statusReport: 'short'
    };
    const { blob: out, pruned } = pruneLiveViewPublishBlob(blob, { maxBytes: 512 * 1024 });
    expect(pruned).toEqual([]);
    // 中身は保持される(参照差し替えの有無に関わらず値は同じ)
    expect(out.commentTimelineMirror.rows.length).toBe(2);
    expect(out.topSupporters.rows.length).toBe(1);
    expect(out.statusReport).toBe('short');
  });

  it('null/非オブジェクトでも落ちない', () => {
    expect(pruneLiveViewPublishBlob(null).pruned).toEqual([]);
    expect(pruneLiveViewPublishBlob(undefined).pruned).toEqual([]);
    expect(pruneLiveViewPublishBlob(123).pruned).toEqual([]);
  });

  it('①まず commentTimelineMirror.rows を半減する(totalSeen は据え置き=嘘をつかない)', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ text: bigText(400), name: `n${i}` }));
    const blob = {
      commentTimelineMirror: { liveId: 'lv1', capturedAt: 1, rows, totalSeen: 40 },
      topSupporters: { liveId: 'lv1', rows: [] },
      statusReport: 'short'
    };
    // rows で ~16KB。maxBytes を小さくして①だけで収まる想定。
    const { blob: out, pruned } = pruneLiveViewPublishBlob(blob, { maxBytes: 9 * 1024 });
    expect(out.commentTimelineMirror.rows.length).toBeLessThan(40);
    // 最新側(末尾)を残す
    expect(out.commentTimelineMirror.rows.at(-1).name).toBe('n39');
    // totalSeen は元のまま=「本当は何件あったか」を誠実に残す
    expect(out.commentTimelineMirror.totalSeen).toBe(40);
    expect(pruned.some((p) => p.section === 'commentTimelineMirror.rows')).toBe(true);
  });

  it('②①で足りなければ topSupporters.rows を 10→5 に削る', () => {
    const comments = Array.from({ length: 4 }, () => ({ text: bigText(100) }));
    const sup = Array.from({ length: 10 }, (_, i) => ({ name: `s${i}`, blob: bigText(2000) }));
    const blob = {
      commentTimelineMirror: { rows: comments, totalSeen: 4 },
      topSupporters: { liveId: 'lv1', rows: sup },
      statusReport: 'short'
    };
    const { blob: out, pruned } = pruneLiveViewPublishBlob(blob, { maxBytes: 12 * 1024 });
    expect(out.topSupporters.rows.length).toBeLessThanOrEqual(5);
    expect(pruned.some((p) => p.section === 'topSupporters.rows')).toBe(true);
  });

  it('③最後に statusReport を末尾切り詰め+切詰め注記を残す', () => {
    const blob = {
      commentTimelineMirror: { rows: [], totalSeen: 0 },
      topSupporters: { liveId: 'lv1', rows: [] },
      statusReport: bigText(600 * 1024)
    };
    const { blob: out, pruned } = pruneLiveViewPublishBlob(blob, { maxBytes: 100 * 1024 });
    expect(out.statusReport.length).toBeLessThan(600 * 1024);
    expect(out.statusReport).toContain('容量超過のため切詰め');
    expect(pruned.some((p) => p.section === 'statusReport')).toBe(true);
    // 全体が上限以下に収まっている
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(100 * 1024);
  });

  it('削った順序は ①→②→③(コメント→応援者→本文)', () => {
    // ①だけでは収まらず②③まで到達する巨大 blob
    const comments = Array.from({ length: 60 }, () => ({ text: bigText(1000) }));
    const sup = Array.from({ length: 10 }, () => ({ name: bigText(1000) }));
    const blob = {
      commentTimelineMirror: { rows: comments, totalSeen: 60 },
      topSupporters: { liveId: 'lv1', rows: sup },
      statusReport: bigText(300 * 1024)
    };
    const { pruned } = pruneLiveViewPublishBlob(blob, { maxBytes: 80 * 1024 });
    const sections = pruned.map((p) => p.section);
    // 出現順が ①<②<③
    const iC = sections.indexOf('commentTimelineMirror.rows');
    const iS = sections.indexOf('topSupporters.rows');
    const iR = sections.indexOf('statusReport');
    expect(iC).toBeGreaterThanOrEqual(0);
    if (iS >= 0) expect(iS).toBeGreaterThan(iC);
    if (iR >= 0 && iS >= 0) expect(iR).toBeGreaterThan(iS);
  });

  it('元の blob を破壊しない(呼び出し側の _lastRenderedBundle を汚さない)', () => {
    const rows = Array.from({ length: 40 }, () => ({ text: bigText(400) }));
    const blob = {
      commentTimelineMirror: { rows, totalSeen: 40 },
      topSupporters: { liveId: 'lv1', rows: [] },
      statusReport: 'short'
    };
    pruneLiveViewPublishBlob(blob, { maxBytes: 9 * 1024 });
    // 入力側は無傷
    expect(blob.commentTimelineMirror.rows.length).toBe(40);
  });

  // ─── 第2号(③WEB投げ一覧丸写し)prune: B2-6 ───

  it('⓪ giftHistoryMirror.ledgerRows を最優先で削り、ledgerTotalCount は据え置き(嘘をつかない)', () => {
    const ledgerRows = Array.from({ length: 20 }, (_, i) => ({ itemName: bigText(600), points: 100 + i }));
    const rooms = Array.from({ length: 10 }, (_, i) => ({ userKey: `u${i}`, nickname: `n${i}`, count: 1 }));
    const blob = {
      giftHistoryMirror: { liveId: 'lv1', capturedAt: 1, rooms, ledgerRows, ledgerTotalCount: 20 },
      commentTimelineMirror: { rows: [{ text: bigText(400) }], totalSeen: 1 },
      topSupporters: { liveId: 'lv1', rows: [] },
      statusReport: 'short'
    };
    const { blob: out, pruned } = pruneLiveViewPublishBlob(blob, { maxBytes: 9 * 1024 });
    // 投げ明細が最優先で削られている
    expect(out.giftHistoryMirror.ledgerRows.length).toBeLessThan(20);
    // ledgerTotalCount は元のまま=誠実に元件数を残す
    expect(out.giftHistoryMirror.ledgerTotalCount).toBe(20);
    // pruned に記録され、かつ先頭(=commentTimelineMirror.rows より前)に出る
    const sections = pruned.map((p) => p.section);
    expect(sections).toContain('giftHistoryMirror.ledgerRows');
    const iLedger = sections.indexOf('giftHistoryMirror.ledgerRows');
    const iComment = sections.indexOf('commentTimelineMirror.rows');
    if (iComment >= 0) expect(iLedger).toBeLessThan(iComment);
  });

  it('⓪でも足りなければ ledgerRows を 0 まで落とす(明細を諦めても rooms は残す)', () => {
    const ledgerRows = Array.from({ length: 20 }, () => ({ itemName: bigText(2000), points: 100 }));
    const rooms = Array.from({ length: 10 }, (_, i) => ({ userKey: `u${i}`, nickname: `n${i}`, count: 1 }));
    const blob = {
      giftHistoryMirror: { liveId: 'lv1', rooms, ledgerRows, ledgerTotalCount: 20 },
      commentTimelineMirror: { rows: [], totalSeen: 0 },
      topSupporters: { liveId: 'lv1', rows: [] },
      statusReport: 'short'
    };
    const { blob: out, pruned } = pruneLiveViewPublishBlob(blob, { maxBytes: 6 * 1024 });
    expect(out.giftHistoryMirror.ledgerRows.length).toBe(0);
    expect(pruned.some((p) => p.section === 'giftHistoryMirror.ledgerRows' && p.after === 0)).toBe(true);
    // rooms は温存(明細を諦めても貢献者ランキングは残す)。
    expect(out.giftHistoryMirror.rooms.length).toBeGreaterThan(0);
  });

  it('② ledgerRows を削っても足りなければ giftHistoryMirror.rooms を 10→5 に削る', () => {
    // ledgerRows は無し(⓪スキップ)、rooms を大きくして②到達を狙う。
    const rooms = Array.from({ length: 10 }, (_, i) => ({ userKey: `u${i}`, nickname: bigText(2000), count: i }));
    const blob = {
      giftHistoryMirror: { liveId: 'lv1', rooms, ledgerRows: [], ledgerTotalCount: 0 },
      commentTimelineMirror: { rows: [], totalSeen: 0 },
      topSupporters: { liveId: 'lv1', rows: [] },
      statusReport: 'short'
    };
    const { blob: out, pruned } = pruneLiveViewPublishBlob(blob, { maxBytes: 12 * 1024 });
    expect(out.giftHistoryMirror.rooms.length).toBeLessThanOrEqual(5);
    expect(pruned.some((p) => p.section === 'giftHistoryMirror.rooms')).toBe(true);
  });

  it('第2号: 元の giftHistoryMirror を破壊しない(浅い clone)', () => {
    const ledgerRows = Array.from({ length: 20 }, () => ({ itemName: bigText(600), points: 100 }));
    const rooms = Array.from({ length: 10 }, (_, i) => ({ userKey: `u${i}`, nickname: `n${i}`, count: 1 }));
    const blob = {
      giftHistoryMirror: { liveId: 'lv1', rooms, ledgerRows, ledgerTotalCount: 20 },
      commentTimelineMirror: { rows: [], totalSeen: 0 },
      topSupporters: { liveId: 'lv1', rows: [] },
      statusReport: 'short'
    };
    pruneLiveViewPublishBlob(blob, { maxBytes: 6 * 1024 });
    expect(blob.giftHistoryMirror.ledgerRows.length).toBe(20);
    expect(blob.giftHistoryMirror.rooms.length).toBe(10);
  });
});
