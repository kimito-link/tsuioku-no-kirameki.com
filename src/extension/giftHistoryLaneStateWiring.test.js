/**
 * giftHistory レーンの state 判定に「API 経路の実データ」が配線されているかの検査(v0.1.1339)。
 *
 * ★なぜ要るか(2026-08-12 実機)
 *   速報が永久に「ギフト履歴: ⏳取得中」のままだった。画面は正しく描けているのに、
 *   判定側が公式サイドバーの DOM(bundle.giftHistory)しか見ていなかった。
 *   ★判定を直しても【呼び出し側が渡さなければ無意味】なので、配線そのものを検査する
 *   ([[verify-output-appears-before-shipping]] / 配線されていない計器は存在しないのと同じ)。
 *
 * ★同型の片肺を再発させないため、3レーンすべてが API 経路を渡していることを数で断言する。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(new URL('./popup-entry.js', import.meta.url), 'utf8');

describe('北極星レーンの state 判定への API 経路の配線', () => {
  it('★giftHistory が giftHistoryApiRows を渡している(v0.1.1339 で解消した片肺)', () => {
    const call = SRC.match(
      /determineNorthStarLaneState\('giftHistory',\s*\{[^}]*\}/
    );
    expect(call).not.toBeNull();
    expect(String(call?.[0])).toContain('giftHistoryApiRows');
  });

  it('giftHistoryApiRows は新規 storage read を足さず ctxRaw から作っている', () => {
    // 新しい read を足すと大配信で固まる(status-extras の教訓)。既存 ctxRaw を使うこと。
    const block = SRC.slice(
      SRC.indexOf('const giftHistoryApiRows ='),
      SRC.indexOf('const giftHistoryApiRows =') + 400
    );
    expect(block).toContain('ctxRaw');
    expect(block).not.toContain('chrome.storage');
  });

  it('contributionRanking は kokenApiRows を渡している(v0.1.617 の先例)', () => {
    const calls = SRC.match(
      /determineNorthStarLaneState\('contributionRanking',\s*\{[^}]*\}/g
    ) || [];
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c).toContain('kokenApiRows');
  });

  it('adRanking は nicoadApiRows を渡している(v0.1.617 の先例)', () => {
    const calls = SRC.match(
      /determineNorthStarLaneState\('adRanking',\s*\{[^}]*\}/g
    ) || [];
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c).toContain('nicoadApiRows');
  });
});
