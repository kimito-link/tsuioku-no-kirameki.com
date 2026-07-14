import { describe, it, expect } from 'vitest';
import { buildLaneMirrorSnapshot, restoreLaneMirrorBuckets } from './laneMirror.js';
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
    expect(snap.link[0]).toEqual({
      displaySrc: 'https://cdn/123.jpg', title: 'ユーザー',
      idLine: 'ID 123', nameLine: '名前 123', userId: '123'
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
