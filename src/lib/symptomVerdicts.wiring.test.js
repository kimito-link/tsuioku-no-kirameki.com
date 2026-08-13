import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAiShareFullText } from './aiShareFullText.js';

/**
 * ★v0.1.1385: 症状別の特化判定が【速報に実際に出る】ことを固定する。
 *
 * ユーザーの言葉:「特化したものを複数つくれといっているのに、総合1個しかない」
 *
 * 従来は33セルを `総合判定: 🟢 取り込み中 ✓` の1行に畳んでおり、
 * 2026-08-13 の実機は **総合=取り込み中✓ なのに サムネ0% / レーン未描画** だった。
 * ＝総合1個では症状が埋もれる。
 *
 * ★[[verify-output-appears-before-shipping-2026-08-09]]:
 *   計器を足したら「その行が実際に出力に現れるか」を通しで確認する。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(repoRoot, 'src/lib/aiShareFullText.js'), 'utf8').replace(
  /\r\n/g,
  '\n'
);

describe('★症状別判定が速報に配線されている', () => {
  it('import して呼んでいる', () => {
    expect(src).toContain("from './symptomVerdicts.js'");
    expect(src).toContain('buildSymptomVerdicts({');
    expect(src).toContain('formatSymptomVerdictsBlock(');
  });

  it('★実際に lines へ push している(計算しても出さなければ無いのと同じ)', () => {
    expect(src).toMatch(/if \(symptomBlock\) \{ lines\.push\(symptomBlock\); lines\.push\(''\); \}/);
  });

  it('★popup 診断の3つを渡している(どれか欠けるとその症状が永久に出ない)', () => {
    expect(src).toContain('identityAcquisition: popupSnap?.identityAcquisition');
    expect(src).toContain('laneRenderProbe: popupSnap?.storyUserLaneRenderProbe');
    expect(src).toContain('avatarLoadDiag: popupSnap?.avatarLoadDiag');
  });

  it('★実機の値を通すと本文に「サムネが白い」と「レーンが空」が両方出る(通し確認)', () => {
    const text = buildAiShareFullText({
      overviewText: '記録中 1 配信',
      livesData: [],
      fastDiag: null,
      // 2026-08-13 実機の値
      popupDiag: {
        identityAcquisition: { identifiable: 3, withThumb: 0, guessedThumb: 3, anonymous: 86 },
        storyUserLaneRenderProbe: { started: 0, domTilesPainted: -1 },
        avatarLoadDiag: { usericonFailed: 1, usericonSucceeded: 3 }
      },
      refreshPerf: { totalMs: 164, stepMs: [] }
    });
    expect(text).toContain('症状別の判定');
    expect(text).toContain('サムネが白い');
    expect(text).toContain('レーンが空');
    // ★次の一手が本文に出ていること(読んで直せる)。
    expect(text).toContain('★次の一手');
  });

  it('★正常なら症状ブロックを1行も出さない(ノイズを作らない)', () => {
    const text = buildAiShareFullText({
      overviewText: '記録中 1 配信',
      livesData: [],
      fastDiag: null,
      popupDiag: {
        identityAcquisition: { identifiable: 5, withThumb: 5, guessedThumb: 0, anonymous: 0 },
        storyUserLaneRenderProbe: { started: 3, domTilesPainted: 89, heavySettleState: 'settled' },
        avatarLoadDiag: { usericonFailed: 0, usericonSucceeded: 5 }
      },
      refreshPerf: { totalMs: 164, stepMs: [] }
    });
    expect(text).not.toContain('症状別の判定');
  });
});
