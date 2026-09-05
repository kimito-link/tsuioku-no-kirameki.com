import { describe, expect, it } from 'vitest';
import {
  bucketVenueLaneSeats,
  flattenVenueLaneBuckets,
  venueSeatEntryToLaneItem
} from './venueLaneBuckets.js';
import { niconicoDefaultUserIconUrl } from './supportGrowthTileSrc.js';

function seat(seatIndex, userId, name, avatar = '', extra = {}) {
  return {
    seatIndex,
    participant: {
      key: `u:${userId}`,
      userId,
      name,
      avatar,
      lastAt: 1000 + seatIndex,
      ...extra
    },
    venueRank: extra.venueRank || 0
  };
}

describe('venueSeatEntryToLaneItem', () => {
  it('会場 participant を人物タイル用 item に写す', () => {
    const item = venueSeatEntryToLaneItem(
      seat(2, '12345', '太郎', 'https://cdn.example/12345.jpg', { venueRank: 1 })
    );

    expect(item?.entry.userId).toBe('12345');
    expect(item?.title).toBe('太郎');
    expect(item?.profileTier).toBe(3);
    expect(item?._venueSeatIndex).toBe(2);
    expect(item?._venueParticipantKey).toBe('u:12345');
  });

  it('配信者ID未確定ケースでも数値ID候補を落とさない', () => {
    const item = venueSeatEntryToLaneItem(seat(0, '67890', '', ''));

    expect(item).not.toBeNull();
    expect(item?.entry.userId).toBe('67890');
    expect(item?.profileTier).toBeGreaterThanOrEqual(2);
  });

  it('匿名IDはたぬ姉段へ落とし、identicon を持たせる', () => {
    const item = venueSeatEntryToLaneItem(seat(3, 'a:anon-1', '', ''));

    expect(item?.profileTier).toBe(1);
    expect(item?.displaySrc).toMatch(/^data:image\/svg\+xml/);
    expect(item?.meta.idLine).not.toBe('');
  });

  // --- v0.1.1117 白円根治(P3): displaySrc は①正本(buildStoryUserLaneCandidateRow)へ委譲 ---
  describe('P3 導出委譲(①とバイト一致)', () => {
    it('数値ID・個人サムネ未取得は①と同一の合成URL(niconicoDefaultUserIconUrl)になる', () => {
      const item = venueSeatEntryToLaneItem(seat(1, '22222', '', ''));
      expect(item?.displaySrc).toBe(niconicoDefaultUserIconUrl('22222'));
      expect(item?.displaySrc).toContain('/usericon/s/2/22222.jpg');
    });

    it('短い数値ID(5桁未満)は旧式の「必ず404の推測URL」を作らない=①と同じく匿名系扱い', () => {
      // 旧実装(deriveNicoUserIconUrl=\\d{2,15}+bucket0許容)は https://…/s/0/1234.jpg を直入れしていた。
      const item = venueSeatEntryToLaneItem(seat(0, '1234', '', ''));
      expect(item?.displaySrc).not.toMatch(/^https?:/);
      expect(item?.displaySrc).toMatch(/^data:image\/svg\+xml/); // ①の匿名系規則=identicon
    });

    it('個人サムネ既知(enrich済み)はそのURLを①と同じガード経路で通す', () => {
      const av = 'https://cdn.example/av/11111.png';
      const item = venueSeatEntryToLaneItem(seat(2, '11111', '太郎', av));
      expect(item?.displaySrc).toBe(av);
    });

    it('characterization: _venueIsVip は旧式のまま(P3で金縁の顔ぶれを変えない)', () => {
      // 数値ID・avatar無し=旧式では推測URLが立つ→VIP true(据え置き)。
      expect(venueSeatEntryToLaneItem(seat(0, '22222', '', ''))?._venueIsVip).toBe(true);
      // 匿名・avatar無し=旧式でも http 無し→VIP false(据え置き)。
      expect(venueSeatEntryToLaneItem(seat(1, 'a:anon-1', '', ''))?._venueIsVip).toBe(false);
    });

    it('pickCtx を渡さなくても崩れない(lib既定=①既定と同値・地雷#3の構造防止)', () => {
      const anon = venueSeatEntryToLaneItem(seat(0, 'a:anon-2', '', ''));
      expect(anon?.displaySrc).toMatch(/^data:image\/svg\+xml/);
      const numeric = venueSeatEntryToLaneItem(seat(1, '333333', '', ''));
      expect(numeric?.displaySrc).toBe(niconicoDefaultUserIconUrl('333333'));
    });
  });
});

describe('bucketVenueLaneSeats', () => {
  /*
   * ★v0.1.1375(ユーザー確定 2026-08-12): 匿名は【たぬ姉段に出す】。
   *
   * ■ 何が起きていたか(実機)
   *   「会場モードが りんくのみで こん太 たぬ姉が反映されてない」
   *   速報の会場行も `link7 gift0 ad4 konta0 tanu332`。
   *
   * ■ なぜ旧契約(2026-07-14 の匿名除外)を取り下げたか
   *   会場の設計正本(venueSeats.js 冒頭・2026-06-17 ユーザー確定)はこう書いている:
   *     「匿名(a:xxx・184)か数値IDかは無関係＝アクションした人は全員、会場の主役」
   *     「userId があれば匿名でも座る」「匿名も同じ土俵」
   *   さらに段の正本 src/domain/lane/tier.js は【匿名を必ず たぬ姉段(tier1)】に置く契約
   *   (matchesTanuPolicy が最優先＝たぬ姉段の存在理由そのもの)。
   *   ①POP(popup-entry.js:6957)も匿名を除外していない。
   *   ★つまり 2026-07-14 の除外こそが【会場だけの独自ルール】で、
   *     同じコメントが掲げた「①と完全に同じ顔ぶれ」を自分で破っていた
   *     ([[decisions-accumulate-into-regressions-2026-08-11]])。
   *
   * ★uid 無しの除外は【維持】(正本 resolveLaneTier でも tier=0=候補除外)。
   */
  it('★匿名(a:)は たぬ姉段に出す(2026-08-12 ユーザー確定・除外を撤回)', () => {
    const buckets = bucketVenueLaneSeats([
      seat(0, 'a:1', '', ''),
      seat(1, '22222', '', ''),
      seat(2, '11111', '強い名前', 'https://cdn.example/11111.jpg')
    ]);

    expect(buckets.link.map((x) => x.entry.userId)).toEqual(['11111']);
    expect(buckets.konta.map((x) => x.entry.userId)).toEqual(['22222']);
    // ★ここが撤回点: 旧実装は [] だった(匿名を段の手前で全除外していた)。
    expect(buckets.tanu.map((x) => x.entry.userId)).toEqual(['a:1']);
  });

  it('maxTotal は5段合計の上限として効く', () => {
    const buckets = bucketVenueLaneSeats(
      [
        seat(0, '11111', 'A', 'https://cdn.example/1.jpg'),
        seat(1, '22222', 'B', 'https://cdn.example/2.jpg'),
        seat(2, '33333', '', ''),
        seat(3, 'a:1', '', '')
      ],
      { maxTotal: 2 }
    );

    expect(flattenVenueLaneBuckets(buckets).map((x) => x.entry.userId)).toEqual(['11111', '22222']);
  });

  // --- ★v0.1.1375: 無uid【だけ】を除外する(匿名は たぬ姉段に出す) ---
  it('★無uidは段に出ない / 匿名は たぬ姉段に出る', () => {
    const b = bucketVenueLaneSeats([
      seat(0, '11111', '太郎', 'https://cdn.example/11111.jpg'),
      seat(1, 'a:anon-1', '匿名でも名前あり', ''),
      seat(2, 'a:anon-2', '', ''),
      seat(3, '22222', '', ''),
      seat(4, '', '無uid', '') // uid 無しは正本でも tier=0=候補除外
    ]);
    const ids = flattenVenueLaneBuckets(b).map((x) => x.entry.userId);
    // 無uid は出ない(除外は維持)。
    expect(ids).not.toContain('');
    // ★匿名は出る(旧実装では消えていた=会場が「りんくのみ」になった真因)。
    expect(b.tanu.map((x) => x.entry.userId)).toEqual(['a:anon-1', 'a:anon-2']);
    // 名前あり/数値IDは従来どおり上の段に残る(匿名に埋もれない)。
    expect(b.link.map((x) => x.entry.userId)).toEqual(['11111']);
    expect(b.konta.map((x) => x.entry.userId)).toEqual(['22222']);
  });

  /*
   * ★匿名が増えても【名前ありの人が押し出されない】ことを断言する。
   *   これが崩れると「匿名を出す」判断が、名前ありの応援を埋もれさせる退化になる。
   *   tanuPolicy の存在理由(非匿名が匿名の群れに埋もれないため)を検査で固定する。
   */
  it('★匿名が大量でも link/konta の顔ぶれは変わらない(埋もれない)', () => {
    const many = Array.from({ length: 50 }, (_, i) => seat(i + 2, `a:anon-${i}`, '', ''));
    const b = bucketVenueLaneSeats([
      seat(0, '11111', '太郎', 'https://cdn.example/11111.jpg'),
      seat(1, '22222', '', ''),
      ...many
    ]);
    expect(b.link.map((x) => x.entry.userId)).toEqual(['11111']);
    expect(b.konta.map((x) => x.entry.userId)).toEqual(['22222']);
    expect(b.tanu.length).toBe(50);
  });

  // ★v0.1.1375: 旧題は「匿名は元々段に出ないので影響しない」だったが、
  //   匿名も段に出るようになったので【maxTotal は匿名込みの合計に効く】が正しい説明。
  it('maxTotal は5段合計の上限として効く(匿名も合計に含まれる)', () => {
    const b = bucketVenueLaneSeats(
      [
        seat(0, '11111', 'A', 'https://cdn.example/1.jpg'),
        seat(1, '22222', 'B', 'https://cdn.example/2.jpg'),
        seat(2, 'a:1', '', ''),
        seat(3, 'a:2', '', ''),
        seat(4, 'a:3', '', '')
      ],
      { maxTotal: 1 }
    );
    expect(flattenVenueLaneBuckets(b).length).toBe(1);
  });

  it('flatten は画面表示順を返す', () => {
    const buckets = {
      link: [{ id: 'link' }],
      gift: [{ id: 'gift' }],
      ad: [{ id: 'ad' }],
      konta: [{ id: 'konta' }],
      tanu: [{ id: 'tanu' }]
    };

    expect(flattenVenueLaneBuckets(buckets).map((x) => x.id)).toEqual([
      'link',
      'gift',
      'ad',
      'konta',
      'tanu'
    ]);
  });

  /*
   * ★2026-08-14(ユーザー実機「自分でギフト投げてPOPには出るが会場に出ない」)
   *
   *   この test ファイルは長らく **flatten(並べる側)に gift を手渡しして**検査するだけで、
   *   `bucketVenueLaneSeats`(作る側)が gift を**空で返すこと自体**は誰も断言していなかった
   *   → [[wiring-test-must-assert-counts-2026-08-04]] と同型の穴。
   *
   *   ★事実の記録: フォールバック経路には**ギフト段を作る能力が無い**。
   *     供給元 `bucketStoryUserLanePicks` の返り値は {link, konta, tanu} だけで
   *     `gift`/`ad` は存在しない(= 値を落としているのではなく、経路が無い)。
   *     ギフト段は主経路である **鏡(laneMirror)** から供給される。
   *
   *   ここでは「いまそうなっている」を固定して、将来この前提が変わったら気づけるようにする。
   *   ★会場にギフトを出す実装をするときは、この test が赤くなるのが正しい(仕様変更の合図)。
   */
  it('★フォールバック経路は gift/ad 段を作らない(鏡が主経路・仕様の固定)', () => {
    const seats = [
      { seatIndex: 0, participant: { userId: '12345678', nickname: 'ギフト投げた人' } },
      { seatIndex: 1, participant: { userId: 'a:anon1', nickname: '匿名' } }
    ];
    const b = bucketVenueLaneSeats(seats, { maxTotal: 10 });
    // 作る側は gift/ad を常に空で返す(=会場のギフト段はフォールバックでは出ない)。
    expect(b.gift).toEqual([]);
    expect(b.ad).toEqual([]);
    // 一方で uid のある人は link/konta/tanu のどこかには載る(段ごと消えてはいない)。
    expect(b.link.length + b.konta.length + b.tanu.length).toBeGreaterThan(0);
  });
});
