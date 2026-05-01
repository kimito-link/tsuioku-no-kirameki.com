/**
 * userLaneCandidatesFromStorage の不変条件（契約駆動）
 *
 * I1: 同じ userId で 1 件でも avatarObserved:true → 集約後も true
 * I2: 全件 avatarObserved:false/undefined → 集約後も false
 * I3: 同じ userId で複数 nickname → 強ニック（'匿名'/'（未取得）'/'ゲスト' でない）を優先
 * I4: avatarUrl は pickStrongestAvatarUrlForUser 相当（非合成 https > 合成 canonical > 空）
 * I5: userId が空/null/undefined のエントリーは候補に含めない
 * I6: 関数は lvId を見ない（呼び出し側フィルタ前提）
 * I7: 入力配列を mutate しない（イミュータブル）
 * I8: 空配列入力 → 空配列出力
 * I9: 匿名 ID (a:xxxx, ハッシュ風) でも candidate には含める
 *     かつ avatarObserved の合成ルールは数値 ID と同じ挙動
 * I10: 同じ userId の nickname が両方とも弱ニックなら、いずれか 1 つを採用
 *      （'匿名' 同士なら '匿名' を返す）
 * I11: 第2引数 liveId フィルタと行の liveId/lvId の表記ゆれ（lv 接頭辞・大小）でも
 *      集約結果が 0 件にならない（同一放送として扱われる）
 */

import { describe, expect, it } from 'vitest';
import {
  niconicoDefaultUserIconUrl,
  pickStrongestAvatarUrlForUser
} from './supportGrowthTileSrc.js';

let userLaneCandidatesFromStorage;
try {
  ({ userLaneCandidatesFromStorage } = await import('./userLaneCandidatesFromStorage.js'));
} catch {
  // 未実装時は describe.skip で契約だけ先に置く
}
const maybe = typeof userLaneCandidatesFromStorage === 'function' ? describe : describe.skip;

const SYNTHETIC_CANONICAL_URL =
  'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/14196/141965615.jpg';
const PERSONAL_URL = 'https://example.com/custom-thumb.png';

/**
 * @param {Array<{ userId?: unknown, nickname?: unknown, avatarUrl?: unknown, avatarObserved?: boolean, liveId?: unknown }>} storedComments
 * @param {string} userId
 */
function pickCandidateByUserId(storedComments, userId) {
  const out = userLaneCandidatesFromStorage(storedComments);
  return out.find((row) => String(row?.userId || '') === userId);
}

maybe('userLaneCandidatesFromStorage invariants', () => {
  it.each([
    {
      name: 'I1: false + true の混在は true で集約される',
      storedComments: [
        { userId: '141965615', nickname: 'nora', avatarObserved: false },
        { userId: '141965615', nickname: 'nora', avatarObserved: true }
      ],
      userId: '141965615'
    },
    {
      name: 'I1: undefined + true の混在は true で集約される',
      storedComments: [
        { userId: '141965615', nickname: 'nora' },
        { userId: '141965615', nickname: 'nora', avatarObserved: true }
      ],
      userId: '141965615'
    },
    {
      name: 'I9: 匿名 a:xxxx でも true 優先で集約される',
      storedComments: [
        { userId: 'a:AbCdEfGhIjKlMnOp', nickname: '匿名', avatarObserved: false },
        { userId: 'a:AbCdEfGhIjKlMnOp', nickname: '匿名', avatarObserved: true }
      ],
      userId: 'a:AbCdEfGhIjKlMnOp'
    }
  ])('$name', ({ storedComments, userId }) => {
    const candidate = pickCandidateByUserId(storedComments, userId);
    expect(candidate).toBeTruthy();
    expect(candidate?.avatarObserved).toBe(true);
  });

  it.each([
    {
      name: 'I2: 全件 false の場合は false',
      storedComments: [
        { userId: '141965615', nickname: 'nora', avatarObserved: false },
        { userId: '141965615', nickname: 'nora', avatarObserved: false }
      ],
      userId: '141965615'
    },
    {
      name: 'I2: false + undefined の場合は false',
      storedComments: [
        { userId: '141965615', nickname: 'nora', avatarObserved: false },
        { userId: '141965615', nickname: 'nora' }
      ],
      userId: '141965615'
    },
    {
      name: 'I9: 匿名ハッシュ風 ID でも false 集約は維持される',
      storedComments: [
        { userId: 'KqwErTyUiOpAsDfGh', nickname: '匿名', avatarObserved: false },
        { userId: 'KqwErTyUiOpAsDfGh', nickname: 'ゲスト' }
      ],
      userId: 'KqwErTyUiOpAsDfGh'
    }
  ])('$name', ({ storedComments, userId }) => {
    const candidate = pickCandidateByUserId(storedComments, userId);
    expect(candidate).toBeTruthy();
    expect(candidate?.avatarObserved).toBe(false);
  });

  it.each([
    {
      name: 'I3: 弱ニック（匿名）より強ニックを優先',
      storedComments: [
        { userId: '88210441', nickname: '匿名' },
        { userId: '88210441', nickname: 'nora' }
      ],
      expectedNickname: 'nora'
    },
    {
      name: 'I3: 弱ニック（（未取得））より強ニックを優先',
      storedComments: [
        { userId: '88210441', nickname: '（未取得）' },
        { userId: '88210441', nickname: 'レコ' }
      ],
      expectedNickname: 'レコ'
    },
    {
      name: 'I3: 弱ニック（ゲスト）より強ニックを優先',
      storedComments: [
        { userId: '88210441', nickname: 'ゲスト' },
        { userId: '88210441', nickname: 'ソウルブラザー' }
      ],
      expectedNickname: 'ソウルブラザー'
    }
  ])('$name', ({ storedComments, expectedNickname }) => {
    const candidate = pickCandidateByUserId(storedComments, '88210441');
    expect(candidate).toBeTruthy();
    expect(candidate?.nickname).toBe(expectedNickname);
  });

  it.each([
    {
      name: 'I4: 非合成 https を最優先',
      userId: '141965615',
      urls: ['', SYNTHETIC_CANONICAL_URL, PERSONAL_URL],
      expectedAvatarUrl: PERSONAL_URL
    },
    {
      name: 'I4: 非合成が無い場合は合成 canonical',
      userId: '141965615',
      urls: ['', SYNTHETIC_CANONICAL_URL],
      expectedAvatarUrl: SYNTHETIC_CANONICAL_URL
    },
    {
      name: 'I4: URL が無い場合は空',
      userId: '141965615',
      urls: ['', '', '   '],
      expectedAvatarUrl: ''
    }
  ])('$name', ({ userId, urls, expectedAvatarUrl }) => {
    const storedComments = urls.map((avatarUrl, idx) => ({
      userId,
      nickname: `n${idx}`,
      avatarUrl
    }));
    const candidate = pickCandidateByUserId(storedComments, userId);
    expect(candidate).toBeTruthy();
    expect(candidate?.avatarUrl).toBe(expectedAvatarUrl);
    expect(candidate?.avatarUrl).toBe(
      pickStrongestAvatarUrlForUser(userId, urls)
    );
  });

  it.each([
    {
      name: 'I5: userId 空/null/undefined は候補に入れない',
      storedComments: [
        { userId: '', nickname: 'x', avatarObserved: true },
        { userId: null, nickname: 'y', avatarObserved: true },
        { userId: undefined, nickname: 'z', avatarObserved: true },
        { userId: '   ', nickname: 'w', avatarObserved: true },
        { userId: '141965615', nickname: 'ok', avatarObserved: false }
      ],
      expectedUserIds: ['141965615']
    }
  ])('$name', ({ storedComments, expectedUserIds }) => {
    const out = userLaneCandidatesFromStorage(storedComments);
    const userIds = out.map((row) => row.userId);
    expect(userIds).toEqual(expectedUserIds);
  });

  it.each([
    {
      name: 'I6: 同一 userId は lvId が違っても 1 候補へ集約',
      storedComments: [
        { lvId: 'lv1', userId: '141965615', nickname: '匿名', avatarObserved: false },
        { lvId: 'lv2', userId: '141965615', nickname: 'レコ', avatarObserved: true }
      ],
      userId: '141965615',
      expectedNickname: 'レコ',
      expectedObserved: true
    }
  ])('$name', ({ storedComments, userId, expectedNickname, expectedObserved }) => {
    const out = userLaneCandidatesFromStorage(storedComments);
    expect(out).toHaveLength(1);
    expect(out[0].userId).toBe(userId);
    expect(out[0].nickname).toBe(expectedNickname);
    expect(out[0].avatarObserved).toBe(expectedObserved);
  });

  it.each([
    {
      name: "I7: row.liveId='lv123', input='123'        → 集約 1 件",
      liveIdFilter: '123',
      storedComments: [
        {
          userId: '141965615',
          nickname: 'nora',
          liveId: 'lv123',
          avatarObserved: false
        },
        {
          userId: '99999999',
          nickname: 'other',
          liveId: 'lv999',
          avatarObserved: false
        }
      ],
      expectedUserId: '141965615'
    },
    {
      name: "I8: row.lvId='123'(liveId無), input='lv123' → 集約 1 件",
      liveIdFilter: 'lv123',
      storedComments: [
        {
          userId: '141965615',
          nickname: 'nora',
          lvId: '123',
          avatarObserved: false
        },
        {
          userId: '99999999',
          nickname: 'other',
          lvId: '999',
          avatarObserved: false
        }
      ],
      expectedUserId: '141965615'
    },
    {
      name: "I9: row.liveId='LV123',  input='lv123'     → 集約 1 件",
      liveIdFilter: 'lv123',
      storedComments: [
        {
          userId: '141965615',
          nickname: 'nora',
          liveId: 'LV123',
          avatarObserved: false
        },
        {
          userId: '99999999',
          nickname: 'other',
          liveId: 'LV999',
          avatarObserved: false
        }
      ],
      expectedUserId: '141965615'
    }
  ])('$name', ({ liveIdFilter, storedComments, expectedUserId }) => {
    const out = userLaneCandidatesFromStorage(storedComments, liveIdFilter);
    expect(out).toHaveLength(1);
    expect(out[0].userId).toBe(expectedUserId);
  });

  it.each([
    {
      name: 'I7: 入力配列と要素オブジェクトを mutate しない',
      storedComments: [
        {
          userId: '141965615',
          nickname: '匿名',
          avatarUrl: niconicoDefaultUserIconUrl('141965615'),
          avatarObserved: false
        },
        {
          userId: '141965615',
          nickname: 'レコ',
          avatarUrl: PERSONAL_URL,
          avatarObserved: true
        }
      ]
    }
  ])('$name', ({ storedComments }) => {
    const before = JSON.parse(JSON.stringify(storedComments));
    const firstRef = storedComments[0];
    const secondRef = storedComments[1];
    const out = userLaneCandidatesFromStorage(storedComments);
    expect(out.length).toBeGreaterThan(0);
    expect(storedComments).toEqual(before);
    expect(storedComments[0]).toBe(firstRef);
    expect(storedComments[1]).toBe(secondRef);
  });

  it.each([
    {
      name: 'I8: 空配列は空配列を返す',
      storedComments: []
    }
  ])('$name', ({ storedComments }) => {
    expect(userLaneCandidatesFromStorage(storedComments)).toEqual([]);
  });

  it.each([
    {
      name: 'I10: 弱ニック同士（匿名/ゲスト）はどちらかを採用',
      storedComments: [
        { userId: '141965615', nickname: '匿名' },
        { userId: '141965615', nickname: 'ゲスト' }
      ],
      acceptedNicknames: ['匿名', 'ゲスト']
    },
    {
      name: 'I10: 弱ニック同士（匿名/匿名）は匿名を返す',
      storedComments: [
        { userId: '141965615', nickname: '匿名' },
        { userId: '141965615', nickname: '匿名' }
      ],
      acceptedNicknames: ['匿名']
    }
  ])('$name', ({ storedComments, acceptedNicknames }) => {
    const candidate = pickCandidateByUserId(storedComments, '141965615');
    expect(candidate).toBeTruthy();
    expect(acceptedNicknames).toContain(candidate?.nickname);
  });
});

maybe('0.1.79: ギフト演出 DOM での broadcaster icon 取り違えガード', () => {
  const broadcasterUid = '99999';
  const broadcasterIconUrl =
    'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/9/99999.jpg';
  const viewerUid = '4046119';
  const viewerPersonalIcon = 'https://cdn.example/viewer-personal.jpg';
  const lvId = 'lv350427171';

  it('viewer のコメ記録に broadcaster icon が混入していても avatarUrl は別 URL になる', () => {
    const out = userLaneCandidatesFromStorage(
      [
        // 1 件目: 正しい個人サムネ
        {
          userId: viewerUid,
          nickname: '君斗りんく',
          avatarUrl: viewerPersonalIcon,
          capturedAt: 1,
          liveId: lvId
        },
        // 2 件目: ギフト演出 DOM 観測の汚染データ（broadcaster icon）
        {
          userId: viewerUid,
          nickname: '君斗りんく',
          avatarUrl: broadcasterIconUrl,
          capturedAt: 2,
          liveId: lvId
        }
      ],
      lvId,
      { broadcasterUid, broadcasterIconUrl }
    );
    const me = out.find((c) => c.userId === viewerUid);
    expect(me).toBeTruthy();
    expect(me?.avatarUrl).toBe(viewerPersonalIcon);
  });

  it('broadcaster 本人のコメ記録の broadcaster icon は通す', () => {
    const out = userLaneCandidatesFromStorage(
      [
        {
          userId: broadcasterUid,
          nickname: '配信者',
          avatarUrl: broadcasterIconUrl,
          capturedAt: 1,
          liveId: lvId
        }
      ],
      lvId,
      { broadcasterUid, broadcasterIconUrl }
    );
    const broadcaster = out.find((c) => c.userId === broadcasterUid);
    expect(broadcaster).toBeTruthy();
    expect(broadcaster?.avatarUrl).toBe(broadcasterIconUrl);
  });

  it('全コメが汚染データのみの viewer は avatarUrl 空（pickStrongestAvatarUrlForUser フォールバック）', () => {
    const out = userLaneCandidatesFromStorage(
      [
        {
          userId: viewerUid,
          nickname: '君斗りんく',
          avatarUrl: broadcasterIconUrl,
          capturedAt: 1,
          liveId: lvId
        }
      ],
      lvId,
      { broadcasterUid, broadcasterIconUrl }
    );
    const me = out.find((c) => c.userId === viewerUid);
    expect(me).toBeTruthy();
    // urls が全部除外されたら canonical fallback or '' のいずれか
    expect(me?.avatarUrl).not.toBe(broadcasterIconUrl);
  });

  it('query string が違うだけの broadcaster icon もブロック', () => {
    const out = userLaneCandidatesFromStorage(
      [
        {
          userId: viewerUid,
          nickname: '君斗りんく',
          avatarUrl: viewerPersonalIcon,
          capturedAt: 1,
          liveId: lvId
        },
        {
          userId: viewerUid,
          nickname: '君斗りんく',
          avatarUrl: `${broadcasterIconUrl}?cache_buster=42`,
          capturedAt: 2,
          liveId: lvId
        }
      ],
      lvId,
      { broadcasterUid, broadcasterIconUrl }
    );
    const me = out.find((c) => c.userId === viewerUid);
    expect(me?.avatarUrl).toBe(viewerPersonalIcon);
  });

  it('0.1.83 普遍ルール: opts 未指定でも URL の uid 不一致は弾く（最強ガード）', () => {
    const out = userLaneCandidatesFromStorage(
      [
        {
          userId: viewerUid,
          nickname: '君斗りんく',
          avatarUrl: broadcasterIconUrl, // 別人の uid を含む URL
          capturedAt: 1,
          liveId: lvId
        }
      ],
      lvId
    );
    const me = out.find((c) => c.userId === viewerUid);
    // 普遍ルールが効いて broadcaster icon は URL uid 不一致で弾かれる
    expect(me?.avatarUrl).not.toBe(broadcasterIconUrl);
  });

  it('0.1.83 普遍ルール: broadcasterIconUrl 未指定でも URL の uid 不一致で弾く', () => {
    const out = userLaneCandidatesFromStorage(
      [
        {
          userId: viewerUid,
          avatarUrl: broadcasterIconUrl,
          capturedAt: 1,
          liveId: lvId
        }
      ],
      lvId,
      { broadcasterUid, broadcasterIconUrl: '' }
    );
    const me = out.find((c) => c.userId === viewerUid);
    expect(me?.avatarUrl).not.toBe(broadcasterIconUrl);
  });
});
