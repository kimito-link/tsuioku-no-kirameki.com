import { describe, expect, it } from 'vitest';
import {
  ageMsOf,
  agoLabel,
  classifyReading,
  durationMsOf,
  toEpochMs,
  VALUE_FRESH_MS,
  WRITER_BOOT_GRACE_MS
} from './timeAuthority.js';

const NOW = 1_700_000_000_000;

/**
 * ★移設の恒等テスト(移設前に実測した入出力表)。
 *
 * diagnosticsTrust.js の toEpochMs / agoLabel を timeAuthority へ移す前に、
 * 旧実装を実際に走らせて出力を採取した。移設で意味が変わっていないことをこれで固定する。
 *
 * ★奇妙な挙動も【そのまま】保存する:
 *   - toEpochMs(-1) → 978274800000  (n>0 を満たさず Date.parse('-1') へ落ちる)
 *   - agoLabel(null) → '0秒前' だが agoLabel(undefined) → ''  (Number(null)===0)
 *   直すのは別タスク。移設と挙動変更を同じコミットに混ぜない。
 */
describe('移設の恒等(旧 diagnosticsTrust 実装と同値)', () => {
  it('toEpochMs: 移設前に採取した入出力と一致する', () => {
    expect(toEpochMs(0)).toBe(0);
    expect(toEpochMs(1)).toBe(1);
    expect(toEpochMs(null)).toBe(0);
    expect(toEpochMs(undefined)).toBe(0);
    expect(toEpochMs('')).toBe(0);
    expect(toEpochMs('abc')).toBe(0);
    expect(toEpochMs(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(toEpochMs('1700000000000')).toBe(1_700_000_000_000);
    expect(toEpochMs('2026-08-10T00:00:00Z')).toBe(1_786_320_000_000);
    expect(toEpochMs(NaN)).toBe(0);
  });

  it('★負値は 0 に落ちず Date.parse へ流れる(奇妙だが既存挙動・reality-checker 指摘で追加)', () => {
    /*
     * toEpochMs(-1) は n>0 を満たさず Date.parse('-1') へ落ち、日付として解釈される。
     * 移設前の実測(JST)では 978274800000(=2001-01-01 00:00 JST)だった。
     *
     * ★具体値をそのまま固定しない: Date.parse('-1') は【ローカルTZ依存】で、
     *   TZ の違う CI で落ちる(実測: UTC では 2000-12-31T15:00Z)。
     *   固定すべきは「0 に落ちない=Date.parse へ流れる」という【挙動】の方。
     *   ここを数値で固定すると、環境差で赤くなる嘘のテストになる。
     */
    const v = toEpochMs(-1);
    expect(v).not.toBe(0);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBe(Date.parse('-1')); // 実装が Date.parse 経路を通っていることの断言
  });

  it('agoLabel: 移設前に採取した入出力と一致する(境界と非対称も含む)', () => {
    expect(agoLabel(0)).toBe('0秒前');
    expect(agoLabel(999)).toBe('1秒前');
    expect(agoLabel(89_000)).toBe('89秒前');
    expect(agoLabel(89_999)).toBe('2分前'); // Math.round(89.999)=90 → 分表記へ
    expect(agoLabel(90_000)).toBe('2分前');
    expect(agoLabel(3_600_000)).toBe('60分前');
    expect(agoLabel(-1)).toBe('');
    expect(agoLabel(undefined)).toBe('');
    expect(agoLabel('x')).toBe('');
    // ★非対称(Number(null)===0)。既存挙動なので保存する。
    expect(agoLabel(null)).toBe('0秒前');
  });
});

describe('ageMsOf / durationMsOf(null を 0 と誤読しないガード)', () => {
  it('時点と現在時刻から齢を出す', () => {
    expect(ageMsOf(NOW - 5000, NOW)).toBe(5000);
  });

  it('★時点が取れなければ null(「たった今」と偽らない)', () => {
    expect(ageMsOf(null, NOW)).toBe(null);
    expect(ageMsOf(undefined, NOW)).toBe(null);
    expect(ageMsOf('', NOW)).toBe(null);
    expect(ageMsOf(0, NOW)).toBe(null);
  });

  it('未来の時点でも負にしない(0で止める)', () => {
    expect(ageMsOf(NOW + 5000, NOW)).toBe(0);
  });

  it('★durationMsOf: null/空文字を 0ms と誤読しない', () => {
    expect(durationMsOf(null)).toBe(null);
    expect(durationMsOf(undefined)).toBe(null);
    expect(durationMsOf('')).toBe(null);
    expect(durationMsOf(-1)).toBe(null);
    expect(durationMsOf(NaN)).toBe(null);
    expect(durationMsOf(0)).toBe(0);
    expect(durationMsOf(4297)).toBe(4297);
  });
});

/**
 * ★7版目の症状の回帰。
 *
 * 実機(2026-08-10・v0.1.1302 適用済みでも🔴が出た):
 *   popup 起動から 4.3秒後の値 / 鏡は 8秒前の値
 * = 読んだのは popup 起動の【3.7秒前】。まだ存在しないものを読んだので空なのは当然。
 *
 * v0.1.1302 は「起動から3秒未満か」だけを見ていたので、起動4.3秒=猶予の外で🔴を出した。
 * ★このテストは、未検証だった v0.1.1303 ロジックの初の実効検証でもある。
 */
describe('classifyReading: 実機タイムラインの回帰', () => {
  it('★実機2026-08-10の再現(boot 4.3s・read 8s前)は pending', () => {
    const r = classifyReading({
      present: false,
      writerBootAgoMs: 4297,
      readAgoMs: 8000,
      nowMs: NOW
    });
    expect(r.state).toBe('pending');
    expect(r.readAtRelativeToBootMs).toBe(-3703);
  });

  it('★grace を過ぎた absent は pending にしない(保留が🔴を無限に隠さない)', () => {
    const r = classifyReading({
      present: false,
      writerBootAgoMs: 30_000,
      readAgoMs: 1000, // 読んだのは起動の29秒【後】=書く時間は十分あった
      nowMs: NOW
    });
    expect(r.state).toBe('absent');
    expect(r.readAtRelativeToBootMs).toBe(29_000);
  });

  it('★readAgoMs 欠落時は起動基準へフォールバック(v1302 互換)', () => {
    expect(classifyReading({ present: false, writerBootAgoMs: 1000, nowMs: NOW }).state).toBe(
      'pending'
    );
    expect(classifyReading({ present: false, writerBootAgoMs: 30_000, nowMs: NOW }).state).toBe(
      'absent'
    );
  });

  it('★どちらの経過も取れなければ猶予を与えない(0秒と誤認しない)', () => {
    const r = classifyReading({ present: false, nowMs: NOW });
    expect(r.state).toBe('absent');
    expect(r.readAtRelativeToBootMs).toBe(null);
  });

  it('★writerBootAgoMs が null のとき Number(null)===0 で「起動0秒」と誤認しない', () => {
    const r = classifyReading({ present: false, writerBootAgoMs: null, readAgoMs: null, nowMs: NOW });
    expect(r.state).toBe('absent');
  });

  it('grace の境界: ちょうど grace は pending にしない(未満のみ)', () => {
    const at = classifyReading({
      present: false,
      writerBootAgoMs: WRITER_BOOT_GRACE_MS,
      readAgoMs: 0,
      nowMs: NOW
    });
    expect(at.state).toBe('absent');
    const just = classifyReading({
      present: false,
      writerBootAgoMs: WRITER_BOOT_GRACE_MS - 1,
      readAgoMs: 0,
      nowMs: NOW
    });
    expect(just.state).toBe('pending');
  });
});

describe('classifyReading: 値が存在するときの鮮度', () => {
  it('新しい値は fresh', () => {
    const r = classifyReading({ present: true, capturedAt: NOW - 1000, nowMs: NOW });
    expect(r.state).toBe('fresh');
    expect(r.fresh).toBe(true);
    expect(r.ageMs).toBe(1000);
  });

  it('古い値は stale', () => {
    const r = classifyReading({ present: true, capturedAt: NOW - VALUE_FRESH_MS - 1, nowMs: NOW });
    expect(r.state).toBe('stale');
    expect(r.fresh).toBe(false);
  });

  it('鮮度の境界: ちょうど VALUE_FRESH_MS は fresh(以下)', () => {
    const r = classifyReading({ present: true, capturedAt: NOW - VALUE_FRESH_MS, nowMs: NOW });
    expect(r.fresh).toBe(true);
  });

  it('★齢が取れないときは fresh を名乗らない(null=信頼を偽装しない)', () => {
    const r = classifyReading({ present: true, capturedAt: null, nowMs: NOW });
    expect(r.fresh).toBe(null);
    expect(r.ageMs).toBe(null);
  });

  it('present:true なら pending にはならない(存在する値は保留しない)', () => {
    const r = classifyReading({
      present: true,
      capturedAt: NOW - 100,
      writerBootAgoMs: 500,
      readAgoMs: 0,
      nowMs: NOW
    });
    expect(r.state).not.toBe('pending');
  });
});
