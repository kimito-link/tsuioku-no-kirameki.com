import { describe, it, expect } from 'vitest';
import { Window } from 'happy-dom';
import {
  probeCommentRowDataAttributes,
  analyzeNdgrChatRejection,
  aggregateSavedCommentsUidStats,
  accumulateSavedCommentsUidStats,
  parseInterceptFetchLog,
  snapshotCommentIngestCounters,
  createDedupeSeedDiagState,
  noteDedupeSeedOutcome,
  noteAddedCommentNoLess,
  noteIncrementalAddedCount,
  snapshotDedupeSeedDiag
} from './commentObservabilityDiag.js';
// 計器の判定が本番の dedup キー生成とズレていないことを突き合わせるため実 import する。
import { buildDedupeKey } from './commentRecord.js';

function makeRow(window, attrs) {
  const el = window.document.createElement('div');
  for (const [k, v] of Object.entries(attrs || {})) {
    el.setAttribute(k, String(v));
  }
  return el;
}

describe('probeCommentRowDataAttributes', () => {
  it('uid 系属性が無い row は rowsWithoutUserIdLikeAttr に計上', () => {
    const w = new Window();
    const rows = [
      makeRow(w, { class: '___table-row___xxx', 'data-comment-no': '1' }),
      makeRow(w, { class: '___table-row___xxx', 'data-comment-no': '2' })
    ];
    const r = probeCommentRowDataAttributes(rows);
    expect(r.sampledRows).toBe(2);
    expect(r.rowsWithUserIdLikeAttr).toBe(0);
    expect(r.rowsWithoutUserIdLikeAttr).toBe(2);
    expect(r.userIdLikeAttributesFound).toEqual([]);
  });

  it('data-user-id がある row は計上され、attribute key に記録', () => {
    const w = new Window();
    const rows = [
      makeRow(w, { class: 'r', 'data-user-id': '12345' }),
      makeRow(w, { class: 'r', 'data-comment-no': '2' })
    ];
    const r = probeCommentRowDataAttributes(rows);
    expect(r.rowsWithUserIdLikeAttr).toBe(1);
    expect(r.rowsWithoutUserIdLikeAttr).toBe(1);
    expect(r.userIdLikeAttributesFound).toContain('data-user-id');
  });

  it('複数の uid 系属性候補（data-userid / data-owner-id 等）も検出', () => {
    const w = new Window();
    const rows = [makeRow(w, { 'data-owner-id': 'X' })];
    const r = probeCommentRowDataAttributes(rows);
    expect(r.rowsWithUserIdLikeAttr).toBe(1);
    expect(r.userIdLikeAttributesFound).toContain('data-owner-id');
  });

  it('limit option で sampling 件数を制限', () => {
    const w = new Window();
    const rows = Array.from({ length: 20 }, () => makeRow(w, {}));
    const r = probeCommentRowDataAttributes(rows, { limit: 3 });
    expect(r.sampledRows).toBe(3);
  });

  it('null / 不正入力は安全に空集計を返す', () => {
    expect(probeCommentRowDataAttributes(null).sampledRows).toBe(0);
    expect(probeCommentRowDataAttributes(undefined).sampledRows).toBe(0);
    expect(probeCommentRowDataAttributes([]).sampledRows).toBe(0);
  });

  it('attributeKeysSample に各 row の attribute name 配列を含む', () => {
    const w = new Window();
    const rows = [makeRow(w, { class: 'r', 'data-comment-no': '1' })];
    const r = probeCommentRowDataAttributes(rows);
    expect(r.attributeKeysSample).toHaveLength(1);
    expect(r.attributeKeysSample[0]).toContain('class');
    expect(r.attributeKeysSample[0]).toContain('data-comment-no');
  });
});

describe('analyzeNdgrChatRejection', () => {
  // v0.1.803(星野ロミ式最大化): no が無くても「content 非空 + userId 有り」なら採用
  //   (匿名コメントをレーンへ活かす本体 ndgrChatsToMergeRows と一致)。
  it('chat.no が null/undefined でも content+userId があれば accepted', () => {
    const r = analyzeNdgrChatRejection([
      { no: null, content: 'a', rawUserId: 111 },
      { no: undefined, content: 'b', hashedUserId: 'h8charsXX' },
      { content: 'c', rawUserId: 222 }
    ]);
    expect(r.accepted).toBe(3);
    expect(r.noNumberSkip).toBe(0);
    expect(r.totalInput).toBe(3);
  });

  it('no 無し+userId 無し(content 有り)は noNumberSkip(gift payload 誤読の払い分け)', () => {
    const r = analyzeNdgrChatRejection([
      { no: null, content: 'stamp_basketball' },
      { no: null, content: 'あ', rawUserId: 0 }
    ]);
    expect(r.noNumberSkip).toBe(2);
    expect(r.accepted).toBe(0);
  });

  it('content も無い空 chat は emptyTextSkip(偽陽性抑止)', () => {
    const r = analyzeNdgrChatRejection([
      { no: null, content: '' },
      { content: '   ' },
      {}
    ]);
    expect(r.emptyTextSkip).toBe(3);
    expect(r.accepted).toBe(0);
  });

  it('content が空は emptyTextSkip', () => {
    const r = analyzeNdgrChatRejection([
      { no: 1, content: '' },
      { no: 2, content: '   ' }
    ]);
    expect(r.emptyTextSkip).toBe(2);
    expect(r.accepted).toBe(0);
  });

  it('parseGiftCommentText に該当する行は giftSystemMsgSkip', () => {
    const r = analyzeNdgrChatRejection([
      { no: 1, content: 'シンラツさんがギフト「応援メガホン 黄（10pt）」を贈りました' }
    ]);
    expect(r.giftSystemMsgSkip).toBe(1);
    expect(r.accepted).toBe(0);
  });

  it('通常コメは accepted', () => {
    const r = analyzeNdgrChatRejection([
      { no: 1, content: 'こんにちは' },
      { no: 2, content: '888' }
    ]);
    expect(r.accepted).toBe(2);
  });

  // v0.1.803: no 無しでも「content+userId」なら accepted、userId 無しは noNumberSkip。
  it('複合: reason を同時集計(no無し+userId有りは accepted、userId無しは noNumberSkip)', () => {
    const r = analyzeNdgrChatRejection([
      { no: null, content: 'a', rawUserId: 111 }, // 匿名コメント → accepted
      { no: null, content: 'stamp_basketball' }, // userId 無し → noNumberSkip
      { no: 1, content: '' }, // 本文空 → emptyTextSkip
      { no: 2, content: 'シンラツさんがギフト「メガホン（10pt）」を贈りました' }, // gift
      { no: 3, content: '通常コメ' } // accepted
    ]);
    expect(r).toEqual({
      totalInput: 5,
      noNumberSkip: 1,
      emptyTextSkip: 1,
      giftSystemMsgSkip: 1,
      accepted: 2
    });
  });

  it('null / 不正入力は空集計', () => {
    expect(analyzeNdgrChatRejection(null).totalInput).toBe(0);
    expect(analyzeNdgrChatRejection(undefined).totalInput).toBe(0);
  });
});

describe('aggregateSavedCommentsUidStats', () => {
  it('userId が空の entry は withoutUid に計上', () => {
    const r = aggregateSavedCommentsUidStats([
      { userId: '12345' },
      { userId: '' },
      { userId: null },
      {}
    ]);
    expect(r.totalSaved).toBe(4);
    expect(r.withUid).toBe(1);
    expect(r.withoutUid).toBe(3);
    expect(r.withUidPercent).toBe(25);
  });

  it('全件 uid あり → 100%', () => {
    const r = aggregateSavedCommentsUidStats([{ userId: '1' }, { userId: '2' }]);
    expect(r.withUidPercent).toBe(100);
  });

  it('空配列 → 0%', () => {
    const r = aggregateSavedCommentsUidStats([]);
    expect(r.totalSaved).toBe(0);
    expect(r.withUidPercent).toBe(0);
  });

  it('小数第 1 位まで丸め', () => {
    const r = aggregateSavedCommentsUidStats([
      { userId: '1' },
      { userId: '' },
      { userId: '' }
    ]);
    expect(r.withUidPercent).toBe(33.3);
  });

  // v0.1.1001: commentNo 欠落割合の計器(記録>本家104%の内訳切り分け用)。
  it('commentNo 欠落行を数えて割合を出す', () => {
    const r = aggregateSavedCommentsUidStats([
      { userId: 'a', commentNo: '101' }, // no あり
      { userId: 'b', commentNo: '' }, // no 無し
      { userId: 'c' }, // no 無し(欠落)
      { userId: 'd', commentNo: null } // no 無し
    ]);
    expect(r.commentNoLess).toBe(3);
    expect(r.commentNoLessPercent).toBe(75);
  });

  it('匿名主体(全件 no 無し) → 100%（二重計上の温床が大きいサイン）', () => {
    const r = aggregateSavedCommentsUidStats([
      { userId: 'a:xxx' },
      { userId: 'a:yyy', commentNo: '' }
    ]);
    expect(r.commentNoLess).toBe(2);
    expect(r.commentNoLessPercent).toBe(100);
  });

  it('全件 no あり → 0%（欠落由来の二重計上は起きにくい）', () => {
    const r = aggregateSavedCommentsUidStats([
      { userId: 'a', commentNo: '1' },
      { userId: 'b', commentNo: '2' }
    ]);
    expect(r.commentNoLess).toBe(0);
    expect(r.commentNoLessPercent).toBe(0);
  });

  it('空配列 → commentNoLess も 0', () => {
    const r = aggregateSavedCommentsUidStats([]);
    expect(r.commentNoLess).toBe(0);
    expect(r.commentNoLessPercent).toBe(0);
  });
});

describe('accumulateSavedCommentsUidStats（v0.1.1011: チャンクモードの totalSaved:0 根治）', () => {
  it('seed(全件)で running を作り、added を加算しても母数は記録全件のまま', () => {
    // seed: 既存3223件相当(ここでは縮小: uid有2/欠落1)
    const seed = aggregateSavedCommentsUidStats([
      { userId: 'a', commentNo: '1' },
      { userId: 'b', commentNo: '2' },
      { userId: '', commentNo: '' } // uid無・no無
    ]);
    expect(seed.totalSaved).toBe(3);
    // フラッシュ1: 新規2件(uid有1/uid無1・どちらも no有)
    const r1 = accumulateSavedCommentsUidStats(seed, [
      { userId: 'c', commentNo: '4' },
      { userId: '', commentNo: '5' }
    ]);
    expect(r1.totalSaved).toBe(5); // 3 + 2 = 母数は全件
    expect(r1.withUid).toBe(3);
    expect(r1.commentNoLess).toBe(1);
    // フラッシュ2: 新規0件 → 母数は5のまま(totalSaved:0 にならない=根治の核心)
    const r2 = accumulateSavedCommentsUidStats(r1, []);
    expect(r2.totalSaved).toBe(5);
    expect(r2.withUidPercent).toBe(60); // 3/5
  });

  it('running が null でも空 seed として動く(added だけ積む)', () => {
    const r = accumulateSavedCommentsUidStats(null, [
      { userId: 'a', commentNo: '1' },
      { userId: '', commentNo: '' }
    ]);
    expect(r.totalSaved).toBe(2);
    expect(r.withUid).toBe(1);
    expect(r.commentNoLess).toBe(1);
  });

  it('added が空/非配列なら running をそのまま返す(% 再計算込み)', () => {
    const seed = aggregateSavedCommentsUidStats([{ userId: 'a', commentNo: '1' }]);
    expect(accumulateSavedCommentsUidStats(seed, []).totalSaved).toBe(1);
    expect(accumulateSavedCommentsUidStats(seed, null).totalSaved).toBe(1);
  });
});

describe('parseInterceptFetchLog', () => {
  it('" | " 区切りで分割', () => {
    const r = parseInterceptFetchLog('/api/a [json] | /api/b [octet]');
    expect(r).toEqual(['/api/a [json]', '/api/b [octet]']);
  });

  it('空文字 / null は空配列', () => {
    expect(parseInterceptFetchLog('')).toEqual([]);
    expect(parseInterceptFetchLog(null)).toEqual([]);
    expect(parseInterceptFetchLog(undefined)).toEqual([]);
  });

  it('空セグメントは除外', () => {
    expect(parseInterceptFetchLog('/a |  | /b')).toEqual(['/a', '/b']);
  });
});

describe('snapshotCommentIngestCounters', () => {
  it('数値 counter のみ抽出', () => {
    const r = snapshotCommentIngestCounters({
      NDGR: 3,
      MUTATION: 150,
      DEEP: 0,
      VISIBLE: 0
    });
    expect(r).toEqual({ NDGR: 3, MUTATION: 150, DEEP: 0, VISIBLE: 0 });
  });

  it('負数や NaN は 0 に', () => {
    const r = snapshotCommentIngestCounters({ a: -1, b: NaN, c: Infinity, d: 5 });
    expect(r).toEqual({ a: 0, b: 0, c: 0, d: 5 });
  });

  it('null / 不正入力は空オブジェクト', () => {
    expect(snapshotCommentIngestCounters(null)).toEqual({});
    expect(snapshotCommentIngestCounters(undefined)).toEqual({});
  });
});

describe('createDedupeSeedDiagState / noteDedupeSeedOutcome / noteIncrementalAddedCount / snapshotDedupeSeedDiag', () => {
  it('初期値は全部ゼロ', () => {
    const s = createDedupeSeedDiagState();
    expect(s.seedSkipCount).toBe(0);
    expect(s.seedRebuildCount).toBe(0);
    expect(s.seedRequeueCount).toBe(0);
    expect(s.lastIncrementalAddedCount).toBe(0);
    expect(s.maxIncrementalAddedCount).toBe(0);
    expect(s.suspiciousAddedCount).toBe(0);
  });

  it('skip/rebuild/requeue それぞれ独立してカウントされる', () => {
    const s = createDedupeSeedDiagState();
    noteDedupeSeedOutcome(s, 'skip');
    noteDedupeSeedOutcome(s, 'skip');
    noteDedupeSeedOutcome(s, 'rebuild');
    noteDedupeSeedOutcome(s, 'requeue');
    expect(s.seedSkipCount).toBe(2);
    expect(s.seedRebuildCount).toBe(1);
    expect(s.seedRequeueCount).toBe(1);
  });

  it('壊れたstateでも例外を投げない', () => {
    expect(() => noteDedupeSeedOutcome(null, 'skip')).not.toThrow();
    expect(() => noteDedupeSeedOutcome(undefined, 'rebuild')).not.toThrow();
  });

  it('noteIncrementalAddedCountは最大値を保持し、閾値超で疑わしいカウントが増える', () => {
    const s = createDedupeSeedDiagState();
    noteIncrementalAddedCount(s, 3);
    noteIncrementalAddedCount(s, 150, { suspiciousThreshold: 100 });
    noteIncrementalAddedCount(s, 5);
    expect(s.lastIncrementalAddedCount).toBe(5); // 最後の呼び出し値
    expect(s.maxIncrementalAddedCount).toBe(150); // 最大値は下がらない
    expect(s.suspiciousAddedCount).toBe(1); // 閾値(100)超は1回だけ
  });

  it('閾値未指定時は既定100で判定される', () => {
    const s = createDedupeSeedDiagState();
    noteIncrementalAddedCount(s, 50);
    noteIncrementalAddedCount(s, 101);
    expect(s.suspiciousAddedCount).toBe(1);
  });

  // v0.1.1196: added のうち commentNo 欠落行を数える計器。dedup キー(buildDedupeKey)は
  //   commentNo の有無で構造が変わり、欠落時だけ capturedAt の秒が混ざる。二重計上の有力仮説
  //   「ライブ経路と backfill 経路で capturedAt の導出が違うためキーが一致しない」は欠落行で
  //   しか成立しないため、この値が切り分けの決定打になる。
  describe('noteAddedCommentNoLess(番号欠落行の計数)', () => {
    it('commentNo の有無で分類し、累積する', () => {
      const s = createDedupeSeedDiagState();
      noteAddedCommentNoLess(s, [
        { commentNo: 101 },
        { commentNo: null },
        {},
        { commentNo: 102 }
      ]);
      expect(s.addedTotalCount).toBe(4);
      expect(s.addedNoLessCount).toBe(2);
      // 2回目の呼び出しでも積み上がる(放送を通した累積)
      noteAddedCommentNoLess(s, [{ commentNo: undefined }]);
      expect(s.addedTotalCount).toBe(5);
      expect(s.addedNoLessCount).toBe(3);
    });

    it('判定は buildDedupeKey と一致する(空文字/空白のみは「番号なし」側)', () => {
      const s = createDedupeSeedDiagState();
      // buildDedupeKey は String(rec.commentNo ?? '').trim() が非空かだけを見る。
      //   よって '0' や 0 は「番号あり」側(数値化して 0 を falsy 扱いしてはいけない)。
      noteAddedCommentNoLess(s, [
        { commentNo: '' }, // なし
        { commentNo: '   ' }, // なし(空白のみ)
        { commentNo: '0' }, // あり(文字列として非空)
        { commentNo: 0 } // あり(String(0)='0' で非空)
      ]);
      expect(s.addedTotalCount).toBe(4);
      expect(s.addedNoLessCount).toBe(2);
    });

    it('空配列/null は何も積まない(呼び出し側でガードしない前提)', () => {
      const s = createDedupeSeedDiagState();
      noteAddedCommentNoLess(s, []);
      noteAddedCommentNoLess(s, null);
      noteAddedCommentNoLess(s, undefined);
      expect(s.addedTotalCount).toBe(0);
      expect(s.addedNoLessCount).toBe(0);
      expect(() => noteAddedCommentNoLess(null, [{ commentNo: 1 }])).not.toThrow();
    });

    it('snapshot に新フィールドが載る(印字経路の入口)', () => {
      const s = createDedupeSeedDiagState();
      noteAddedCommentNoLess(s, [{ commentNo: 1 }, {}]);
      const snap = snapshotDedupeSeedDiag(s);
      expect(snap.addedTotalCount).toBe(2);
      expect(snap.addedNoLessCount).toBe(1);
    });

    // ★この計器の値は「dedup キーがどちらの構造で作られたか」を意味する。判定が本番の
    //   buildDedupeKey とズレた瞬間、計器は嘘をつき、切り分けを誤らせる。だから手書きの
    //   期待値ではなく、本番モジュールを実 import して「キーの実物」と突き合わせる
    //   ([[integration-test-must-import-real-code]])。
    it('本番の buildDedupeKey が capturedAt を混ぜる行と、この計器が数える行が一致する', () => {
      const cases = [
        { commentNo: 101, text: 'a', capturedAt: 1_700_000_000_000, userId: 'u1' },
        { commentNo: '', text: 'b', capturedAt: 1_700_000_000_000, userId: 'u2' },
        { commentNo: '   ', text: 'c', capturedAt: 1_700_000_000_000, userId: 'u3' },
        { commentNo: '0', text: 'd', capturedAt: 1_700_000_000_000, userId: 'u4' },
        { text: 'e', capturedAt: 1_700_000_000_000, userId: 'u5' }
      ];
      // 「capturedAt の秒がキーに混ざる」= 二重計上の仮説が成立しうる行を、実キーから判定する。
      const secToken = String(Math.floor(1_700_000_000_000 / 1000));
      const keyDependsOnCapturedAt = cases.map((rec) =>
        buildDedupeKey('lv1', /** @type {any} */ (rec)).includes(`|${secToken}|`)
      );
      const s = createDedupeSeedDiagState();
      noteAddedCommentNoLess(s, /** @type {any} */ (cases));
      expect(s.addedNoLessCount).toBe(keyDependsOnCapturedAt.filter(Boolean).length);
      expect(s.addedTotalCount).toBe(cases.length);
    });
  });

  it('snapshotDedupeSeedDiagは元stateのコピーを返す(副作用なし)', () => {
    const s = createDedupeSeedDiagState();
    noteDedupeSeedOutcome(s, 'skip');
    noteIncrementalAddedCount(s, 200, { suspiciousThreshold: 100 });
    const snap = snapshotDedupeSeedDiag(s);
    expect(snap).toEqual({
      seedSkipCount: 1,
      seedRebuildCount: 0,
      seedRequeueCount: 0,
      lastIncrementalAddedCount: 200,
      maxIncrementalAddedCount: 200,
      suspiciousAddedCount: 1,
      addedNoLessCount: 0,
      addedTotalCount: 0,
      seedUnseededRejectCount: 0
    });
    // コピーであり同一参照ではない
    snap.seedSkipCount = 999;
    expect(s.seedSkipCount).toBe(1);
  });

  it('壊れたstate/nullはsnapshotで初期値相当を返す', () => {
    expect(snapshotDedupeSeedDiag(null)).toEqual(createDedupeSeedDiagState());
    expect(snapshotDedupeSeedDiag(undefined)).toEqual(createDedupeSeedDiagState());
  });
});
