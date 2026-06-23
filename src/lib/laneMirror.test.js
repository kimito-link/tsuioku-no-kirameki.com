import { describe, it, expect } from 'vitest';
import { buildLaneMirrorSnapshot, restoreLaneMirrorBuckets } from './laneMirror.js';

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

  it('displaySrc 空の要素は落とす(鏡に出せない)', () => {
    const snap = buildLaneMirrorSnapshot({
      liveId: 'lv1',
      buckets: { link: [cell('1', ''), cell('2', 'https://cdn/2.jpg')], konta: [], tanu: [], gift: [], ad: [] }
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
