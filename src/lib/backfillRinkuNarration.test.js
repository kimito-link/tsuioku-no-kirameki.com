import { describe, it, expect } from 'vitest';
import {
  backfillNarrationPhase,
  backfillRinkuNarration,
  backfillReachedStreamStart
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
