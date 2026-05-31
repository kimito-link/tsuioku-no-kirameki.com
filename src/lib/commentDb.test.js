import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import {
  COMMENT_DB_NAME,
  COMMENT_DB_STORE,
  COMMENT_DB_VERSION,
  COMMENT_DB_INDEX_BY_LIVE,
  COMMENT_DB_INDEX_BY_DKEY,
  openCommentDb,
  normalizeDbRecord,
  appendCommentsToDb,
  countCommentsForLive,
  readAllCommentsForLive,
  readRecentCommentsForLive,
  clearCommentsForLive
} from './commentDb.js';
import { buildDedupeKey } from './commentRecord.js';

// 各テストで DB を作り直す（fake-indexeddb をリセット）。
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

/** dkey 付きの row を作る（content 側が buildDedupeKey で付与する想定を再現）。 */
const withKey = (liveId, row) => ({
  ...row,
  dkey: buildDedupeKey(liveId, {
    commentNo: row.commentNo,
    text: row.text,
    capturedAt: row.capturedAt,
    userId: row.userId
  })
});

describe('commentDb スキーマ定数（background.js ミラーの drift 検知）', () => {
  it('リテラル値が固定されている', () => {
    expect(COMMENT_DB_NAME).toBe('nls_comment_db_v1');
    expect(COMMENT_DB_STORE).toBe('comments');
    expect(COMMENT_DB_VERSION).toBe(1);
    expect(COMMENT_DB_INDEX_BY_LIVE).toBe('byLive');
    expect(COMMENT_DB_INDEX_BY_DKEY).toBe('byDkey');
  });
});

describe('normalizeDbRecord', () => {
  it('text/dkey が揃っていれば正規化、欠けていれば null', () => {
    expect(normalizeDbRecord('lv1', { text: 'a', dkey: 'k1' })).toMatchObject({
      liveId: 'lv1',
      dkey: 'k1',
      text: 'a'
    });
    expect(normalizeDbRecord('lv1', { text: '   ', dkey: 'k1' })).toBeNull();
    expect(normalizeDbRecord('lv1', { text: 'a', dkey: '' })).toBeNull();
    expect(normalizeDbRecord('', { text: 'a', dkey: 'k1' })).toBeNull();
  });

  it('任意フィールドは存在するものだけ載る', () => {
    const rec = normalizeDbRecord('LV2', {
      text: 'x',
      dkey: 'k',
      userId: 123,
      nickname: 'n',
      avatarUrl: 'https://e/a.png',
      vpos: 10,
      is184: true,
      selfPosted: true
    });
    expect(rec.liveId).toBe('lv2');
    expect(rec.userId).toBe('123');
    expect(rec.nickname).toBe('n');
    expect(rec.avatarUrl).toBe('https://e/a.png');
    expect(rec.vpos).toBe(10);
    expect(rec.is184).toBe(true);
    expect(rec.selfPosted).toBe(true);
  });
});

describe('appendCommentsToDb + count/read', () => {
  it('新規だけ追記し、dkey 重複（既存・バッチ内）は弾く', async () => {
    const db = await openCommentDb();
    const lv = 'lv100';
    const batch1 = [
      withKey(lv, { commentNo: '1', text: 'a', userId: 'u1' }),
      withKey(lv, { commentNo: '2', text: 'b', userId: 'u2' })
    ];
    const r1 = await appendCommentsToDb(db, lv, batch1);
    expect(r1.added).toBe(2);
    expect(await countCommentsForLive(db, lv)).toBe(2);

    // 2 回目: 1 は既存、3 は新規、バッチ内に 3 を2件（重複）。
    const batch2 = [
      withKey(lv, { commentNo: '1', text: 'a', userId: 'u1' }),
      withKey(lv, { commentNo: '3', text: 'c', userId: 'u3' }),
      withKey(lv, { commentNo: '3', text: 'c', userId: 'u3' })
    ];
    const r2 = await appendCommentsToDb(db, lv, batch2);
    expect(r2.added).toBe(1);
    expect(await countCommentsForLive(db, lv)).toBe(3);

    const all = await readAllCommentsForLive(db, lv);
    expect(all.map((r) => r.commentNo)).toEqual(['1', '2', '3']);
    db.close();
  });

  it('別 liveId は混ざらない（byLive index で分離）', async () => {
    const db = await openCommentDb();
    await appendCommentsToDb(db, 'lvA', [withKey('lvA', { commentNo: '1', text: 'a' })]);
    await appendCommentsToDb(db, 'lvB', [
      withKey('lvB', { commentNo: '1', text: 'a' }),
      withKey('lvB', { commentNo: '2', text: 'b' })
    ]);
    expect(await countCommentsForLive(db, 'lvA')).toBe(1);
    expect(await countCommentsForLive(db, 'lvB')).toBe(2);
    db.close();
  });

  it('readRecentCommentsForLive は末尾 n 件を古い→新しい順で返す', async () => {
    const db = await openCommentDb();
    const lv = 'lv200';
    const rows = [];
    for (let i = 1; i <= 10; i += 1) {
      rows.push(withKey(lv, { commentNo: String(i), text: `t${i}`, userId: 'u' }));
    }
    await appendCommentsToDb(db, lv, rows);
    const recent = await readRecentCommentsForLive(db, lv, 3);
    expect(recent.map((r) => r.commentNo)).toEqual(['8', '9', '10']);
    db.close();
  });

  it('clearCommentsForLive で当該 live だけ消える', async () => {
    const db = await openCommentDb();
    await appendCommentsToDb(db, 'lvX', [
      withKey('lvX', { commentNo: '1', text: 'a' }),
      withKey('lvX', { commentNo: '2', text: 'b' })
    ]);
    await appendCommentsToDb(db, 'lvY', [withKey('lvY', { commentNo: '1', text: 'a' })]);
    const del = await clearCommentsForLive(db, 'lvX');
    expect(del.deleted).toBe(2);
    expect(await countCommentsForLive(db, 'lvX')).toBe(0);
    expect(await countCommentsForLive(db, 'lvY')).toBe(1);
    db.close();
  });

  it('184 匿名・同秒・別ユーザーは別 dkey なので両方残る', async () => {
    const db = await openCommentDb();
    const lv = 'lv300';
    const cap = 1_700_000_000_000;
    await appendCommentsToDb(db, lv, [
      withKey(lv, { text: '8888', userId: 'a1', capturedAt: cap }),
      withKey(lv, { text: '8888', userId: 'a2', capturedAt: cap }),
      withKey(lv, { text: '8888', userId: 'a1', capturedAt: cap }) // a1 重複
    ]);
    expect(await countCommentsForLive(db, lv)).toBe(2);
    db.close();
  });
});
