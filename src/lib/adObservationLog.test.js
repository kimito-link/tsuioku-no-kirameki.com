import { describe, expect, it } from 'vitest';
import { adRowUid, observeAdRanking, adObservationNote, adObservationStorageKey } from './adObservationLog.js';

const row = (uid, contribution, extra = {}) => ({
  rank: 1,
  name: `u${uid}`,
  contribution,
  isAnonymous: false,
  userPageUrl: `https://www.nicovideo.jp/user/${uid}`,
  ...extra
});
const T0 = 1_800_000_000_000;

describe('adRowUid(数値uidだけ・名前では引かない)', () => {
  it('userPageUrl から数値uidを取る', () => {
    expect(adRowUid(row(123, 10))).toBe('123');
  });
  it('★URL が無い・数値でない行は誰にも付けない', () => {
    expect(adRowUid({ name: '花子', contribution: 5 })).toBe('');
    expect(adRowUid({ userPageUrl: 'https://www.nicovideo.jp/user/abc' })).toBe('');
    expect(adRowUid({ userPageUrl: 'https://www.nicovideo.jp/user/0123' })).toBe('');
    expect(adRowUid(null)).toBe('');
  });
});

describe('observeAdRanking(増えたのを気づいた時刻の記録)', () => {
  it('★最初の観測はベースライン(「初めて検知」として残すが、増分は作らない)', () => {
    const log = observeAdRanking({}, null, [row(1, 500)], T0);
    expect(log['1']).toEqual({ firstAt: T0, firstTotal: 500, lastAt: 0, lastDelta: 0, lastTotal: 500, n: 0 });
  });
  it('★増えたときだけ「最後に増えた時刻・増分」を更新する', () => {
    let log = observeAdRanking({}, null, [row(1, 500)], T0);
    log = observeAdRanking(log, [row(1, 500)], [row(1, 500)], T0 + 25_000);
    expect(log['1'].n).toBe(0);
    log = observeAdRanking(log, [row(1, 500)], [row(1, 800)], T0 + 50_000);
    expect(log['1']).toMatchObject({ firstAt: T0, lastAt: T0 + 50_000, lastDelta: 300, lastTotal: 800, n: 1 });
  });
  it('★減った(取り直し・順位変動で見え方が変わった)は増分にしない', () => {
    let log = observeAdRanking({}, null, [row(1, 800)], T0);
    log = observeAdRanking(log, [row(1, 800)], [row(1, 700)], T0 + 25_000);
    expect(log['1'].n).toBe(0);
    expect(log['1'].lastTotal).toBe(700);
  });
  it('★途中から上位に入った人は、増分を推測せず「初めて検知」だけ残す', () => {
    let log = observeAdRanking({}, null, [row(1, 500)], T0);
    log = observeAdRanking(log, [row(1, 500)], [row(1, 500), row(2, 900)], T0 + 25_000);
    expect(log['2']).toEqual({ firstAt: T0 + 25_000, firstTotal: 900, lastAt: 0, lastDelta: 0, lastTotal: 900, n: 0 });
  });
  it('★uid の無い行(匿名)は記録しない', () => {
    const log = observeAdRanking({}, null, [{ name: '名無し', contribution: 50 }], T0);
    expect(log).toEqual({});
  });
  it('空・壊れた入力でも例外にならず、既存の記録を壊さない', () => {
    const prev = observeAdRanking({}, null, [row(1, 500)], T0);
    expect(observeAdRanking(prev, [row(1, 500)], null, T0 + 1)).toEqual(prev);
    expect(observeAdRanking(null, null, undefined, T0)).toEqual({});
  });
  it('件数が上限を超えたら古い firstAt から捨てる(無制限に増やさない)', () => {
    const rows = Array.from({ length: 300 }, (_, i) => row(1000 + i, 10 + i));
    const log = observeAdRanking({}, null, rows, T0);
    expect(Object.keys(log).length).toBeLessThanOrEqual(200);
  });
});

describe('adObservationNote(パネルに出す文)', () => {
  it('記録が無ければ空', () => {
    expect(adObservationNote(undefined, T0)).toBe('');
  });
  it('★「気づいた時刻」であることと誤差を明記する', () => {
    const e = { firstAt: T0 - 3_600_000, firstTotal: 500, lastAt: T0 - 120_000, lastDelta: 300, lastTotal: 800, n: 1 };
    const t = adObservationNote(e, T0);
    expect(t).toContain('初めて検知');
    expect(t).toContain('最後に増えたのを検知');
    expect(t).toContain('+300pt');
    expect(t).toContain('最大');
    expect(t).toContain('2分前');
  });
  it('増えた記録が無いときは「増えたのは未検知」と言う(0を捏造しない)', () => {
    const e = { firstAt: T0 - 60_000, firstTotal: 500, lastAt: 0, lastDelta: 0, lastTotal: 500, n: 0 };
    const t = adObservationNote(e, T0);
    expect(t).toContain('初めて検知');
    expect(t).toContain('増えたのは未検知');
  });
});

describe('adObservationStorageKey', () => {
  it('配信IDごとのキー', () => {
    expect(adObservationStorageKey('LV123 ')).toBe('nls_ad_obs_lv123');
  });
});

describe('開く前の分を「今増えた」と言わない', () => {
  it('★既存の記録があっても、前回の標本が無い(このページで最初の標本)ときは増分を作らない', () => {
    const log = observeAdRanking({}, null, [row(1, 500)], T0);
    const next = observeAdRanking(log, null, [row(1, 900)], T0 + 3_600_000);
    expect(next['1'].n).toBe(0);
    expect(next['1'].lastTotal).toBe(900);
  });
});
