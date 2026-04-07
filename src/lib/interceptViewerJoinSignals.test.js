import { describe, expect, it } from 'vitest';
import {
  collectViewerJoinUsersFromObject,
  dedupeViewerJoinUsersByUserId,
  normalizeViewerJoin,
  walkJsonForViewerJoinUsers
} from './interceptViewerJoinSignals.js';

describe('interceptViewerJoinSignals', () => {
  it('joinUsers 配列から userId・表示名・アイコンを拾う', () => {
    const items = collectViewerJoinUsersFromObject({
      type: 'audienceUpdate',
      joinUsers: [
        { userId: '86255751', nickname: 'A', iconUrl: 'https://example.com/a.png' },
        { userId: '12345678', screenName: 'B' }
      ]
    });
    expect(items).toHaveLength(2);
    expect(items[0].userId).toBe('86255751');
    expect(items[0].nickname).toBe('A');
    expect(items[1].nickname).toBe('B');
  });

  it('type が入室系でない単独 audience は拾うが数値配列は拾わない', () => {
    expect(
      collectViewerJoinUsersFromObject({
        audience: [{ userId: '1', nickname: 'x' }]
      })
    ).toHaveLength(1);
    expect(
      collectViewerJoinUsersFromObject({
        audience: [1, 2, 3]
      })
    ).toHaveLength(0);
  });

  it('dedupeViewerJoinUsersByUserId で同一 userId をマージ', () => {
    const d = dedupeViewerJoinUsersByUserId([
      { userId: '1', nickname: '', iconUrl: 'https://x/u.jpg' },
      { userId: '1', nickname: 'LongName', iconUrl: '' }
    ]);
    expect(d).toHaveLength(1);
    expect(d[0].nickname).toBe('LongName');
    expect(d[0].iconUrl).toBe('https://x/u.jpg');
  });

  it('walkJsonForViewerJoinUsers がネストからも収集', () => {
    const all = walkJsonForViewerJoinUsers({
      outer: {
        data: {
          newViewers: [{ userId: '99', nickname: 'Z' }]
        }
      }
    });
    expect(all.some((x) => x.userId === '99')).toBe(true);
  });

  it('normalizeViewerJoin が数値 userId で既定 usericon URL を補い timestamp を固定できる', () => {
    const r = normalizeViewerJoin({ userId: '86255751', nickname: '' }, 9_000_000);
    expect(r.userId).toBe('86255751');
    expect(r.timestamp).toBe(9_000_000);
    expect(r.source).toBe('network-intercept');
    expect(r.iconUrl).toContain('86255751');
    expect(r.iconUrl).toContain('nicoaccount/usericon');
  });

  it('normalizeViewerJoin が匿名IDに「匿名」を補う', () => {
    const r = normalizeViewerJoin(
      { userId: 'a:deadbeefcafe0123456789abcdef', nickname: '' },
      1
    );
    expect(r.nickname).toBe('匿名');
  });

  it('joinUsers 内で同一 userId が連続しても dedupe で1件に畳まれる', () => {
    const raw = walkJsonForViewerJoinUsers({
      joinUsers: [
        { userId: '42', nickname: 'First' },
        { userId: '42', nickname: 'Second' }
      ]
    });
    const d = dedupeViewerJoinUsersByUserId(raw);
    expect(d).toHaveLength(1);
    expect(d[0].userId).toBe('42');
    expect(d[0].nickname).toBe('Second');
  });
});
