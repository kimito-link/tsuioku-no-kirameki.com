import { describe, expect, it } from 'vitest';
import { buildSymptomVerdicts, formatSymptomVerdictsBlock } from './symptomVerdicts.js';

/**
 * ★v0.1.1385: 症状別の特化判定(複数)。
 *   ユーザー指摘「特化したものを複数つくれといっているのに、総合1個しかない」への回答。
 */
describe('buildSymptomVerdicts', () => {
  it('★実機(2026-08-13)の値を入れると「サムネが白い」と「レーンが空」が両方出る', () => {
    // 実機速報の実値: identifiable=3 / withThumb=0 / guessedThumb=3 / started=0
    const v = buildSymptomVerdicts({
      identityAcquisition: { identifiable: 3, withThumb: 0, guessedThumb: 3, anonymous: 86 },
      laneRenderProbe: { started: 0, domTilesPainted: -1 }
    });
    const ids = v.map((x) => x.id);
    expect(ids).toContain('thumb-white');
    expect(ids).toContain('lane-never-rendered');
    // ★「総合1個」ではなく複数出ることが要点。
    expect(v.length).toBeGreaterThanOrEqual(2);
  });

  it('★匿名だけの配信では「サムネが白い」を出さない(仕様上取れない=直せない赤を作らない)', () => {
    const v = buildSymptomVerdicts({
      identityAcquisition: { identifiable: 0, withThumb: 0, guessedThumb: 0, anonymous: 89 }
    });
    expect(v.map((x) => x.id)).not.toContain('thumb-white');
  });

  it('実サムネが取れていれば出さない', () => {
    const v = buildSymptomVerdicts({
      identityAcquisition: { identifiable: 5, withThumb: 5, guessedThumb: 0 }
    });
    expect(v).toHaveLength(0);
  });

  it('★次の一手が必ず入っている(読んで直せない判定は作らない)', () => {
    const v = buildSymptomVerdicts({
      identityAcquisition: { identifiable: 3, withThumb: 0, guessedThumb: 3 },
      laneRenderProbe: { started: 0 },
      updateMs: 16437
    });
    for (const item of v) expect(item.line).toContain('★次の一手');
  });

  it('レーンは走ったが0枚 / race を区別する', () => {
    const zero = buildSymptomVerdicts({ laneRenderProbe: { started: 3, domTilesPainted: 0 } });
    expect(zero.map((x) => x.id)).toContain('lane-painted-zero');
    const race = buildSymptomVerdicts({
      laneRenderProbe: { started: 3, domTilesPainted: 12, heavySettleState: 'race' }
    });
    expect(race.map((x) => x.id)).toContain('lane-heavy-race');
  });

  it('★アイコンが一部失敗は異常にしない(相手側の404は正常)', () => {
    const partial = buildSymptomVerdicts({
      avatarLoadDiag: { usericonFailed: 1, usericonSucceeded: 3 }
    });
    expect(partial.map((x) => x.id)).not.toContain('avatar-all-failed');
    const allFail = buildSymptomVerdicts({
      avatarLoadDiag: { usericonFailed: 4, usericonSucceeded: 0 }
    });
    expect(allFail.map((x) => x.id)).toContain('avatar-all-failed');
  });

  it('診断が重いは秒で言う', () => {
    const v = buildSymptomVerdicts({ updateMs: 16437 });
    expect(v[0].line).toContain('16.4秒');
  });

  it('★異常が無ければ何も出さない(正常時に1行も足さない)', () => {
    expect(buildSymptomVerdicts({})).toHaveLength(0);
    expect(formatSymptomVerdictsBlock([])).toBe('');
    expect(formatSymptomVerdictsBlock(null)).toBe('');
  });

  it('重い順(bad→warn)に並ぶ', () => {
    const v = buildSymptomVerdicts({
      laneRenderProbe: { started: 3, domTilesPainted: 5, heavySettleState: 'race' },
      identityAcquisition: { identifiable: 2, withThumb: 0 }
    });
    expect(v[0].level).toBe('bad');
  });

  it('壊れた入力でも落ちない', () => {
    expect(() => buildSymptomVerdicts(null)).not.toThrow();
    expect(() => buildSymptomVerdicts({ identityAcquisition: 'x', laneRenderProbe: 9 })).not.toThrow();
  });
});
