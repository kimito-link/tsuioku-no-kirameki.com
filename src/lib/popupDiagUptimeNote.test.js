import { describe, expect, it } from 'vitest';
import { buildPopupDiagUptimeNote } from './popupDiagUptimeNote.js';

/**
 * 2026-08-01: 開発者(Claude)が実配信の速報を「popup起動から22秒後の値」と誤読し、
 * 起動 362ms 後の正常な姿を「鏡publishの取りこぼし」と判定しかけた事故の再発防止。
 *
 * 速報の「約N秒前にpopupで取得」は速報生成時刻からの経過であって、
 * popup 起動からの経過ではない。両者は別物で、計器を読むのに必要なのは後者。
 */
describe('buildPopupDiagUptimeNote', () => {
  it('起動直後(実際に誤読した362ms)は「正常です」と明示して誤判定を止める', () => {
    const note = buildPopupDiagUptimeNote(362);
    expect(note).toContain('popup 起動から 0.4 秒後の値');
    expect(note).toContain('正常です');
    expect(note).toContain('取り直して');
  });

  it('3秒未満は警告を出す(境界の内側)', () => {
    expect(buildPopupDiagUptimeNote(2999)).toContain('正常です');
  });

  it('3秒以上は警告を出さず、齢だけを述べる', () => {
    const note = buildPopupDiagUptimeNote(3000);
    expect(note).toBe('popup 起動から 3.0 秒後の値');
    expect(note).not.toContain('正常です');
  });

  it('10秒以上は整数秒で読みやすく出す', () => {
    expect(buildPopupDiagUptimeNote(22000)).toBe('popup 起動から 22 秒後の値');
    expect(buildPopupDiagUptimeNote(95500)).toBe('popup 起動から 96 秒後の値');
  });

  it('値が無い/不正なら注記を出さない(嘘の齢を出さない)', () => {
    expect(buildPopupDiagUptimeNote(null)).toBe('');
    expect(buildPopupDiagUptimeNote(undefined)).toBe('');
    expect(buildPopupDiagUptimeNote(NaN)).toBe('');
    expect(buildPopupDiagUptimeNote(-1)).toBe('');
    expect(buildPopupDiagUptimeNote('abc')).toBe('');
  });

  it('0ms でも齢として成立する(未起動と混同しない)', () => {
    expect(buildPopupDiagUptimeNote(0)).toContain('popup 起動から 0.0 秒後の値');
  });
});
