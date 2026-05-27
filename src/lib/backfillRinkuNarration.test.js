import { describe, it, expect } from 'vitest';
import {
  backfillNarrationPhase,
  backfillRinkuNarration
} from './backfillRinkuNarration.js';

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

  it('完了・件数ありは done', () => {
    expect(backfillNarrationPhase({ started: true, rows: 300, done: 1 })).toBe('done');
    expect(backfillNarrationPhase({ started: true, rows: 1, done: true })).toBe('done');
  });

  it('完了・件数0は done_empty', () => {
    expect(backfillNarrationPhase({ started: true, rows: 0, done: 1 })).toBe('done_empty');
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

  it('done は「届いた」+件数・animating=false', () => {
    const r = backfillRinkuNarration({ started: true, rows: 390, done: 1 });
    expect(r.phase).toBe('done');
    expect(r.lead).toContain('390件');
    expect(r.lead).toContain('届いた');
    expect(r.animating).toBe(false);
  });

  it('done_empty は「無かった」・animating=false', () => {
    const r = backfillRinkuNarration({ started: true, rows: 0, done: 1 });
    expect(r.phase).toBe('done_empty');
    expect(r.lead).toContain('無かった');
    expect(r.animating).toBe(false);
  });
});
