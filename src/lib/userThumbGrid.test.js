/**
 * userThumbGrid のテスト（TDD）。
 *
 * 0.1.15 (L): HTML レポート / マーケ分析の「サムネ付きユーザー一覧」で、数値 ID
 *   ユーザー（個人サムネ or ニコ既定アイコン）と匿名ユーザー（identicon）が
 *   1 つの grid に混在していたのを、種別ごとに分けて表示できるよう
 *   カテゴリ分け純粋関数 + 共有レンダリング helper を導入する。
 *
 * 設計方針:
 *   - DOM/storage 非依存の純粋関数。call site（marketingChartsHtml /
 *     popup-entry の HTML レポート）が共通で使う。
 *   - エラーが出にくいよう、入力境界条件（空・null・不正値）を網羅的に
 *     テストし、リファクタリング時の回帰を防ぐ。
 *   - resolver は呼び出し側が持つ（identicon は popup-entry にしかない）。
 */

import { describe, it, expect, vi } from 'vitest';
import {
  THUMB_USER_KIND_NUMERIC,
  THUMB_USER_KIND_ANONYMOUS,
  categorizeUsersForThumbGrid
} from './userThumbGrid.js';

describe('categorizeUsersForThumbGrid', () => {
  it('空配列 → 空 + skipped 0', () => {
    const r = categorizeUsersForThumbGrid([], {});
    expect(r.numericIdUsers).toEqual([]);
    expect(r.anonymousUsers).toEqual([]);
    expect(r.skippedCount).toBe(0);
  });

  it('Array でない入力 → 空（防御）', () => {
    expect(categorizeUsersForThumbGrid(null, {}).numericIdUsers).toEqual([]);
    expect(categorizeUsersForThumbGrid(undefined, {}).numericIdUsers).toEqual([]);
    // @ts-expect-error
    expect(categorizeUsersForThumbGrid('hello', {}).numericIdUsers).toEqual([]);
  });

  it('数値 ID + avatarUrl http → numericIdUsers に分類、avatar 採用', () => {
    const r = categorizeUsersForThumbGrid(
      [{ userId: '4046119', nickname: '配信者', avatarUrl: 'https://x.test/c.jpg', count: 10 }],
      {}
    );
    expect(r.numericIdUsers).toHaveLength(1);
    expect(r.anonymousUsers).toHaveLength(0);
    expect(r.numericIdUsers[0]).toMatchObject({
      userId: '4046119',
      kind: THUMB_USER_KIND_NUMERIC,
      thumbSrc: 'https://x.test/c.jpg',
      count: 10
    });
  });

  it('数値 ID + avatarUrl 無し → ニコ既定 CDN URL を採用', () => {
    const r = categorizeUsersForThumbGrid(
      [{ userId: '4046119', nickname: '', avatarUrl: '', count: 5 }],
      {}
    );
    expect(r.numericIdUsers).toHaveLength(1);
    expect(r.numericIdUsers[0].thumbSrc).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/404/4046119.jpg'
    );
  });

  it('匿名 a: + identiconResolver → anonymousUsers に分類', () => {
    const resolver = vi
      .fn()
      .mockReturnValue('data:image/svg+xml;utf8,<svg/>');
    const r = categorizeUsersForThumbGrid(
      [{ userId: 'a:abcdefg', nickname: '匿名', avatarUrl: '', count: 3 }],
      { identiconResolver: resolver }
    );
    expect(r.anonymousUsers).toHaveLength(1);
    expect(r.numericIdUsers).toHaveLength(0);
    expect(r.anonymousUsers[0]).toMatchObject({
      userId: 'a:abcdefg',
      kind: THUMB_USER_KIND_ANONYMOUS,
      thumbSrc: 'data:image/svg+xml;utf8,<svg/>',
      count: 3
    });
    expect(resolver).toHaveBeenCalledWith('a:abcdefg');
  });

  it('匿名 a: + resolver 無し → skipped に入る（thumb 解決できないため）', () => {
    const r = categorizeUsersForThumbGrid(
      [{ userId: 'a:abcdefg', nickname: '匿名', avatarUrl: '', count: 3 }],
      {}
    );
    expect(r.numericIdUsers).toHaveLength(0);
    expect(r.anonymousUsers).toHaveLength(0);
    expect(r.skippedCount).toBe(1);
  });

  it('匿名 a: + avatarUrl http がある場合は anonymousUsers に入る（avatar 優先）', () => {
    const r = categorizeUsersForThumbGrid(
      [
        {
          userId: 'a:abcdefg',
          nickname: '',
          avatarUrl: 'https://x.test/real.jpg',
          count: 1
        }
      ],
      { identiconResolver: () => 'data:image/svg+xml,<svg/>' }
    );
    expect(r.anonymousUsers).toHaveLength(1);
    expect(r.anonymousUsers[0].thumbSrc).toBe('https://x.test/real.jpg');
  });

  it('userId 不明（空 / UNKNOWN）→ skipped', () => {
    const r = categorizeUsersForThumbGrid(
      [
        { userId: '', nickname: 'noid', avatarUrl: '', count: 9 },
        { userId: '__unknown__', nickname: 'x', avatarUrl: '', count: 8 }
      ],
      {}
    );
    expect(r.numericIdUsers).toHaveLength(0);
    expect(r.anonymousUsers).toHaveLength(0);
    expect(r.skippedCount).toBe(2);
  });

  it('混在入力をカテゴリ別に分け、入力の相対順序を各カテゴリ内で保つ', () => {
    // 呼び出し側で count 降順にソートしてから渡す前提（再ソートしない）。
    // ここでは既に降順で入力 → カテゴリ別に取り出しても降順を維持。
    const users = [
      { userId: '4046119', nickname: '', avatarUrl: '', count: 10 },
      { userId: 'a:aaa', nickname: '匿名', avatarUrl: '', count: 8 },
      { userId: '9208219', nickname: 'ななおじ', avatarUrl: '', count: 7 },
      { userId: 'a:ccc', nickname: '匿名', avatarUrl: '', count: 6 },
      { userId: 'a:bbb', nickname: '匿名', avatarUrl: '', count: 5 }
    ];
    const r = categorizeUsersForThumbGrid(users, {
      identiconResolver: (uid) => `id:${uid}`
    });
    expect(r.numericIdUsers.map((u) => u.userId)).toEqual(['4046119', '9208219']);
    expect(r.anonymousUsers.map((u) => u.userId)).toEqual([
      'a:aaa',
      'a:ccc',
      'a:bbb'
    ]);
  });

  it('入力 count 順を尊重して内部で再ソートしない（呼び出し側責務）', () => {
    // count が逆順の入力をそのまま返す（出力 = 入力フィルタ + 分類のみ）
    const users = [
      { userId: '12345', nickname: '', avatarUrl: '', count: 1 },
      { userId: '67890', nickname: '', avatarUrl: '', count: 100 }
    ];
    const r = categorizeUsersForThumbGrid(users, {});
    expect(r.numericIdUsers.map((u) => u.userId)).toEqual(['12345', '67890']);
  });

  it('maxNumeric / maxAnonymous で個別に cap できる', () => {
    const users = [
      { userId: '1111111', count: 10, avatarUrl: '', nickname: '' },
      { userId: '2222222', count: 9, avatarUrl: '', nickname: '' },
      { userId: '3333333', count: 8, avatarUrl: '', nickname: '' },
      { userId: 'a:aa', count: 7, avatarUrl: '', nickname: '' },
      { userId: 'a:bb', count: 6, avatarUrl: '', nickname: '' },
      { userId: 'a:cc', count: 5, avatarUrl: '', nickname: '' }
    ];
    const r = categorizeUsersForThumbGrid(users, {
      maxNumeric: 2,
      maxAnonymous: 2,
      identiconResolver: () => 'id'
    });
    expect(r.numericIdUsers.map((u) => u.userId)).toEqual(['1111111', '2222222']);
    expect(r.anonymousUsers.map((u) => u.userId)).toEqual(['a:aa', 'a:bb']);
  });

  it('cap でカットされた要素は skipped に集計しない（採用候補だが上限超えただけ）', () => {
    const users = [
      { userId: '1111111', count: 10, avatarUrl: '', nickname: '' },
      { userId: '2222222', count: 9, avatarUrl: '', nickname: '' },
      { userId: '3333333', count: 8, avatarUrl: '', nickname: '' }
    ];
    const r = categorizeUsersForThumbGrid(users, { maxNumeric: 1 });
    expect(r.numericIdUsers).toHaveLength(1);
    expect(r.skippedCount).toBe(0); // cap は skipped 扱いではない
  });

  it('avatarUrl が javascript: 等の不正 scheme → 数値 ID なら CDN URL にフォールバック', () => {
    const r = categorizeUsersForThumbGrid(
      [
        {
          userId: '4046119',
          nickname: '',
          avatarUrl: 'javascript:alert(1)',
          count: 1
        }
      ],
      {}
    );
    expect(r.numericIdUsers[0].thumbSrc).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/404/4046119.jpg'
    );
  });

  it('短い数値（4 桁以下）は skipped（誤識別防止：lv 番号や room id）', () => {
    const r = categorizeUsersForThumbGrid(
      [{ userId: '999', nickname: '', avatarUrl: '', count: 1 }],
      {}
    );
    expect(r.numericIdUsers).toHaveLength(0);
    expect(r.skippedCount).toBe(1);
  });

  it('入力エントリの欠損フィールド（nickname undefined 等）を許容', () => {
    const r = categorizeUsersForThumbGrid(
      // @ts-expect-error: nickname 欠落
      [{ userId: '4046119', avatarUrl: '', count: 1 }],
      {}
    );
    expect(r.numericIdUsers).toHaveLength(1);
    expect(r.numericIdUsers[0].nickname).toBe('');
  });

  /*
   * 0.1.17 (R): 配信者本人の userId を受け取って、応援コメント一覧から除外する。
   *   配信者は応援される側であって応援する側ではないので、彼ら自身のコメントは
   *   サムネ付きユーザー一覧 / マーケ分析の topUsers / HTML レポートのテーブルに
   *   は出すべきではない（既に popup の 3 レーンには contamination guard がある
   *   が、HTML レポート / マーケ側にも同じ責任を持たせる）。
   */
  it('broadcasterUserId 指定で配信者本人を skipped に集計', () => {
    const users = [
      { userId: '4046119', count: 10, avatarUrl: '', nickname: '' },
      { userId: '141071773', count: 5, avatarUrl: '', nickname: '' },
      { userId: 'a:abcdef', count: 3, avatarUrl: '', nickname: '' }
    ];
    const r = categorizeUsersForThumbGrid(users, {
      broadcasterUserId: '141071773',
      identiconResolver: () => 'data:identicon'
    });
    expect(r.numericIdUsers.map((u) => u.userId)).toEqual(['4046119']);
    expect(r.anonymousUsers.map((u) => u.userId)).toEqual(['a:abcdef']);
    expect(r.skippedCount).toBe(1); // 141071773
  });

  it('broadcasterUserId 空文字 / null / 数値 → 除外しない（互換）', () => {
    const users = [
      { userId: '4046119', count: 10, avatarUrl: '', nickname: '' }
    ];
    expect(
      categorizeUsersForThumbGrid(users, { broadcasterUserId: '' }).numericIdUsers
    ).toHaveLength(1);
    expect(
      // @ts-expect-error: null
      categorizeUsersForThumbGrid(users, { broadcasterUserId: null }).numericIdUsers
    ).toHaveLength(1);
    expect(
      // @ts-expect-error: number
      categorizeUsersForThumbGrid(users, { broadcasterUserId: 4046119 }).numericIdUsers
    ).toHaveLength(1);
  });

  it('broadcaster と一致しても trim 後の比較を行う（スペース混入防御）', () => {
    const users = [
      { userId: '141071773', count: 1, avatarUrl: '', nickname: '' }
    ];
    expect(
      categorizeUsersForThumbGrid(users, { broadcasterUserId: '  141071773  ' })
        .numericIdUsers
    ).toHaveLength(0);
  });
});
