import { describe, it, expect } from 'vitest';
import {
  createMonotonicCommentCountState,
  normalizeMonotonicLiveId,
  resolveMonotonicCommentCount,
} from './monotonicCommentCount.js';

describe('normalizeMonotonicLiveId', () => {
  it('lowercases and trims valid lv', () => {
    expect(normalizeMonotonicLiveId('  LV12345 ')).toBe('lv12345');
  });
  it('rejects non-lv', () => {
    expect(normalizeMonotonicLiveId('co12345')).toBe('');
    expect(normalizeMonotonicLiveId('')).toBe('');
    expect(normalizeMonotonicLiveId(null)).toBe('');
    expect(normalizeMonotonicLiveId('lvabc')).toBe('');
  });
});

describe('resolveMonotonicCommentCount', () => {
  it('passes through non-numeric candidate as null (文言はゲート対象外)', () => {
    const s = createMonotonicCommentCountState();
    expect(resolveMonotonicCommentCount(s, 'lv1', '（この配信は未取得）')).toBeNull();
    expect(resolveMonotonicCommentCount(s, 'lv1', NaN)).toBeNull();
    expect(resolveMonotonicCommentCount(s, 'lv1', Infinity)).toBeNull();
    expect(resolveMonotonicCommentCount(s, 'lv1', -5)).toBeNull();
  });

  it('adopts the first numeric value for a lv', () => {
    const s = createMonotonicCommentCountState();
    expect(resolveMonotonicCommentCount(s, 'lv100', 7782)).toBe(7782);
    expect(s.lv).toBe('lv100');
    expect(s.max).toBe(7782);
  });

  it('never decreases within the same lv (核心: ズレ・逆行の根治)', () => {
    const s = createMonotonicCommentCountState();
    // 4 経路が別タイミングでバラバラの値を渡す再現
    expect(resolveMonotonicCommentCount(s, 'lv1', 7851)).toBe(7851); // 速報
    expect(resolveMonotonicCommentCount(s, 'lv1', 7782)).toBe(7851); // パネル(低い)→据え置き
    expect(resolveMonotonicCommentCount(s, 'lv1', 7815)).toBe(7851); // watch(低い)→据え置き
    expect(resolveMonotonicCommentCount(s, 'lv1', 7900)).toBe(7900); // 全件 read → 上がる
    expect(resolveMonotonicCommentCount(s, 'lv1', 7800)).toBe(7900); // 遅延経路 → 据え置き
  });

  it('resets on lv change (別配信は別カウント)', () => {
    const s = createMonotonicCommentCountState();
    expect(resolveMonotonicCommentCount(s, 'lv1', 5000)).toBe(5000);
    expect(resolveMonotonicCommentCount(s, 'lv2', 3)).toBe(3); // 新配信は低い値でもリセット
    expect(s.lv).toBe('lv2');
    expect(s.max).toBe(3);
  });

  it('case/whitespace変化では同一lvとして扱う', () => {
    const s = createMonotonicCommentCountState();
    expect(resolveMonotonicCommentCount(s, 'lv9', 100)).toBe(100);
    expect(resolveMonotonicCommentCount(s, '  LV9 ', 50)).toBe(100); // 同一lv→据え置き
  });

  it('lvが取れないときはゲートせず素通し(状態は汚さない)', () => {
    const s = createMonotonicCommentCountState();
    expect(resolveMonotonicCommentCount(s, '', 1234)).toBe(1234);
    expect(resolveMonotonicCommentCount(s, 'co999', 1234)).toBe(1234);
    expect(s.lv).toBe('');
    expect(s.max).toBe(0);
  });

  it('0件も正しく扱う', () => {
    const s = createMonotonicCommentCountState();
    expect(resolveMonotonicCommentCount(s, 'lv1', 0)).toBe(0);
    expect(resolveMonotonicCommentCount(s, 'lv1', 5)).toBe(5);
    expect(resolveMonotonicCommentCount(s, 'lv1', 0)).toBe(5); // 0に戻さない
  });

  it('state を直接 lv=\'\'/max=0 に書き換えるとリセットとして機能する(resetOfficialCommentSamplingState の配線を担保)', () => {
    const s = createMonotonicCommentCountState();
    // 同一配信で値を積んだ後
    resolveMonotonicCommentCount(s, 'lv1', 500);
    expect(s.max).toBe(500);
    // 配信切替/リセット時に content-entry.js は lv=''/max=0 を直書きする
    s.lv = '';
    s.max = 0;
    // リセット後: 同一 lv でも低い値から正しく再開する
    expect(resolveMonotonicCommentCount(s, 'lv1', 3)).toBe(3);
    expect(s.max).toBe(3);
  });
});
