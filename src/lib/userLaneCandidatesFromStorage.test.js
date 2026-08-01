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
 *      同一放送として正しくマッチする（ただし該当行が 1 件も無ければ空配列）
 */

import { describe, expect, it } from 'vitest';
import {
  niconicoDefaultUserIconUrl,
  pickStrongestAvatarUrlForUser
} from './supportGrowthTileSrc.js';
import { resolveLaneTier } from '../domain/lane/tier.js';

let userLaneCandidatesFromStorage;
let enrichUserLaneAggregatesWithProfileAndDisplay;
try {
  ({
    userLaneCandidatesFromStorage,
    enrichUserLaneAggregatesWithProfileAndDisplay
  } = await import('./userLaneCandidatesFromStorage.js'));
} catch {
  // 未実装時は describe.skip で契約だけ先に置く
}
const maybe = typeof userLaneCandidatesFromStorage === 'function' ? describe : describe.skip;
const maybeEnrich =
  typeof enrichUserLaneAggregatesWithProfileAndDisplay === 'function' ? describe : describe.skip;

const SYNTHETIC_CANONICAL_URL =
  'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/14196/141965615.jpg';
const PERSONAL_URL = 'https://example.com/custom-thumb.png';

/**
 * @param {Array<{ userId?: unknown, nickname?: unknown, avatarUrl?: unknown, avatarObserved?: boolean, liveId?: unknown, text?: unknown }>} storedComments
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

  it('requireText: true ではコメント本文なしのユーザー候補を除外する', () => {
    const out = userLaneCandidatesFromStorage(
      [
        { liveId: 'lv1', userId: '142991637', nickname: '配信者', text: '' },
        { liveId: 'lv1', userId: '17449156', nickname: 'でんでんぽ', text: 'こんにちは' }
      ],
      'lv1',
      { requireText: true }
    );

    expect(out.map((row) => row.userId)).toEqual(['17449156']);
  });

  it.each([
    {
      name: 'I3: 弱ニック（匿名）より強ニックを優先',
      userId: '88210441',
      storedComments: [
        { userId: '88210441', nickname: '匿名' },
        { userId: '88210441', nickname: 'nora' }
      ],
      expectedNickname: 'nora'
    },
    {
      name: 'I3: 弱ニック（（未取得））より強ニックを優先',
      userId: '88210441',
      storedComments: [
        { userId: '88210441', nickname: '（未取得）' },
        { userId: '88210441', nickname: 'レコ' }
      ],
      expectedNickname: 'レコ'
    },
    {
      name: 'I3: 弱ニック（ゲスト）より強ニックを優先',
      userId: '88210441',
      storedComments: [
        { userId: '88210441', nickname: 'ゲスト' },
        { userId: '88210441', nickname: 'ソウルブラザー' }
      ],
      expectedNickname: 'ソウルブラザー'
    },
    {
      name: 'I3 拡張: 新しいコメントが英字でも古い行の和文を維持',
      userId: '4046119',
      storedComments: [
        {
          userId: '4046119',
          nickname: '君斗りんく＠クリエイター応援',
          capturedAt: 1000
        },
        { userId: '4046119', nickname: 'perfectbattingball', capturedAt: 2000 }
      ],
      expectedNickname: '君斗りんく＠クリエイター応援'
    }
  ])('$name', ({ storedComments, expectedNickname, userId }) => {
    const candidate = pickCandidateByUserId(storedComments, userId);
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

  it('v0.1.373: 当ライブ一致 0 件なら別ライブユーザーは混入しない（全件フォールバック廃止）', () => {
    const out = userLaneCandidatesFromStorage(
      [
        {
          userId: '111',
          nickname: 'OtherLive',
          liveId: 'lv999',
          text: 'hi',
          capturedAt: 1
        },
        {
          userId: '222',
          nickname: 'AlsoOther',
          lvId: '888',
          text: 'x',
          capturedAt: 2
        }
      ],
      'lv123'
    );
    expect(out).toHaveLength(0);
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

  it('同一 userId で stamp 行より実名行を集約ニックに優先', () => {
    const storedComments = [
      {
        userId: '6292820',
        nickname: 'stamp_applause',
        avatarUrl: 'https://example.com/a.png',
        capturedAt: 2,
        liveId: 'lv888'
      },
      {
        userId: '6292820',
        nickname: 'Chiharu',
        avatarUrl: 'https://example.com/b.png',
        capturedAt: 1,
        liveId: 'lv888',
        avatarObserved: true
      }
    ];
    const out = userLaneCandidatesFromStorage(storedComments, 'lv888');
    const row = out.find((r) => r.userId === '6292820');
    expect(row?.nickname).toBe('Chiharu');
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

  // v0.1.901 方針転換: 配信者本人(放送主)は「応援者(viewer)」ではないので popup の応援列からも
  //   会場の席からも除外する(実機で peropanda 本人が会場席に座っていた=ユーザー指摘)。
  //   旧テスト「本人の broadcaster icon は通す」は本人を【列に残す】前提だったが、新方針では本人を
  //   候補そのものから落とす。本人除外は uid 一致だけで効く(iconUrl は不要)。
  it('broadcaster 本人(uid 一致)は候補から除外される', () => {
    const out = userLaneCandidatesFromStorage(
      [
        {
          userId: broadcasterUid,
          nickname: '配信者',
          avatarUrl: broadcasterIconUrl,
          capturedAt: 1,
          liveId: lvId,
          text: 'こんばんは'
        },
        {
          userId: viewerUid,
          nickname: '君斗りんく',
          avatarUrl: viewerPersonalIcon,
          capturedAt: 2,
          liveId: lvId,
          text: 'おつ'
        }
      ],
      lvId,
      { broadcasterUid, broadcasterIconUrl }
    );
    // 本人は消える・viewer は残る
    expect(out.find((c) => c.userId === broadcasterUid)).toBeFalsy();
    expect(out.find((c) => c.userId === viewerUid)).toBeTruthy();
  });

  it('iconUrl が無くても broadcasterUid だけで本人は除外される', () => {
    const out = userLaneCandidatesFromStorage(
      [
        {
          userId: broadcasterUid,
          nickname: '配信者',
          capturedAt: 1,
          liveId: lvId,
          text: 'やあ'
        }
      ],
      lvId,
      { broadcasterUid } // iconUrl 無し=アイコン化けガードは無効だが本人除外は効く
    );
    expect(out.find((c) => c.userId === broadcasterUid)).toBeFalsy();
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

maybeEnrich('enrichUserLaneAggregatesWithProfileAndDisplay', () => {
  it('プロファイルキャッシュの表示名でストレージの弱ニックを置き換える', () => {
    const agg = Object.freeze([
      Object.freeze({
        userId: '4046119',
        nickname: '匿名',
        avatarUrl: '',
        avatarObserved: false,
        liveId: 'lv1'
      })
    ]);
    const out = enrichUserLaneAggregatesWithProfileAndDisplay(agg, [], {
      '4046119': { nickname: 'perfectbattingball' }
    });
    expect(out[0].nickname).toBe('perfectbattingball');
  });

  it('displayEntries の強ニックでストレージ空を補完する', () => {
    const agg = Object.freeze([
      Object.freeze({
        userId: '4046119',
        nickname: '',
        avatarUrl: '',
        avatarObserved: false,
        liveId: 'lv1'
      })
    ]);
    const display = [{ userId: '4046119', nickname: 'fromDisplay', capturedAt: 100 }];
    const out = enrichUserLaneAggregatesWithProfileAndDisplay(agg, display, {});
    expect(out[0].nickname).toBe('fromDisplay');
  });

  it('内部ラベルは intercept（プロファイル）で置換される', () => {
    const agg = Object.freeze([
      Object.freeze({
        userId: '10170134',
        nickname: 'nicolive_audition_lightgreen',
        avatarUrl: '',
        avatarObserved: false,
        liveId: 'lv1'
      })
    ]);
    const out = enrichUserLaneAggregatesWithProfileAndDisplay(agg, [], {
      '10170134': { nickname: '本家表示名' }
    });
    expect(out[0].nickname).toBe('本家表示名');
  });

  it('変更なしなら同一参照の配列を返す', () => {
    const row = Object.freeze({
      userId: '4046119',
      nickname: 'stable',
      avatarUrl: '',
      avatarObserved: false,
      liveId: 'lv1'
    });
    const agg = Object.freeze([row]);
    const out = enrichUserLaneAggregatesWithProfileAndDisplay(agg, [], {});
    expect(out).toBe(agg);
    expect(out[0]).toBe(row);
  });

  it('集約が stamp のみでもプロファイルで Chiharu に補強される', () => {
    const agg = Object.freeze([
      Object.freeze({
        userId: '6292820',
        nickname: 'stamp_applause',
        avatarUrl: 'https://example.com/t.png',
        avatarObserved: true,
        liveId: 'lv1'
      })
    ]);
    const out = enrichUserLaneAggregatesWithProfileAndDisplay(agg, [], {
      '6292820': { nickname: 'Chiharu' }
    });
    expect(out[0].nickname).toBe('Chiharu');
  });

  // --- F3(v0.1.282): 実 avatar 観測 → avatarObserved 昇格 → link 段 ---
  it('F3: profileMap の実 avatar 観測で弱ニック数値IDも avatarObserved 昇格→link(3)', () => {
    const agg = Object.freeze([
      Object.freeze({
        userId: '25221924',
        nickname: 'ゲスト',
        avatarUrl: '',
        avatarObserved: false,
        liveId: 'lv1'
      })
    ]);
    const out = enrichUserLaneAggregatesWithProfileAndDisplay(agg, [], {
      '25221924': { avatarUrl: 'https://example.com/personal.jpg', updatedAt: 1 }
    });
    expect(out[0].avatarObserved).toBe(true);
    // ユーザー可視の結果: りんく段（tier 3）へ正しく上がる
    expect(
      resolveLaneTier({
        userId: out[0].userId,
        nickname: out[0].nickname,
        avatarObserved: out[0].avatarObserved
      })
    ).toBe(3);
  });

  it('F3: profileMap に avatar が無ければ avatarObserved は false のまま（konta=2）', () => {
    const agg = Object.freeze([
      Object.freeze({
        userId: '25221924',
        nickname: 'ゲスト',
        avatarUrl: '',
        avatarObserved: false,
        liveId: 'lv1'
      })
    ]);
    const out = enrichUserLaneAggregatesWithProfileAndDisplay(agg, [], {
      '25221924': { nickname: 'ゲスト' }
    });
    expect(out[0].avatarObserved).toBe(false);
    expect(
      resolveLaneTier({
        userId: out[0].userId,
        nickname: out[0].nickname,
        avatarObserved: out[0].avatarObserved
      })
    ).toBe(2);
  });

  it('F3: 既存 avatarObserved:true は profileMap 不在でも保持（加法・退行なし）', () => {
    const row = Object.freeze({
      userId: '25221924',
      nickname: 'ゲスト',
      avatarUrl: '',
      avatarObserved: true,
      liveId: 'lv1'
    });
    const out = enrichUserLaneAggregatesWithProfileAndDisplay(
      Object.freeze([row]),
      [],
      {}
    );
    expect(out[0].avatarObserved).toBe(true);
  });

  /**
   * v0.1.1221 回帰: enrich が「変更した人」のフィールドを取りこぼさないこと。
   *
   * ★このテストは【本番の producer が作った集約】をそのまま enrich へ渡す。
   *   手書きの集約(このファイルの他テスト)は元から余分なキーを持たないので、
   *   5キーだけ書き写す実装でも緑になってしまい、実機でだけ壊れていた。
   *   producer と enrich の結合をここで断言する。
   */
  it('★v0.1.1221: nickname を変えた人でも producer 由来の全フィールドが残る', () => {
    const rows = [
      { userId: '55141222', nickname: '匿名', text: 'こんばんは', capturedAt: 1000, liveId: 'lv1' },
      { userId: '55141222', nickname: '匿名', text: 'たのしい', capturedAt: 3000, liveId: 'lv1' }
    ];
    const agg = userLaneCandidatesFromStorage(rows, 'lv1', {});
    // 前提: producer はこれらを出している(出していなければテストの前提が崩れている)
    expect(agg[0].recentTexts?.length).toBeGreaterThan(0);
    expect(agg[0].commentCount).toBe(2);

    // nickname が変わる=enrich が新しいオブジェクトを作る経路に入る
    const out = enrichUserLaneAggregatesWithProfileAndDisplay(agg, rows, {
      '55141222': { nickname: 'だるま' }
    });
    expect(out[0].nickname).toBe('だるま');

    // ここが本体: 変更していないフィールドが消えていないこと
    expect(out[0].recentTexts).toEqual(agg[0].recentTexts);
    expect(out[0].commentCount).toBe(2);
    expect(out[0].giftCount).toBe(0);
    expect(out[0]._laneSortAt).toBe(3000);
  });

  it('★v0.1.1221: producer が持つキー集合が enrich 後も欠けない', () => {
    const rows = [
      { userId: '55141222', nickname: '匿名', text: 'a', capturedAt: 1000, liveId: 'lv1' }
    ];
    const agg = userLaneCandidatesFromStorage(rows, 'lv1', {});
    const out = enrichUserLaneAggregatesWithProfileAndDisplay(agg, rows, {
      '55141222': { nickname: 'だるま' }
    });
    const lost = Object.keys(agg[0]).filter((k) => !(k in out[0]));
    expect(lost).toEqual([]);
  });
});
