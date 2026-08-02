import { describe, it, expect } from 'vitest';
import { buildLaneMirrorSnapshot, laneMirrorCapFromBuckets, restoreLaneMirrorBuckets } from './laneMirror.js';
import { anonymousIdenticonDataUrl } from './anonymousIdenticon.js';
import { laneSceneContentHash } from './laneSceneEnvelope.js';

/**
 * 鏡スナップショット: buckets を最小5フィールドに間引いて保存し、status が paint に渡せる buckets 形に
 * 復元できることを固定する(round-trip)。会場には無関係・popup/status の鏡の正本。
 */

const cell = (uid, src) => ({
  displaySrc: src,
  title: 'ユーザー',
  meta: { idLine: `ID ${uid}`, nameLine: `名前 ${uid}` },
  entry: { userId: uid }
});

describe('buildLaneMirrorSnapshot', () => {
  it('各段を最小フィールドに間引いて保存する(displaySrc/title/idLine/nameLine/userId)', () => {
    const snap = buildLaneMirrorSnapshot({
      liveId: 'lv1',
      buckets: {
        link: [cell('123', 'https://cdn/123.jpg')],
        konta: [cell('a:X', 'data:image/svg+xml;i')],
        tanu: [],
        gift: [],
        ad: []
      },
      pickedLength: 2,
      totalCandidates: 5
    }, { nowMs: 1000 });
    expect(snap.liveId).toBe('lv1');
    expect(snap.capturedAt).toBe(1000);
    expect(snap.pickedLength).toBe(2);
    expect(snap.totalCandidates).toBe(5);
    expect(snap.link).toHaveLength(1);
    // v0.1.1220: recentTexts(会場ホバーカードの直近発言)を追加。
    //   会場は鏡が使えるとき鏡を優先するので、ここに載せないとカードへ届かない。
    //   ★「最小フィールド」の契約は維持する意図: 上限3件・空なら空配列で、
    //     1人あたり数十バイトに収まる範囲に留める(純Web公開のサイズを守る)。
    expect(snap.link[0]).toEqual({
      displaySrc: 'https://cdn/123.jpg', title: 'ユーザー',
      idLine: 'ID 123', nameLine: '名前 123', userId: '123',
      recentTexts: []
    });
    expect(snap.konta[0].userId).toBe('a:X');
  });

  it('①実DOM指紋を固定5段の数値だけに正規化して同梱する', () => {
    const snap = buildLaneMirrorSnapshot({
      liveId: 'lv1',
      buckets: { link: [], gift: [], ad: [], konta: [], tanu: [] },
      domSelf: {
        measured: true,
        perTier: {
          link: { visible: 2.9, tileW: 64.125, tileH: 84.5, ignored: 'drop' },
          tanu: { visible: -1, tileW: '72', tileH: null }
        },
        dpr: 1.25,
        ignored: { large: true }
      }
    }, { nowMs: 1 });
    expect(snap.domSelf).toEqual({
      measured: true,
      perTier: {
        link: { visible: 2, tileW: 64.13, tileH: 84.5 },
        gift: { visible: 0, tileW: 0, tileH: 0 },
        ad: { visible: 0, tileW: 0, tileH: 0 },
        konta: { visible: 0, tileW: 0, tileH: 0 },
        tanu: { visible: 0, tileW: 72, tileH: 0 }
      },
      dpr: 1.25
    });
    expect(snap.domSelf).not.toHaveProperty('ignored');
  });

  it('displaySrc 空+uid 有りは落とさない(スリムセル=読み手B-1識のidentity復元の入口)', () => {
    // 会場一致gift/ad根治(2026-07-14): toMirrorCell がuserIdを見ずにdisplaySrc空だけで
    //   即捨てていたバグの回帰防止。displaySrc空+uid有りは restoreLaneMirrorBuckets(B-1)が
    //   identiconで復元する正常なケースなので、鏡の時点で落としてはいけない。
    const snap = buildLaneMirrorSnapshot({
      liveId: 'lv1',
      buckets: { link: [cell('1', ''), cell('2', 'https://cdn/2.jpg')], konta: [], tanu: [], gift: [], ad: [] }
    }, { nowMs: 1 });
    expect(snap.link).toHaveLength(2);
    expect(snap.link.map((c) => c.userId)).toEqual(['1', '2']);
    expect(snap.link[0].displaySrc).toBe('');
  });

  it('displaySrc 空+uid 無しでも idLine|title の複合キーがあれば落とさない(広告主セル等)', () => {
    const adCell = {
      displaySrc: '',
      title: '広告主X',
      meta: { idLine: 'AD-1', nameLine: '広告主X' },
      entry: { userId: '' }
    };
    const snap = buildLaneMirrorSnapshot({
      liveId: 'lv1',
      buckets: { link: [], konta: [], tanu: [], gift: [], ad: [adCell] }
    }, { nowMs: 1 });
    expect(snap.ad).toHaveLength(1);
    expect(snap.ad[0].idLine).toBe('AD-1');
    expect(snap.ad[0].displaySrc).toBe('');
  });

  it('displaySrc も素性(uid/idLine/title)も無いセルだけ落とす(鏡に出せない)', () => {
    const emptyCell = { displaySrc: '', title: '', meta: { idLine: '', nameLine: '' }, entry: { userId: '' } };
    const snap = buildLaneMirrorSnapshot({
      liveId: 'lv1',
      buckets: { link: [emptyCell, cell('2', 'https://cdn/2.jpg')], konta: [], tanu: [], gift: [], ad: [] }
    }, { nowMs: 1 });
    expect(snap.link).toHaveLength(1);
    expect(snap.link[0].userId).toBe('2');
  });

  it('各段 cap で件数を抑える', () => {
    const many = Array.from({ length: 100 }, (_, i) => cell(String(i), `https://cdn/${i}.jpg`));
    const snap = buildLaneMirrorSnapshot({
      liveId: 'lv1', buckets: { link: many, konta: [], tanu: [], gift: [], ad: [] }
    }, { cap: 48, nowMs: 1 });
    expect(snap.link).toHaveLength(48);
  });

  it('pickedLength は渡した値(=全5段合計 laneDisplayedTotal)をそのまま格納する(取り違え再発防止)', () => {
    // popup は paint と publish に同じ laneDisplayedTotal(りんく+ギフト+広告+こん太+たぬ姉の合計枠)を
    //   渡す。りんく段だけの picked.length を渡すとフッター「いま N 件を表示中」が popup より小さくなり
    //   「ほか M人」が過大になる(数字の抜け漏れ)。鏡はこの値を加工せず格納することを固定する。
    const laneDisplayedTotal = 3 /* link */ + 2 /* gift */ + 1 /* ad */; // = 6(=全5段の合計枠)
    const snap = buildLaneMirrorSnapshot({
      liveId: 'lv1',
      buckets: {
        link: [cell('1', 'https://cdn/1.jpg'), cell('2', 'https://cdn/2.jpg'), cell('3', 'https://cdn/3.jpg')],
        gift: [cell('4', 'https://cdn/4.jpg'), cell('5', 'https://cdn/5.jpg')],
        ad: [cell('6', 'https://cdn/6.jpg')],
        konta: [],
        tanu: []
      },
      pickedLength: laneDisplayedTotal,
      totalCandidates: 9
    }, { nowMs: 1 });
    expect(snap.pickedLength).toBe(6);
    // 「ほか M人」= totalCandidates - pickedLength は popup と同じ式(9 - 6 = 3)になる。
    expect(snap.totalCandidates - snap.pickedLength).toBe(3);
  });
});

describe('restoreLaneMirrorBuckets(round-trip)', () => {
  it('保存→復元で paint が受ける buckets 形({displaySrc,title,meta,entry})に戻る', () => {
    const snap = buildLaneMirrorSnapshot({
      liveId: 'lv1',
      buckets: { link: [cell('123', 'https://cdn/123.jpg')], konta: [], tanu: [], gift: [], ad: [] }
    }, { nowMs: 1 });
    const restored = restoreLaneMirrorBuckets(snap);
    expect(restored.link[0]).toEqual({
      displaySrc: 'https://cdn/123.jpg',
      title: 'ユーザー',
      meta: { idLine: 'ID 123', nameLine: '名前 123' },
      entry: { userId: '123' }
    });
    expect(restored.gift).toEqual([]);
  });

  it('null/壊れ入力でも例外を投げず空 buckets を返す', () => {
    const r = restoreLaneMirrorBuckets(null);
    expect(r.link).toEqual([]);
    expect(r.tanu).toEqual([]);
  });
});

describe('鏡スリム化 B-1(読み手フォールバック・v0.1.1112)', () => {
  it('旧鏡(data URL入り)は再生成パス不発=byte同一出力(退行ゼロ)', () => {
    const dataUrl = anonymousIdenticonDataUrl('a:abc', 64);
    const snap = {
      liveId: 'lv1',
      capturedAt: 1,
      link: [],
      gift: [],
      ad: [],
      konta: [],
      tanu: [{ displaySrc: dataUrl, title: '匿名', idLine: 'a:abc', nameLine: '匿名', userId: 'a:abc' }],
      pickedLength: 1,
      totalCandidates: 1
    };
    const restored = restoreLaneMirrorBuckets(snap);
    expect(restored.tanu[0].displaySrc).toBe(dataUrl);
  });

  it('スリム化セル(displaySrc空+uid有り)は ①と同じ顔(anonymousIdenticonDataUrl(uid,64))を再生成', () => {
    const snap = {
      liveId: 'lv1',
      capturedAt: 1,
      link: [],
      gift: [],
      ad: [],
      konta: [],
      tanu: [{ displaySrc: '', title: '匿名', idLine: 'a:xyz', nameLine: '匿名', userId: 'a:xyz' }],
      pickedLength: 1,
      totalCandidates: 1
    };
    const restored = restoreLaneMirrorBuckets(snap);
    expect(restored.tanu[0].displaySrc).toBe(anonymousIdenticonDataUrl('a:xyz', 64));
    expect(restored.tanu[0].displaySrc.startsWith('data:')).toBe(true);
  });

  it('displaySrc空+uid無し(壊れセル)は空のまま(勝手に顔を作らない)', () => {
    const snap = {
      liveId: 'lv1', capturedAt: 1, link: [], gift: [], ad: [], konta: [],
      tanu: [{ displaySrc: '', title: 'x', idLine: '', nameLine: '', userId: '' }],
      pickedLength: 1, totalCandidates: 1
    };
    expect(restoreLaneMirrorBuckets(snap).tanu[0].displaySrc).toBe('');
  });

  it('B-2の前提: ①の既定生成(引数なし)は size=64 とbyte一致(strip比較の成立条件)', () => {
    expect(anonymousIdenticonDataUrl('a:same')).toBe(anonymousIdenticonDataUrl('a:same', 64));
  });

  it('会場一致gift/ad根治: giftのスリムセルを含むsnapのcontentHashは復元後の正準形と一致する(Patch 2b契約)', () => {
    const snap = buildLaneMirrorSnapshot({
      liveId: 'lv1',
      buckets: {
        link: [], konta: [], tanu: [],
        gift: [cell('g1', ''), cell('g2', 'https://cdn/g2.jpg')],
        ad: []
      }
    }, { nowMs: 1 });
    const restored = restoreLaneMirrorBuckets(snap);
    expect(snap.contentHash).toBe(laneSceneContentHash(restored));
  });
});

/**
 * v0.1.1234: 鏡 cap の撤廃。
 *
 * 【なぜ必要だったか】
 * v0.1.1232 で①レーンの上限だけ撤廃し、鏡は cap 48 に据え置いた。その結果
 * 実配信 lv351091938 で「会場のたぬ姉段 可視286 / 鏡48」となり、238人が③に載らなかった
 * (状態速報: 会場一致 🔴 ①DOM≠鏡 / 未説明240)。
 * limit と鏡 cap の分離は v0.1.1052 の①211≠③99 と同じ地雷。
 *
 * ★Infinity を使わない理由: 512KB フェイルセーフ(cap半減)は有限値でしか働かない。
 */
describe('laneMirrorCapFromBuckets — 鏡 cap の撤廃(全段を切り捨てなく載せる有限値)', () => {
  it('最大段長を返す(その値なら slice が全段で無発動)', () => {
    const buckets = {
      link: new Array(31).fill(cell('u', '')),
      konta: [],
      tanu: new Array(286).fill(cell('u', '')),
      gift: [],
      ad: new Array(10).fill(cell('u', ''))
    };
    expect(laneMirrorCapFromBuckets(buckets)).toBe(286);
  });

  it('空/壊れた入力でも1以上の有限値を返す(0を返すと全件消える)', () => {
    expect(laneMirrorCapFromBuckets(null)).toBe(1);
    expect(laneMirrorCapFromBuckets({})).toBe(1);
    expect(laneMirrorCapFromBuckets({ link: [], konta: [], tanu: [], gift: [], ad: [] })).toBe(1);
  });

  it('必ず有限を返す(Infinityは512KBフェイルセーフを無力化する)', () => {
    const buckets = { link: new Array(5000).fill(cell('u', '')), konta: [], tanu: [], gift: [], ad: [] };
    const cap = laneMirrorCapFromBuckets(buckets);
    expect(Number.isFinite(cap)).toBe(true);
    expect(cap).toBe(5000);
  });

  it('★実配信の再現(たぬ姉286人): この cap なら鏡に全員載る=①DOM≠鏡が解消する', () => {
    const buckets = {
      link: Array.from({ length: 31 }, (_, i) => cell(`l${i}`, `https://cdn/l${i}.jpg`)),
      konta: [],
      tanu: Array.from({ length: 286 }, (_, i) => cell(`t${i}`, '')),
      gift: [],
      ad: Array.from({ length: 10 }, (_, i) => cell(`a${i}`, `https://cdn/a${i}.jpg`))
    };
    const snap = buildLaneMirrorSnapshot(
      { liveId: 'lv1', buckets, pickedLength: 327, totalCandidates: 327 },
      { cap: laneMirrorCapFromBuckets(buckets), nowMs: 1 }
    );
    // 旧(cap48)では tanu が48件に切られていた。
    expect(snap.tanu).toHaveLength(286);
    expect(snap.link).toHaveLength(31);
    expect(snap.ad).toHaveLength(10);
    // 512KB のフェイルセーフは発動していない(=切り捨てゼロ)。
    expect(JSON.stringify(snap).length).toBeLessThan(512 * 1024);
  });

  it('容量を本当に超えたら既存のフェイルセーフ(cap半減)が働く=最終防衛は生きている', () => {
    // 1セルを大きくして 512KB を超えさせる。
    const fat = (uid) => ({
      displaySrc: `https://cdn/${uid}/${'x'.repeat(2000)}.jpg`,
      title: 'y'.repeat(500),
      entry: { userId: uid },
      meta: { idLine: uid, nameLine: 'z'.repeat(500) },
      recentTexts: []
    });
    const buckets = {
      link: Array.from({ length: 400 }, (_, i) => fat(`u${i}`)),
      konta: [], tanu: [], gift: [], ad: []
    };
    const snap = buildLaneMirrorSnapshot(
      { liveId: 'lv1', buckets, pickedLength: 400, totalCandidates: 400 },
      { cap: laneMirrorCapFromBuckets(buckets), nowMs: 1 }
    );
    // 半減が働いて件数が減っている(=無制限に書き込まない)。
    expect(snap.link.length).toBeLessThan(400);
  });
});

/**
 * 鏡スリム化 B-2(書き手・v0.1.1235)。
 *
 * 【なぜ必要か】
 * ①が生成する匿名 identicon の data URL は 1件あたり約2.5KB。これを鏡へ丸ごと
 * 載せていたため、匿名258人で622KBとなり 512KB フェイルセーフ(cap半減)が発動し、
 * **鏡が129人に切られていた**(実配信 lv351092763: ①POP 266 / ③WEB鏡 137)。
 *
 * 読み手側の復元(B-1・v0.1.1112)は既に実装済みで、displaySrc 空 + uid 有りなら
 * anonymousIdenticonDataUrl(uid, 64) で同じ顔を再生成する。よって**書き手で落とすだけ**でよい。
 * 構想は laneMirror.js:34-37 に「B-2」として記録されていたが未実装のまま残っていた。
 *
 * ★バイト完全一致のときだけ落とす(可逆)。部分一致・data:接頭辞判定は禁止=実サムネの
 *   data URL まで消して別人化するため。
 */
describe('鏡スリム化 B-2(書き手が匿名 data URL を落とす・v0.1.1235)', () => {
  /** 匿名セル(①が identicon を注入した状態)。 */
  const anonCell = (uid) => ({
    displaySrc: anonymousIdenticonDataUrl(uid, 64),
    title: '',
    meta: { idLine: '', nameLine: '' },
    entry: { userId: uid }
  });

  it('①が生成した identicon(uid,64)とバイト一致する displaySrc だけ空に落とす', () => {
    const snap = buildLaneMirrorSnapshot({
      liveId: 'lv1',
      buckets: { link: [], konta: [], tanu: [anonCell('a:abc')], gift: [], ad: [] }
    }, { nowMs: 1 });
    expect(snap.tanu[0].displaySrc).toBe('');
    expect(snap.tanu[0].userId).toBe('a:abc');
  });

  it('落としたセルは鏡から消えない(uid が素性なので hasIdentity が真)', () => {
    // ★地雷: hasIdentity を slim 後の値で判定すると、落としたセルが丸ごと捨てられる
    //   (旧バグ=会場のgift/ad段DOM欠落の真因と同じ穴)。
    const snap = buildLaneMirrorSnapshot({
      liveId: 'lv1',
      buckets: { link: [], konta: [], tanu: [anonCell('a:x'), anonCell('a:y')], gift: [], ad: [] }
    }, { nowMs: 1 });
    expect(snap.tanu).toHaveLength(2);
  });

  it('★往復がバイト同一: strip → 復元で①と同じ顔に戻る(可逆)', () => {
    const uid = 'a:roundtrip';
    const original = anonymousIdenticonDataUrl(uid, 64);
    const snap = buildLaneMirrorSnapshot({
      liveId: 'lv1',
      buckets: { link: [], konta: [], tanu: [anonCell(uid)], gift: [], ad: [] }
    }, { nowMs: 1 });
    expect(snap.tanu[0].displaySrc).toBe(''); // 鏡には載っていない
    expect(restoreLaneMirrorBuckets(snap).tanu[0].displaySrc).toBe(original); // 復元でバイト同一
  });

  it('★contentHash は strip の有無で変わらない(会場の scene ①=会場 ✅ を守る)', () => {
    // hash は restoreLaneMirrorBuckets 適用後の復元正準形で署名しているため、
    // strip は hash に影響しない。ここが崩れると会場が恒常的に偽🔴になる。
    const uid = 'a:hash';
    const slim = buildLaneMirrorSnapshot({
      liveId: 'lv1', buckets: { link: [], konta: [], tanu: [anonCell(uid)], gift: [], ad: [] }
    }, { nowMs: 1 });
    // strip されない形(実サムネ)と比較するのではなく、復元正準形が一致することを見る。
    expect(slim.contentHash).toBe(laneSceneContentHash(restoreLaneMirrorBuckets(slim)));
  });

  it('実サムネ(https)は落とさない', () => {
    const snap = buildLaneMirrorSnapshot({
      liveId: 'lv1',
      buckets: { link: [cell('123', 'https://cdn/123.jpg')], konta: [], tanu: [], gift: [], ad: [] }
    }, { nowMs: 1 });
    expect(snap.link[0].displaySrc).toBe('https://cdn/123.jpg');
  });

  it('偽物の data URL(identicon と1バイトでも違う)は落とさない=別人化させない', () => {
    const fake = `${anonymousIdenticonDataUrl('a:fake', 64)}X`; // 末尾1バイト違い
    const snap = buildLaneMirrorSnapshot({
      liveId: 'lv1',
      buckets: {
        link: [], konta: [],
        tanu: [{ displaySrc: fake, title: '', meta: { idLine: '', nameLine: '' }, entry: { userId: 'a:fake' } }],
        gift: [], ad: []
      }
    }, { nowMs: 1 });
    expect(snap.tanu[0].displaySrc).toBe(fake);
  });

  it('別 uid の identicon は落とさない(uid が一致するものだけ再生成できる)', () => {
    const other = anonymousIdenticonDataUrl('a:other', 64);
    const snap = buildLaneMirrorSnapshot({
      liveId: 'lv1',
      buckets: {
        link: [], konta: [],
        tanu: [{ displaySrc: other, title: '', meta: { idLine: '', nameLine: '' }, entry: { userId: 'a:me' } }],
        gift: [], ad: []
      }
    }, { nowMs: 1 });
    expect(snap.tanu[0].displaySrc).toBe(other);
  });

  it('size≠64 の identicon は落とさない(既定値以外は復元できない)', () => {
    const big = anonymousIdenticonDataUrl('a:big', 128);
    const snap = buildLaneMirrorSnapshot({
      liveId: 'lv1',
      buckets: {
        link: [], konta: [],
        tanu: [{ displaySrc: big, title: '', meta: { idLine: '', nameLine: '' }, entry: { userId: 'a:big' } }],
        gift: [], ad: []
      }
    }, { nowMs: 1 });
    expect(snap.tanu[0].displaySrc).toBe(big);
  });

  it('uid が空のセル(広告主 yukkuriFaceFor 等)は data URL を保持する', () => {
    // 広告段は seed が roomKey(≠uid)なのでバイト不一致 + uid 空の二重で保護される。
    const adSrc = anonymousIdenticonDataUrl('room:ad-1', 64);
    const snap = buildLaneMirrorSnapshot({
      liveId: 'lv1',
      buckets: {
        link: [], konta: [], tanu: [], gift: [],
        ad: [{ displaySrc: adSrc, title: '広告主X', meta: { idLine: 'AD-1', nameLine: '広告主X' }, entry: { userId: '' } }]
      }
    }, { nowMs: 1 });
    expect(snap.ad).toHaveLength(1);
    expect(snap.ad[0].displaySrc).toBe(adSrc);
  });

  it('★実配信の再現(匿名258人): 半減が発動せず全員が鏡に載る', () => {
    // 旧: 622KB → 512KB超で cap 半減 → 129人(実配信で観測)。
    const tanu = Array.from({ length: 258 }, (_, i) => anonCell(`a:${'x'.repeat(20)}${i}`));
    const snap = buildLaneMirrorSnapshot({
      liveId: 'lv1', buckets: { link: [], konta: [], tanu, gift: [], ad: [] },
      pickedLength: 258, totalCandidates: 258
    }, { cap: 258, nowMs: 1 });
    expect(snap.tanu).toHaveLength(258);
    // 1/10 以下に縮む(identicon のバイト数は uid 依存で揺れるため範囲で見る)。
    expect(JSON.stringify(snap).length).toBeLessThan(64 * 1024);
  });
});
