import { describe, it, expect } from 'vitest';
import { buildZeroPtSenderLabels, isZeroPtCountText } from './ytZeroPtGiftLabel.js';

describe('buildZeroPtSenderLabels', () => {
  it('金額の出ないギフト1件だけの人は、ギフトの名前を札にする', () => {
    const m = buildZeroPtSenderLabels([{ senderName: '@ぶらっくしろっぷ', itemName: 'ハイ', points: 0 }]);
    expect(m.get('@ぶらっくしろっぷ')?.label).toBe('ハイ');
    expect(m.get('@ぶらっくしろっぷ')?.title).toContain('金額が出ない');
  });

  it('同じギフトを複数回なら ×回数、種類が混ざれば「ギフト ×合計」', () => {
    const m = buildZeroPtSenderLabels([
      { senderName: 'A', itemName: 'ハイ', points: 0 },
      { senderName: 'A', itemName: 'ハイ', points: 0 },
      { senderName: 'B', itemName: 'ハイ', points: 0 },
      { senderName: 'B', itemName: 'メンバーシップギフト', points: 0 },
    ]);
    expect(m.get('A')?.label).toBe('ハイ ×2');
    expect(m.get('B')?.label).toBe('ギフト ×2');
    expect(m.get('B')?.title).toContain('ハイ・メンバーシップギフト');
  });

  it('pt のある応援を1件でもした人は入れない(pt で並ぶため)', () => {
    const m = buildZeroPtSenderLabels([
      { senderName: 'C', itemName: 'ハイ', points: 0 },
      { senderName: 'C', itemName: 'スーパーチャット ¥500', points: 500 },
    ]);
    expect(m.has('C')).toBe(false);
  });

  it('名前の無い行・壊れた入力でも落ちない(名前が無ければ「ギフト」)', () => {
    expect(buildZeroPtSenderLabels(/** @type {any} */ (null)).size).toBe(0);
    const m = buildZeroPtSenderLabels([{ senderName: '', points: 0 }, { senderName: 'D' }]);
    expect(m.size).toBe(1);
    expect(m.get('D')?.label).toBe('ギフト');
  });
});

describe('isZeroPtCountText', () => {
  it('0pt だけを当てる', () => {
    expect(isZeroPtCountText('0pt')).toBe(true);
    expect(isZeroPtCountText(' 0 pt ')).toBe(true);
    expect(isZeroPtCountText('10pt')).toBe(false);
    expect(isZeroPtCountText('ハイ')).toBe(false);
  });
});

describe('isZeroPtCountText(単位を直したあと)', () => {
  it('「0 スコア」も 0pt として扱う', async () => {
    const { isZeroPtCountText } = await import('./ytZeroPtGiftLabel.js');
    expect(isZeroPtCountText('0 スコア')).toBe(true);
    expect(isZeroPtCountText('10 スコア')).toBe(false);
  });
});
