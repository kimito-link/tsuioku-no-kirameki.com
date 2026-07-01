import { describe, it, expect } from 'vitest';
import { avatarLoadDiagToActionCards } from './avatarLoadReport.js';

describe('avatarLoadDiagToActionCards — アイコン画像ロード失敗の名指し(v0.1.1026)', () => {
  it('失敗0なら空配列(ノイズにしない)', () => {
    expect(avatarLoadDiagToActionCards({ usericonFailed: 0, usericonSucceeded: 5 })).toEqual([]);
    expect(avatarLoadDiagToActionCards(null)).toEqual([]);
  });
  it('失敗ありなら1カード(件数・失敗率・原因・statusの外)', () => {
    const cards = avatarLoadDiagToActionCards({ usericonFailed: 6, usericonSucceeded: 4, failedUsericonSamples: ['https://x/a.jpg'] });
    expect(cards.length).toBe(1);
    expect(cards[0].symptom).toContain('6 件読み込めていません');
    expect(cards[0].symptom).toContain('60%');
    expect(cards[0].symptom).toContain('https://x/a.jpg');
    expect(cards[0].cause).toContain('CDN');
    expect(cards[0].fixableHere).toBe('no');
  });
  it('失敗率が高い(半分超)は warn、低いは info', () => {
    expect(avatarLoadDiagToActionCards({ usericonFailed: 6, usericonSucceeded: 4 })[0].severity).toBe('warn'); // 60%
    expect(avatarLoadDiagToActionCards({ usericonFailed: 1, usericonSucceeded: 9 })[0].severity).toBe('info'); // 10%
  });
  it('サンプルが無くても落ちない', () => {
    const cards = avatarLoadDiagToActionCards({ usericonFailed: 2, usericonSucceeded: 8 });
    expect(cards[0].symptom).not.toContain('例:');
  });
});
