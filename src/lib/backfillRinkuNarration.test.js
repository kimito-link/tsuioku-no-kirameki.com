import { describe, it, expect } from 'vitest';
import {
  backfillNarrationPhase,
  backfillRinkuNarration,
  backfillReachedStreamStart,
  backfillRecordCardHint,
  backfillRecordCardHintDomState,
  backfillStuckDiagnosticsSuffix,
  backfillThroughputLine,
  backfillLiveThroughputLine,
  resolveOfficialComparisonDisplay,
  BACKFILL_RECORD_HINT_NEAR_COMPLETE_TEXT
} from './backfillRinkuNarration.js';

describe('backfillReachedStreamStart', () => {
  it('reached_start のみ true', () => {
    expect(backfillReachedStreamStart('reached_start')).toBe(true);
    expect(backfillReachedStreamStart('backward_exhausted')).toBe(false);
    expect(backfillReachedStreamStart('cap_elapsed')).toBe(false);
    expect(backfillReachedStreamStart('')).toBe(false);
    expect(backfillReachedStreamStart(undefined)).toBe(false);
  });
});

describe('backfillNarrationPhase', () => {
  it('未開始は idle', () => {
    expect(backfillNarrationPhase({})).toBe('idle');
    expect(backfillNarrationPhase({ started: false, rows: 5 })).toBe('idle');
  });

  it('開始直後・件数0は fetching', () => {
    expect(backfillNarrationPhase({ started: true, rows: 0, done: 0 })).toBe('fetching');
  });

  it('取り込み中・件数ありは progress', () => {
    expect(backfillNarrationPhase({ started: true, rows: 12, done: 0 })).toBe('progress');
  });

  // v0.1.415: done=1 でも stopReason で「達成 / 途中 / 休み / 入口なし」を分ける。
  it('完了・reached_start・件数ありは done（本当に配信開始まで到達した時だけ）', () => {
    expect(
      backfillNarrationPhase({ started: true, rows: 300, done: 1, stopReason: 'reached_start' })
    ).toBe('done');
    expect(
      backfillNarrationPhase({ started: true, rows: 1, done: true, stopReason: 'reached_start' })
    ).toBe('done');
  });

  it('完了・reached_start・件数0は done_empty', () => {
    expect(
      backfillNarrationPhase({ started: true, rows: 0, done: 1, stopReason: 'reached_start' })
    ).toBe('done_empty');
  });

  it('cap_elapsed（時間切れ）で件数ありは partial（途中・嘘の達成を言わない）', () => {
    expect(
      backfillNarrationPhase({ started: true, rows: 238, done: 1, stopReason: 'cap_elapsed' })
    ).toBe('partial');
  });

  it('rate_limited は paused（混雑・また後で）', () => {
    expect(
      backfillNarrationPhase({ started: true, rows: 50, done: 1, stopReason: 'rate_limited' })
    ).toBe('paused');
  });

  it('backward_exhausted（入口なし）で件数0は no_entry（「無かった」と断定しない）', () => {
    expect(
      backfillNarrationPhase({ started: true, rows: 0, done: 1, stopReason: 'backward_exhausted' })
    ).toBe('no_entry');
  });

  it('cap_*・件数0は no_entry', () => {
    expect(
      backfillNarrationPhase({ started: true, rows: 0, done: 1, stopReason: 'cap_segments' })
    ).toBe('no_entry');
  });

  it('no_progress（v0.1.429・進めず途中終了）で件数ありは partial（reached_start でなく「もう一度」）', () => {
    // ⭐取れてないのに『ぜんぶ届いた』を出さないことの核心。no_progress は reached_start でない。
    expect(
      backfillNarrationPhase({ started: true, rows: 7408, done: 1, stopReason: 'no_progress' })
    ).toBe('partial');
  });

  it('no_progress・件数0は no_entry', () => {
    expect(
      backfillNarrationPhase({ started: true, rows: 0, done: 1, stopReason: 'no_progress' })
    ).toBe('no_entry');
  });

  it('stopReason 無し（旧経路）は安全側＝件数ありで partial / 件数0で no_entry（done と断定しない）', () => {
    expect(backfillNarrationPhase({ started: true, rows: 300, done: 1 })).toBe('partial');
    expect(backfillNarrationPhase({ started: true, rows: 0, done: 1 })).toBe('no_entry');
  });
});

describe('backfillRinkuNarration', () => {
  it('idle はお誘いのセリフ・animating=false', () => {
    const r = backfillRinkuNarration({});
    expect(r.phase).toBe('idle');
    expect(r.lead).toContain('ぜんぶ拾ってくるね');
    expect(r.animating).toBe(false);
  });

  it('fetching は「さかのぼってる」・animating=true', () => {
    const r = backfillRinkuNarration({ started: true, rows: 0, done: 0 });
    expect(r.phase).toBe('fetching');
    expect(r.lead).toContain('さかのぼ');
    expect(r.animating).toBe(true);
  });

  it('progress は件数を3桁区切りで含む・animating=true', () => {
    const r = backfillRinkuNarration({ started: true, rows: 1234, done: 0 });
    expect(r.phase).toBe('progress');
    expect(r.lead).toContain('1,234件');
    expect(r.animating).toBe(true);
    expect(r.count).toBe(1234);
  });

  it('done（reached_start）は「届いた」・正確な件数は出さない・animating=false', () => {
    const r = backfillRinkuNarration({ started: true, rows: 390, done: 1, stopReason: 'reached_start' });
    expect(r.phase).toBe('done');
    expect(r.lead).toContain('届いた');
    // 完了時は公式件数とのズレを気にさせないため、正確な件数を出さない。
    expect(r.lead).not.toContain('390');
    expect(r.animating).toBe(false);
  });

  it('partial（途中）は達成を言わず「もう一度押すと続き」を促す・件数を出さない', () => {
    const r = backfillRinkuNarration({ started: true, rows: 238, done: 1, stopReason: 'cap_elapsed' });
    expect(r.phase).toBe('partial');
    expect(r.lead).not.toContain('ぜんぶ届いた');
    expect(r.lead).toContain('もう一度');
    expect(r.lead).not.toContain('238');
    expect(r.animating).toBe(false);
  });

  it('paused（混雑）は「少し待って」案内', () => {
    const r = backfillRinkuNarration({ started: true, rows: 100, done: 1, stopReason: 'rate_limited' });
    expect(r.phase).toBe('paused');
    expect(r.lead).toContain('混んで');
    expect(r.lead).not.toContain('ぜんぶ届いた');
  });

  it('no_entry は「入口が見つからなかった・また後で」断定しない', () => {
    const r = backfillRinkuNarration({ started: true, rows: 0, done: 1, stopReason: 'backward_exhausted' });
    expect(r.phase).toBe('no_entry');
    expect(r.lead).toContain('もう一度');
    expect(r.lead).not.toContain('ぜんぶ届いた');
    expect(r.animating).toBe(false);
  });

  it('done_empty（reached_start かつ rows=0）は「過去は無かった」', () => {
    const r = backfillRinkuNarration({ started: true, rows: 0, done: 1, stopReason: 'reached_start' });
    expect(r.phase).toBe('done_empty');
    expect(r.lead).toContain('無かった');
    expect(r.animating).toBe(false);
  });

  it('旧経路（stopReason 無し・件数あり）は partial に倒れ「ぜんぶ届いた」と誤宣言しない', () => {
    const r = backfillRinkuNarration({ started: true, rows: 238, done: 1 });
    expect(r.phase).toBe('partial');
    expect(r.lead).not.toContain('ぜんぶ届いた');
  });
});

describe('backfillRecordCardHint（記録カードに出す短文・v0.1.432）', () => {
  it('no_entry（入口が見つからない）は記録カードにヒントを出す', () => {
    const h = backfillRecordCardHint({ started: true, rows: 0, done: 1, stopReason: 'backward_exhausted' });
    expect(h).not.toBe('');
    expect(h).toContain('過去ログ');
    // 断定しない（「無い」でなく「今は遡れない／また取り込める」トーン）。
    expect(h).toContain('少し経つと');
  });

  it('partial（途中まで）は「続きを取り込む」ヒント', () => {
    const h = backfillRecordCardHint({ started: true, rows: 238, done: 1, stopReason: 'cap_elapsed' });
    expect(h).toContain('途中まで');
    expect(h).toContain('もう一度');
  });

  it('partial でも記録が公式の95%以上なら「途中まで」とは言わない（v0.1.432）', () => {
    // 実機: 記録207/公式203 のように reached_start でなくても実質100%なら『途中まで』と言わない。
    const h = backfillRecordCardHint(
      { started: true, rows: 207, done: 1, stopReason: 'no_progress' },
      { officialCount: 203 }
    );
    expect(h).not.toContain('途中まで');
  });

  it('partial で記録が公式の95%以上なら肯定的な caught-up 文を出す（沈黙しない・v0.1.435）', () => {
    // ⛔ v0.1.432 で空文字にしていたが、実機でボタン下に「いまの分まで遡ったよ」が出る一方
    //   記録カード下が完全沈黙＝「片方しか反応しない＝対応されてない」と感じる UX 問題が再現。
    //   世界標準（Nielsen NN/g #1 Visibility / Material Design 3 / Instagram caught-up）に合わせ、
    //   「ほぼ完了」は沈黙でなく肯定的な状態の名前化で表現する。
    const h = backfillRecordCardHint(
      { started: true, rows: 1919, done: 1, stopReason: 'no_progress' },
      { officialCount: 1908 }
    );
    expect(h).not.toBe('');
    expect(h).toContain('いまの分まで届いてるよ');
  });

  it('partial で記録が公式の95%未満なら「途中まで」を出す', () => {
    const h = backfillRecordCardHint(
      { started: true, rows: 239, done: 1, stopReason: 'no_progress' },
      { officialCount: 2064 }
    );
    expect(h).toContain('途中まで');
  });

  it('partial で公式件数が無い（不明）なら従来通り「途中まで」を出す', () => {
    const h = backfillRecordCardHint({ started: true, rows: 238, done: 1, stopReason: 'cap_elapsed' }, {});
    expect(h).toContain('途中まで');
  });

  // v0.1.452: caught_up 誤判定の根治（ユーザー実機 2026-05-29 報告）
  describe('caught_up 誤判定の根治（v0.1.452・recordedCount で比較）', () => {
    it('progress.rows が公式以上でも、recordedCount が少なければ caught_up にならない（実機 4%）', () => {
      // 実機再現: 公式 343 件、記録 13 件（dedupe 後・4%）、progress.rows は dedupe 前で
      //   公式以上に膨らんでいるケース。recordedCount=13 で比較すれば「途中まで」になる。
      const h = backfillRecordCardHint(
        { started: true, rows: 1500, done: 1, stopReason: 'no_progress' },
        { officialCount: 343, recordedCount: 13 }
      );
      expect(h).not.toContain('いまの分まで届いてるよ');
      expect(h).toContain('途中まで');
    });

    it('progress.rows が公式以上でも、recordedCount が少なければ caught_up にならない（実機 7%）', () => {
      const h = backfillRecordCardHint(
        { started: true, rows: 2000, done: 1, stopReason: 'no_progress' },
        { officialCount: 1297, recordedCount: 93 }
      );
      expect(h).not.toContain('いまの分まで届いてるよ');
      expect(h).toContain('途中まで');
    });

    it('progress.rows が公式以上でも、recordedCount が少なければ caught_up にならない（実機 59%）', () => {
      const h = backfillRecordCardHint(
        { started: true, rows: 2500, done: 1, stopReason: 'no_progress' },
        { officialCount: 1465, recordedCount: 860 }
      );
      expect(h).not.toContain('いまの分まで届いてるよ');
      expect(h).toContain('途中まで');
    });

    it('recordedCount が公式の 95% 以上なら caught_up になる（v0.1.432 趣旨は維持）', () => {
      const h = backfillRecordCardHint(
        { started: true, rows: 1919, done: 1, stopReason: 'no_progress' },
        { officialCount: 1908, recordedCount: 1900 }
      );
      expect(h).toContain('いまの分まで届いてるよ');
    });

    it('recordedCount 未指定なら従来通り progress.rows で比較（後方互換）', () => {
      const h = backfillRecordCardHint(
        { started: true, rows: 1919, done: 1, stopReason: 'no_progress' },
        { officialCount: 1908 }
      );
      expect(h).toContain('いまの分まで届いてるよ');
    });

    it('recordedCount が 0 でも 0 として比較される（0=取れていない なら必ず partial 文言）', () => {
      const h = backfillRecordCardHint(
        { started: true, rows: 2000, done: 1, stopReason: 'no_progress' },
        { officialCount: 1000, recordedCount: 0 }
      );
      expect(h).not.toContain('いまの分まで届いてるよ');
      expect(h).toContain('途中まで');
    });

    it('recordedCount が NaN や負値なら従来通り progress.rows で比較（後方互換）', () => {
      const hNaN = backfillRecordCardHint(
        { started: true, rows: 1919, done: 1, stopReason: 'no_progress' },
        { officialCount: 1908, recordedCount: NaN }
      );
      expect(hNaN).toContain('いまの分まで届いてるよ');
      const hNeg = backfillRecordCardHint(
        { started: true, rows: 1919, done: 1, stopReason: 'no_progress' },
        { officialCount: 1908, recordedCount: -5 }
      );
      expect(hNeg).toContain('いまの分まで届いてるよ');
    });
  });

  // v0.1.453: 100% 警告ループの根治（ユーザー実機 2026-05-29 報告）
  //   公式 2,679・記録 2,679（100%）で最後のサイクルが no_entry/no_progress で終わると
  //   phase=no_entry になり「過去ログは今は遡れませんでした」が出続ける false negative を、
  //   phase に依らず recordedCount >= 公式 95% なら caught_up 文言に倒すことで解消する。
  describe('100% 警告ループの根治（v0.1.453・phase 非依存の 95% 対称化）', () => {
    it('no_entry でも記録が公式の 95% 以上なら caught_up 文言（警告ループ解消）', () => {
      // 実機: 公式 2,679・記録 2,679（100%）なのに backward_exhausted で終わったケース。
      const h = backfillRecordCardHint(
        { started: true, rows: 0, done: 1, stopReason: 'backward_exhausted' },
        { officialCount: 2679, recordedCount: 2679 }
      );
      expect(h).toBe(BACKFILL_RECORD_HINT_NEAR_COMPLETE_TEXT);
      expect(h).not.toContain('遡れませんでした');
    });

    it('no_entry で記録が公式の 95% 未満なら従来の no_entry 警告（回帰防止）', () => {
      const h = backfillRecordCardHint(
        { started: true, rows: 0, done: 1, stopReason: 'backward_exhausted' },
        { officialCount: 2679, recordedCount: 100 }
      );
      expect(h).toContain('遡れませんでした');
      expect(h).not.toBe(BACKFILL_RECORD_HINT_NEAR_COMPLETE_TEXT);
    });

    it('paused でも記録が公式の 95% 以上なら caught_up 文言（混雑中断でも達成扱い）', () => {
      const h = backfillRecordCardHint(
        { started: true, rows: 0, done: 1, stopReason: 'rate_limited' },
        { officialCount: 1000, recordedCount: 1000 }
      );
      expect(h).toBe(BACKFILL_RECORD_HINT_NEAR_COMPLETE_TEXT);
      expect(h).not.toContain('中断');
    });

    it('paused で記録が公式の 95% 未満なら従来の「一時中断」（回帰防止）', () => {
      const h = backfillRecordCardHint(
        { started: true, rows: 0, done: 1, stopReason: 'rate_limited' },
        { officialCount: 1000, recordedCount: 200 }
      );
      expect(h).toContain('中断');
      expect(h).not.toBe(BACKFILL_RECORD_HINT_NEAR_COMPLETE_TEXT);
    });

    it('no_entry で公式件数が無い（不明）なら従来通り no_entry 警告（比率判定しない）', () => {
      const h = backfillRecordCardHint(
        { started: true, rows: 0, done: 1, stopReason: 'backward_exhausted' },
        {}
      );
      expect(h).toContain('遡れませんでした');
    });
  });

  it('no_entry は公式に近くても（記録少なめ前提）出す＝officialCount に関わらず表示', () => {
    const h = backfillRecordCardHint(
      { started: true, rows: 0, done: 1, stopReason: 'backward_exhausted' },
      { officialCount: 0 }
    );
    expect(h).toContain('過去ログ');
  });

  it('paused（混雑）は「一時中断」ヒント', () => {
    const h = backfillRecordCardHint({ started: true, rows: 100, done: 1, stopReason: 'rate_limited' });
    expect(h).toContain('中断');
  });

  it('取り込み中（fetching / progress）は記録カードに出さない（演出はボタン下に任せる）', () => {
    expect(backfillRecordCardHint({ started: true, rows: 0, done: 0 })).toBe('');
    expect(backfillRecordCardHint({ started: true, rows: 50, done: 0 })).toBe('');
  });

  it('達成（done）・空（done_empty）・待機（idle）は記録カードに出さない', () => {
    expect(backfillRecordCardHint({ started: true, rows: 390, done: 1, stopReason: 'reached_start' })).toBe('');
    expect(backfillRecordCardHint({ started: true, rows: 0, done: 1, stopReason: 'reached_start' })).toBe('');
    expect(backfillRecordCardHint({})).toBe('');
  });
});

describe('backfillRecordCardHintDomState（記録カード下こん太吹き出しの DOM 状態・v0.1.438）', () => {
  it('no_entry: hidden=false / data-phase=no_entry / lead に文言', () => {
    const s = backfillRecordCardHintDomState({
      started: true,
      rows: 0,
      done: 1,
      stopReason: 'backward_exhausted'
    });
    expect(s.hidden).toBe(false);
    expect(s.dataPhase).toBe('no_entry');
    expect(s.lead).toContain('遡れませんでした');
  });

  it('partial(<95%): hidden=false / data-phase=partial / 「途中まで」文言', () => {
    const s = backfillRecordCardHintDomState(
      { started: true, rows: 239, done: 1, stopReason: 'no_progress' },
      { officialCount: 2064 }
    );
    expect(s.hidden).toBe(false);
    expect(s.dataPhase).toBe('partial');
    expect(s.lead).toContain('途中まで');
  });

  it('partial(>=95%): caught_up data-phase で「いまの分まで届いてるよ ✨」', () => {
    const s = backfillRecordCardHintDomState(
      { started: true, rows: 1919, done: 1, stopReason: 'no_progress' },
      { officialCount: 1908 }
    );
    expect(s.hidden).toBe(false);
    expect(s.dataPhase).toBe('caught_up');
    expect(s.lead).toContain('いまの分まで届いてるよ');
  });

  // v0.1.453: phase=no_entry/paused でも recordedCount >= 95% なら caught_up data-phase。
  //   実機 100% 警告ループ（公式 2,679・記録 2,679 なのに no_entry 警告）の DOM 側の根治。
  it('no_entry(>=95%): caught_up data-phase で「いまの分まで届いてるよ ✨」（警告ループ解消）', () => {
    const s = backfillRecordCardHintDomState(
      { started: true, rows: 0, done: 1, stopReason: 'backward_exhausted' },
      { officialCount: 2679, recordedCount: 2679 }
    );
    expect(s.hidden).toBe(false);
    expect(s.dataPhase).toBe('caught_up');
    expect(s.lead).toContain('いまの分まで届いてるよ');
  });

  it('paused(>=95%): caught_up data-phase で「いまの分まで届いてるよ ✨」', () => {
    const s = backfillRecordCardHintDomState(
      { started: true, rows: 0, done: 1, stopReason: 'rate_limited' },
      { officialCount: 1000, recordedCount: 1000 }
    );
    expect(s.hidden).toBe(false);
    expect(s.dataPhase).toBe('caught_up');
    expect(s.lead).toContain('いまの分まで届いてるよ');
  });

  it('paused: hidden=false / data-phase=paused / 「中断」文言', () => {
    const s = backfillRecordCardHintDomState({
      started: true,
      rows: 100,
      done: 1,
      stopReason: 'rate_limited'
    });
    expect(s.hidden).toBe(false);
    expect(s.dataPhase).toBe('paused');
    expect(s.lead).toContain('中断');
  });

  it('fetching/progress/done/done_empty/idle: hidden=true / data-phase=空 / lead=空', () => {
    const idle = backfillRecordCardHintDomState({});
    expect(idle).toEqual({ hidden: true, dataPhase: '', lead: '' });
    const fetching = backfillRecordCardHintDomState({ started: true, rows: 0, done: 0 });
    expect(fetching).toEqual({ hidden: true, dataPhase: '', lead: '' });
    const done = backfillRecordCardHintDomState({
      started: true,
      rows: 100,
      done: 1,
      stopReason: 'reached_start'
    });
    expect(done).toEqual({ hidden: true, dataPhase: '', lead: '' });
  });

  // v0.1.450: 押下直後トースト（B 廃止に伴う「押した感」のフォールバック）
  describe('retry_started トースト（v0.1.450・押下直後 1.8秒）', () => {
    it('押下直後（diff=0ms）は fetching でもトーストを優先して出す', () => {
      const s = backfillRecordCardHintDomState(
        { started: true, rows: 0, done: 0 },
        { retryStartedAtMs: 1_000_000, nowMs: 1_000_000 }
      );
      expect(s.hidden).toBe(false);
      expect(s.dataPhase).toBe('retry_started');
      expect(s.lead).toContain('ありがとう');
      expect(s.lead).toContain('もう一度');
    });

    it('押下から 1.8秒以内は出続ける（境界 1800ms 含む）', () => {
      const s = backfillRecordCardHintDomState(
        { started: true, rows: 50, done: 0 },
        { retryStartedAtMs: 1_000_000, nowMs: 1_001_800 }
      );
      expect(s.dataPhase).toBe('retry_started');
    });

    it('押下から 1.8秒を超えたら通常フェーズに戻る（progress なら沈黙）', () => {
      const s = backfillRecordCardHintDomState(
        { started: true, rows: 50, done: 0 },
        { retryStartedAtMs: 1_000_000, nowMs: 1_001_801 }
      );
      // 進行中（progress）は従来通り沈黙＝記録カードに出さない。
      expect(s).toEqual({ hidden: true, dataPhase: '', lead: '' });
    });

    it('押下から 1.8秒を超えたら no_entry なら通常 hint に切り替わる', () => {
      const s = backfillRecordCardHintDomState(
        {
          started: true,
          rows: 0,
          done: 1,
          stopReason: 'no_entry'
        },
        { retryStartedAtMs: 1_000_000, nowMs: 1_005_000 }
      );
      expect(s.hidden).toBe(false);
      expect(s.dataPhase).toBe('no_entry');
      expect(s.lead).toContain('遡れませんでした');
    });

    it('retryStartedAtMs が未指定なら従来挙動（後方互換）', () => {
      const s = backfillRecordCardHintDomState({
        started: true,
        rows: 0,
        done: 0
      });
      expect(s).toEqual({ hidden: true, dataPhase: '', lead: '' });
    });

    it('nowMs が未指定なら従来挙動（後方互換）', () => {
      const s = backfillRecordCardHintDomState(
        { started: true, rows: 0, done: 0 },
        { retryStartedAtMs: 1_000_000 }
      );
      expect(s).toEqual({ hidden: true, dataPhase: '', lead: '' });
    });

    it('retryStartedAtMs が 0 や負値・NaN なら従来挙動', () => {
      const zero = backfillRecordCardHintDomState(
        { started: true, rows: 0, done: 0 },
        { retryStartedAtMs: 0, nowMs: 1_000_000 }
      );
      expect(zero).toEqual({ hidden: true, dataPhase: '', lead: '' });
      const negative = backfillRecordCardHintDomState(
        { started: true, rows: 0, done: 0 },
        { retryStartedAtMs: -500, nowMs: 1_000_000 }
      );
      expect(negative).toEqual({ hidden: true, dataPhase: '', lead: '' });
      const nan = backfillRecordCardHintDomState(
        { started: true, rows: 0, done: 0 },
        { retryStartedAtMs: NaN, nowMs: 1_000_000 }
      );
      expect(nan).toEqual({ hidden: true, dataPhase: '', lead: '' });
    });

    it('nowMs が retryStartedAtMs より過去（時計戻り）なら従来挙動', () => {
      // 時計の戻りで now < retryStartedAtMs になった場合はトーストを出さない（誤検知防止）。
      const s = backfillRecordCardHintDomState(
        { started: true, rows: 0, done: 0 },
        { retryStartedAtMs: 1_000_000, nowMs: 999_000 }
      );
      expect(s).toEqual({ hidden: true, dataPhase: '', lead: '' });
    });
  });
});

describe('backfillStuckDiagnosticsSuffix（止まった理由＋残り件数の診断接尾辞・fix/broadcast-bulk-catchup）', () => {
  it('stopReason と残りギャップの両方を出す', () => {
    const s = backfillStuckDiagnosticsSuffix(
      { stopReason: 'no_progress' },
      { officialCount: 1255, recordedCount: 86 }
    );
    expect(s).toBe('（理由: no_progress・残り約1,169件）');
  });

  it('公式/記録が無いときは理由だけ出す', () => {
    expect(backfillStuckDiagnosticsSuffix({ stopReason: 'cap_elapsed' })).toBe(
      '（理由: cap_elapsed）'
    );
  });

  it('ギャップが 0 以下なら件数は出さない', () => {
    expect(
      backfillStuckDiagnosticsSuffix(
        { stopReason: 'no_entry' },
        { officialCount: 100, recordedCount: 100 }
      )
    ).toBe('（理由: no_entry）');
  });

  it('stopReason も件数も無ければ空文字', () => {
    expect(backfillStuckDiagnosticsSuffix({})).toBe('');
    expect(backfillStuckDiagnosticsSuffix({ stopReason: '' }, {})).toBe('');
  });

  it('記録カードの partial 文言の末尾に診断接尾辞が付く', () => {
    const s = backfillRecordCardHintDomState(
      { started: true, rows: 50, done: 1, stopReason: 'no_progress' },
      { officialCount: 1255, recordedCount: 86 }
    );
    expect(s.hidden).toBe(false);
    expect(s.dataPhase).toBe('partial');
    expect(s.lead).toContain('（理由: no_progress・残り約1,169件）');
  });

  it('caught_up（95%以上）では診断接尾辞を付けない', () => {
    const s = backfillRecordCardHintDomState(
      { started: true, rows: 980, done: 1, stopReason: 'no_progress' },
      { officialCount: 1000, recordedCount: 980 }
    );
    expect(s.dataPhase).toBe('caught_up');
    expect(s.lead).toBe(BACKFILL_RECORD_HINT_NEAR_COMPLETE_TEXT);
  });

  describe('誤完了の可視化（reached_start なのに公式に未達・実機118/595）', () => {
    // v0.1.685: reached_start 大ギャップは hidden（自動再 sweep 中・黙って取る設計）。
    //   メッセージを出すとユーザーに「ローディング中」と感じさせる（v0.1.657 設計に反する）。
    it('reached_start(done) で記録が公式の半分未満は hidden（自動再 sweep に任せる）', () => {
      const s = backfillRecordCardHintDomState(
        { started: true, rows: 118, done: 1, stopReason: 'reached_start' },
        { officialCount: 595, recordedCount: 118 }
      );
      expect(s.hidden).toBe(true);
    });

    it('reached_start(done) で記録が公式の50〜95% なら達成扱いで隠す（watchdog と整合・自動回復しない帯を作らない）', () => {
      // 70%: 旧実装は「届いていません」を出しつつ watchdog は再 sweep しない不整合帯だった。
      //   新実装は near-complete な reached_start を達成扱いにして静観する（AGENTS §3.3）。
      const s = backfillRecordCardHintDomState(
        { started: true, rows: 700, done: 1, stopReason: 'reached_start' },
        { officialCount: 1000, recordedCount: 700 }
      );
      expect(s.hidden).toBe(true);
    });

    it('reached_start(done) で記録が公式の95%以上なら従来どおり達成（隠す）', () => {
      const s = backfillRecordCardHintDomState(
        { started: true, rows: 980, done: 1, stopReason: 'reached_start' },
        { officialCount: 1000, recordedCount: 980 }
      );
      // 達成扱い→記録カードには出さない（hidden）。
      expect(s.hidden).toBe(true);
    });

    it('公式件数が分からなければ done は従来どおり隠す（誤検知しない）', () => {
      const s = backfillRecordCardHintDomState(
        { started: true, rows: 118, done: 1, stopReason: 'reached_start' },
        {}
      );
      expect(s.hidden).toBe(true);
    });
  });
});

describe('resolveOfficialComparisonDisplay（v0.1.763: 中途半端な％をやめ正直な状態に）', () => {
  it('🔴実機の核: 接続切れで止まり0件 backward_exhausted=「約6%」でなく「再接続待ち」状態に', () => {
    // 実機 lv350762947: 公式1302・記録414(=32%)で running:false stopReason:backward_exhausted。
    //   止まっているのに％+「取り込み中」を出していた=最悪UX。これを stalled(正直)に。
    const r = resolveOfficialComparisonDisplay({
      officialCount: 1302,
      recordedCount: 414,
      backfillRunning: false,
      backfillStarted: true,
      backfillStopReason: 'backward_exhausted'
    });
    expect(r.mode).toBe('stalled');
    expect(r.text).not.toMatch(/%|％/); // 中途半端な％は出さない
    expect(r.text).toContain('接続'); // 接続が戻れば続きを取ると正直に
  });

  it('実質達成(記録>=公式95%)=％でなく静かな肯定(数字で煽らない)', () => {
    const r = resolveOfficialComparisonDisplay({
      officialCount: 529,
      recordedCount: 543, // 実機 いちこ: 記録が公式以上(103%)
      backfillRunning: false,
      backfillStarted: true,
      backfillStopReason: 'reached_start'
    });
    expect(r.mode).toBe('complete');
    expect(r.text).not.toMatch(/%|％/);
    expect(r.text).toContain('取り込み済み');
  });

  it('explicit reached_start stays complete below the 95 percent ratio', () => {
    const r = resolveOfficialComparisonDisplay({
      officialCount: 5200,
      recordedCount: 4100,
      backfillRunning: false,
      backfillStarted: true,
      backfillStopReason: 'reached_start',
      recordingActive: true
    });
    expect(r.mode).toBe('complete');
  });

  it('まだ走行中=「取り込み中」状態名(％で不安にさせない)', () => {
    const r = resolveOfficialComparisonDisplay({
      officialCount: 1000,
      recordedCount: 200,
      backfillRunning: true,
      backfillStarted: true,
      backfillStopReason: ''
    });
    expect(r.mode).toBe('fetching');
    expect(r.text).not.toMatch(/%|％/);
  });

  it('no_entry/rate_limited/no_progress/aborted で止まったら全部 stalled(正直に再試行案内)', () => {
    for (const reason of ['no_entry', 'no_view_base', 'rate_limited', 'no_progress', 'aborted', 'stalled']) {
      const r = resolveOfficialComparisonDisplay({
        officialCount: 1000,
        recordedCount: 60,
        backfillRunning: false,
        backfillStarted: true,
        backfillStopReason: reason
      });
      expect(r.mode, `reason=${reason}`).toBe('stalled');
    }
  });

  it('公式不明/0なら hidden(比較を出さない)', () => {
    expect(resolveOfficialComparisonDisplay({ officialCount: null }).mode).toBe('hidden');
    expect(resolveOfficialComparisonDisplay({ officialCount: 0 }).mode).toBe('hidden');
    expect(resolveOfficialComparisonDisplay({}).mode).toBe('hidden');
  });

  it('起動前(started=false)は hidden(まだ何も言わない)', () => {
    const r = resolveOfficialComparisonDisplay({
      officialCount: 500,
      recordedCount: 0,
      backfillRunning: false,
      backfillStarted: false,
      backfillStopReason: ''
    });
    expect(r.mode).toBe('hidden');
  });

  it('実質達成は stalled な stopReason でも complete を優先(取れてるのに再試行案内を出さない)', () => {
    const r = resolveOfficialComparisonDisplay({
      officialCount: 1000,
      recordedCount: 980, // 98%=実質達成
      backfillRunning: false,
      backfillStarted: true,
      backfillStopReason: 'no_entry'
    });
    expect(r.mode).toBe('complete');
  });

  // v0.1.764: 「％がまだ出てる・約束が守られてない」根治。backfill 状態が popup に届いていない
  //   (KEY_BACKFILL_PROGRESS は done=1 時しか書かれず走行/再アーム中は null)ケースでも％を出さない。
  it('🔴状態不明+記録中の生放送=％でなく「取り込み中」(約12%固定の根治)', () => {
    // 実機 v0.1.763: 公式695/記録80(=12%)・走行中で progress 未着=state 無しで「約12%」が出ていた。
    const r = resolveOfficialComparisonDisplay({
      officialCount: 695,
      recordedCount: 80,
      recordingActive: true
      // backfillRunning/Started/StopReason は未指定(=popup に届いていない)
    });
    expect(r.mode).toBe('fetching');
    expect(r.text).not.toMatch(/%|％/); // ％は二度と出さない
  });

  it('状態不明+記録中でも実質達成なら complete(取り込み中とは言わない)', () => {
    const r = resolveOfficialComparisonDisplay({
      officialCount: 500,
      recordedCount: 490,
      recordingActive: true
    });
    expect(r.mode).toBe('complete');
  });

  it('状態不明+記録OFF(recordingActive 無し)は hidden(タイムシフト等を壊さない)', () => {
    const r = resolveOfficialComparisonDisplay({
      officialCount: 500,
      recordedCount: 80
      // recordingActive 無し
    });
    expect(r.mode).toBe('hidden');
  });
});

describe('backfillThroughputLine（スループット計器・v0.1.999）', () => {
  it('経過・区画・再シードから「約1区画◯ms」を出す', () => {
    const s = backfillThroughputLine({ seg: 420, elapsedMs: 12_300, reseeds: 8 });
    expect(s).toBe('⏱ 取得速度: 経過12.3秒・区画420・再シード8回 → 約1区画29ms');
  });

  it('再シード0なら再シード部分を出さない', () => {
    const s = backfillThroughputLine({ seg: 100, elapsedMs: 5_000, reseeds: 0 });
    expect(s).toBe('⏱ 取得速度: 経過5.0秒・区画100 → 約1区画50ms');
  });

  it('elapsedMs が無い/0 なら空文字（観測前は出さない）', () => {
    expect(backfillThroughputLine({ seg: 100, elapsedMs: 0, reseeds: 5 })).toBe('');
    expect(backfillThroughputLine({ seg: 100 })).toBe('');
  });

  it('seg が無い/0 なら空文字（割れない）', () => {
    expect(backfillThroughputLine({ seg: 0, elapsedMs: 5_000 })).toBe('');
    expect(backfillThroughputLine({ elapsedMs: 5_000 })).toBe('');
  });

  it('大きい値は3桁区切りで出す', () => {
    const s = backfillThroughputLine({ seg: 4200, elapsedMs: 120_000, reseeds: 1500 });
    expect(s).toContain('区画4,200');
    expect(s).toContain('再シード1,500回');
  });
});

describe('backfillLiveThroughputLine（走行中スループット計器・v0.1.1045 段1）', () => {
  it('経過・実区画・橋渡し・yield・fg から「約1区画◯ms」を出す', () => {
    const s = backfillLiveThroughputLine({
      running: 1, seg: 420, dataSegs: 420, bridgingSteps: 380,
      yields: 66, yieldWaitMsTotal: 3200, elapsedMs: 12_300, fg: 1
    });
    expect(s).toBe('⏱ 取得速度(走行中): 経過12.3秒・実区画420・橋渡し380・yield66回(計3,200ms)・fg=1 → 約1区画29ms');
  });

  it('約1区画は【実区画(dataSegs)】で割る（橋渡しを分母に混ぜない=退行の見える化）', () => {
    // dataSegs=100・elapsedMs=5000 → 50ms。bridgingSteps が多くても perSeg は実区画基準。
    const s = backfillLiveThroughputLine({
      running: 1, seg: 100, dataSegs: 100, bridgingSteps: 900,
      yields: 30, yieldWaitMsTotal: 1500, elapsedMs: 5_000, fg: 1
    });
    expect(s).toContain('→ 約1区画50ms');
    expect(s).toContain('実区画100');
    expect(s).toContain('橋渡し900');
  });

  it('fg=0（裏タブペース）を明示する', () => {
    const s = backfillLiveThroughputLine({
      running: 1, dataSegs: 50, bridgingSteps: 10, yields: 8, yieldWaitMsTotal: 40, elapsedMs: 10_000, fg: 0
    });
    expect(s).toContain('fg=0');
  });

  it('elapsedMs が無い/0 なら空文字（観測前は出さない）', () => {
    expect(backfillLiveThroughputLine({ dataSegs: 100, elapsedMs: 0 })).toBe('');
    expect(backfillLiveThroughputLine({ dataSegs: 100 })).toBe('');
  });

  it('dataSegs が無い/0 なら空文字（割れない=橋渡しだけの初期は出さない）', () => {
    expect(backfillLiveThroughputLine({ dataSegs: 0, bridgingSteps: 50, elapsedMs: 5_000 })).toBe('');
    expect(backfillLiveThroughputLine({ elapsedMs: 5_000 })).toBe('');
  });

  it('null/非オブジェクトでも throw せず空文字', () => {
    expect(backfillLiveThroughputLine(null)).toBe('');
    expect(backfillLiveThroughputLine(undefined)).toBe('');
    expect(backfillLiveThroughputLine('x')).toBe('');
  });
});
