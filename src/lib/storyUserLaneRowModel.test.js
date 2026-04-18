import { describe, expect, it } from 'vitest';
import { niconicoDefaultUserIconUrl } from './supportGrowthTileSrc.js';
import {
  buildStoryUserLaneCandidateRow,
  userLaneProfileCompletenessTier
} from './storyUserLaneRowModel.js';

const pickCtx = {
  yukkuriSrc: 'images/yukkuri.png',
  tvSrc: 'images/tv.svg',
  anonymousIdenticonEnabled: true,
  anonymousIdenticonDataUrl:
    'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E'
};

describe('userLaneProfileCompletenessTier', () => {
  it('数値ID + 個人サムネ http あり → りんく(3)', () => {
    expect(
      userLaneProfileCompletenessTier(
        {
          userId: '88210441',
          nickname: 'nora',
          avatarUrl: ''
        },
        'https://example.com/u.jpg'
      )
    ).toBe(3);
  });

  it('数値ID + 強ニック + 個人サムネなし → りんく(3) [Phase 1.5 revised]', () => {
    // Phase 1.5 で挙動変更。旧設計では konta(2) に落ちていたが、ニコ生の大多数の
    // 個人タイルが konta に吸われて link 段が空になる退行を招いていた。
    // 新 policy では「非匿名 + 強ニック」の組で link 昇格（観測なしでも）。
    expect(
      userLaneProfileCompletenessTier(
        { userId: '12345', nickname: 'たろう', avatarUrl: '' },
        ''
      )
    ).toBe(3);
  });

  it('数値ID + 強ニック + avatarObserved=true は tier 3（りんく）— DOM でアバター描画を確認している', () => {
    // 直前の fix では hasPersonalThumb のみで判定していたため、ニコ生が配信する
    // `usericon/s/<bucket>/<uid>.jpg`（合成 canonical と一致する URL）では
    // 実際には個人アバターが見えていても link に上がらず konta に落ちていた。
    // avatarObserved=true のときは URL 形式にかかわらず「個人アバター確定」として
    // りんく段に格上げする。
    expect(
      userLaneProfileCompletenessTier(
        {
          userId: '25221924',
          nickname: 'レコ',
          avatarUrl: '',
          avatarObserved: true
        },
        ''
      )
    ).toBe(3);
  });

  it('avatarObserved なしの数値ID＋強ニック＋URL 無しは tier 3（りんく）[Phase 1.5 revised]', () => {
    // Phase 1.5 で挙動変更。strongNick + 数値 ID は link 段で受ける（観測なしでも）。
    expect(
      userLaneProfileCompletenessTier(
        {
          userId: '25221924',
          nickname: 'レコ',
          avatarUrl: ''
        },
        ''
      )
    ).toBe(3);
  });

  it('avatarObserved なしで httpCandidate が合成 canonical だけでも数値ID+強ニックは tier 3 [Phase 1.5 revised]', () => {
    // Phase 1.5 で挙動変更。strongNick が決まっているので link に昇格。
    // 合成 canonical URL は link 判定の根拠にはならないが、strongNick だけで十分。
    expect(
      userLaneProfileCompletenessTier(
        { userId: '2201069', nickname: 'ソウルブラザー', avatarUrl: '' },
        'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/220/2201069.jpg'
      )
    ).toBe(3);
  });

  it('avatarObserved=true のユーザは httpCandidate が合成 canonical でも tier 3（りんく）', () => {
    // スクリーンショットで「こん太に良質ユーザー（数値ID+個人アバター観測済み）が
    // 漏れている」と報告されたケース。DOM で avatar 描画が見えている以上、
    // URL が合成形式と一致していても実物のアバターがあると判断して link に上げる。
    expect(
      userLaneProfileCompletenessTier(
        {
          userId: '2201069',
          nickname: 'ソウルブラザー',
          avatarUrl: '',
          avatarObserved: true
        },
        'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/220/2201069.jpg'
      )
    ).toBe(3);
  });

  it('匿名ID(a:) + 強ニック + 個人サムネなしは tier 1（たぬ姉、こん太に混ぜない）', () => {
    // 旧実装は konta(2) に混入させていた（スクリーンショットの a:uNU1… 問題）。
    expect(
      userLaneProfileCompletenessTier(
        {
          userId: 'a:AbCdEfGhIjKlMnOp',
          nickname: 'のら',
          avatarUrl: '',
          avatarObserved: true
        },
        ''
      )
    ).toBe(1);
  });

  it('匿名ID(a:) + 強ニック + 個人サムネ http ありでも tier 1（たぬ姉）', () => {
    // 「非匿名+カスタム名+個人サムネ」が成立しても匿名は上段に出さない。
    expect(
      userLaneProfileCompletenessTier(
        {
          userId: 'a:AbCdEfGhIjKlMnOp',
          nickname: 'のら',
          avatarUrl: 'https://example.com/personal.jpg',
          avatarObserved: true
        },
        'https://example.com/personal.jpg'
      )
    ).toBe(1);
  });

  it('匿名ID(a:) + 弱ニック + 個人サムネなしは tier 1（たぬ姉）', () => {
    expect(
      userLaneProfileCompletenessTier(
        { userId: 'a:abcdefghijkl', nickname: '匿名', avatarUrl: '' },
        ''
      )
    ).toBe(1);
  });

  it('ハッシュ風 ID（数値でも a: でもない）も匿名扱いで tier 1', () => {
    // isAnonymousStyleNicoUserId は ^\d{5,14}$ 以外を全て匿名扱いとする。
    expect(
      userLaneProfileCompletenessTier(
        {
          userId: 'KqwErTyUiOpAsDfGh',
          nickname: 'はち',
          avatarUrl: ''
        },
        ''
      )
    ).toBe(1);
  });

  it('個人サムネがあれば表示名が弱くても tier 3（link）', () => {
    expect(
      userLaneProfileCompletenessTier(
        {
          userId: '25221924',
          nickname: 'ゲスト',
          avatarUrl: 'https://example.com/personal.jpg',
          avatarObserved: true
        },
        'https://example.com/personal.jpg'
      )
    ).toBe(3);
  });

  it('個人サムネなし + 表示名が弱い場合は tier 2（konta 過渡状態）[Phase 1.5 revised]', () => {
    // Phase 1.5 で挙動変更。非匿名なら link / konta の 2 値のみ候補になり、
    // link に昇格できなければ konta に置く（たぬ姉は匿名専用）。
    // 旧実装は tier 1（tanu）に落としていたが、匿名でない以上 tanu には入れない。
    expect(
      userLaneProfileCompletenessTier(
        {
          userId: '715502',
          nickname: 'ゲスト',
          avatarUrl: ''
        },
        ''
      )
    ).toBe(2);
  });

  it('userId 空は tier 0（候補から除外される）', () => {
    expect(
      userLaneProfileCompletenessTier(
        { userId: '', nickname: 'のら', avatarUrl: '' },
        ''
      )
    ).toBe(0);
  });
});

/**
 * 再発防止用の「契約（invariants）」テスト。
 *
 * このスイートの各ケースは「応援レーンの視認性／混入の既知バグ」を 1 本ずつ釘で留めるための
 * 不変条件を書き出している。以下のいずれかが落ちたら、過去に fix 済みのバグが再発した可能性が高い:
 *
 *  I1: 匿名 (a:xxxx / ハッシュ風 ID) は強ニック・個人サムネ・avatarObserved
 *      があっても tier 1 から上げない（「こん太への匿名混入」「りんくへの匿名昇格」防止）
 *  I2: 非匿名 + avatarObserved=true は合成 canonical URL（ニコ生の大多数の個人サムネ）
 *      であっても tier 3（「良質ユーザーがこん太に漏れる」「りんくが実質空」防止）
 *  I3: 非匿名 + 明確な個人サムネ（非合成・外部 CDN）は observed が未確定でも tier 3
 *  I4: 非匿名 + 強ニック + URL も avatarObserved も無いときは tier 2（こん太段が枯れない）
 *  I5: userId 空／null／欠損は tier 0（候補から除外、UI に「空ユーザー」は出さない）
 *
 * いずれも過去に少なくとも 1 度は退行が確認されているため、ここでは「具体値」ではなく
 * 複数サンプルで繰り返しチェックして、条件分岐の 1 本が壊れても気付ける形にする。
 */
describe('userLaneProfileCompletenessTier: 再発防止の契約テスト', () => {
  const anonymousIds = [
    'a:AbCdEfGhIjKlMnOp',
    'a:xyz123',
    'a:ZyWvUtSrQpOnMlKj',
    'KqwErTyUiOpAsDfGh', // ハッシュ風 — isAnonymousStyleNicoUserId が true を返す
    'unknown-12345-x' // ハッシュ風（10〜26 文字の英数_-）
  ];
  const numericIds = ['88210441', '25221924', '2201069'];

  describe('I1: 匿名 ID は何があっても tier 1 から上げない', () => {
    for (const uid of anonymousIds) {
      it(`${uid} + 強ニック + 個人URL + observed でも tier 1`, () => {
        expect(
          userLaneProfileCompletenessTier(
            {
              userId: uid,
              nickname: 'プロ配信者',
              avatarUrl: 'https://cdn.example/personal.jpg',
              avatarObserved: true
            },
            'https://cdn.example/personal.jpg'
          )
        ).toBe(1);
      });
    }
  });

  describe('I2: 非匿名 + avatarObserved=true は URL 形式に関係なく tier 3', () => {
    for (const uid of numericIds) {
      it(`${uid} observed=true + 合成 canonical URL でも tier 3`, () => {
        // 合成 canonical URL: ニコ生の大多数の個人サムネが流れてくる形
        const bucket = uid.slice(0, Math.max(1, uid.length - 4));
        expect(
          userLaneProfileCompletenessTier(
            {
              userId: uid,
              nickname: 'レコ',
              avatarUrl: '',
              avatarObserved: true
            },
            `https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/${bucket}/${uid}.jpg`
          )
        ).toBe(3);
      });
    }
  });

  describe('I3: 非匿名 + 個人サムネ（非合成 URL）は observed 無しでも tier 3', () => {
    for (const uid of numericIds) {
      it(`${uid} + 外部 CDN 個人 URL（observed 無し）→ tier 3`, () => {
        expect(
          userLaneProfileCompletenessTier(
            {
              userId: uid,
              nickname: '',
              avatarUrl: 'https://cdn.example/face.png'
            },
            'https://cdn.example/face.png'
          )
        ).toBe(3);
      });
    }
  });

  describe('I4 (revised, Phase 1.5): 非匿名 + 強ニック → tier 3（りんく段が枯れない）', () => {
    // 旧契約: strongNick のみ → konta(2)
    // 新契約: strongNick のみ → link(3)
    //   旧挙動だとニコ生の大多数の個人タイルが konta に落ちて link が実質空になる
    //   退行を招いていた（docs/lane-architecture-redesign.md §1.3）。
    //   新 policy では「非匿名 + 強ニック」の組で link 昇格する。
    for (const uid of numericIds) {
      it(`${uid} 強ニックだけ → tier 3`, () => {
        expect(
          userLaneProfileCompletenessTier(
            { userId: uid, nickname: 'たろう', avatarUrl: '' },
            ''
          )
        ).toBe(3);
      });
    }
  });

  describe('I5: userId 欠損は tier 0（候補から除外）', () => {
    it('空文字 → 0', () => {
      expect(
        userLaneProfileCompletenessTier(
          { userId: '', nickname: 'のら', avatarUrl: '' },
          ''
        )
      ).toBe(0);
    });
    it('null → 0', () => {
      expect(
        userLaneProfileCompletenessTier(
          { userId: null, nickname: 'のら', avatarUrl: '' },
          ''
        )
      ).toBe(0);
    });
    it('entry 自体が null → 0', () => {
      expect(userLaneProfileCompletenessTier(null, '')).toBe(0);
    });
    it('entry 自体が undefined → 0', () => {
      expect(userLaneProfileCompletenessTier(undefined, '')).toBe(0);
    });
  });
});

describe('buildStoryUserLaneCandidateRow', () => {
  it('http が合成でも stored が個人なら display に個人 URL が使われる', () => {
    const uid = '21552210';
    const syn = niconicoDefaultUserIconUrl(uid);
    const personal = 'https://cdn.example/face.png';
    const row = buildStoryUserLaneCandidateRow(
      {
        userId: uid,
        nickname: 'user 0539Z74OJ13',
        avatarUrl: personal
      },
      5,
      syn,
      pickCtx
    );
    expect(row).not.toBeNull();
    expect(row?.httpForLane).toBe(personal);
    expect(row?.displaySrc).toBe(personal);
    expect(row?.profileTier).toBe(3);
  });

  it('匿名・たぬ姉段では表示 src は Identicon（メタ用 http はマージ結果のまま）', () => {
    // 旧仕様では tier=2 (こん太) を期待していたが、a:xxxx 匿名は新仕様で tier=1 (たぬ姉) に固定。
    // 表示側 (pickStoryUserLaneCellDisplaySrc) は tier<3 かつ a:xxxx で http を剥がして
    // Identicon に寄せるため、たぬ姉段でも同じ Identicon が出る。
    const http = 'https://cdn.example/a.jpg';
    const row = buildStoryUserLaneCandidateRow(
      {
        userId: 'a:abcdefghijkl',
        nickname: '匿名',
        avatarUrl: ''
      },
      1,
      http,
      pickCtx
    );
    expect(row).not.toBeNull();
    expect(row?.profileTier).toBe(1);
    expect(row?.httpForLane).toBe(http);
    expect(row?.profileTier).toBe(1);
    expect(row?.displaySrc).toBe(pickCtx.anonymousIdenticonDataUrl);
  });

  it('httpForLane が個人サムネなら tier 判定にも反映される', () => {
    const row = buildStoryUserLaneCandidateRow(
      {
        userId: '88210441',
        nickname: 'nora',
        avatarUrl: ''
      },
      2,
      'https://example.com/u.jpg',
      pickCtx
    );
    expect(row).not.toBeNull();
    expect(row?.profileTier).toBe(3);
  });
});
