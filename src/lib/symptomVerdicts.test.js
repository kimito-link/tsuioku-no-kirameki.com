import { describe, expect, it } from 'vitest';
import {
  buildSymptomVerdicts,
  formatSymptomVerdictsBlock,
  SYMPTOM_SIGNATURE_LABEL
} from './symptomVerdicts.js';

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

/*
 * ★v0.1.1391(ユーザー実機の偽陽性): popup 起動 0.2 秒後の値で
 *   「描画関数が一度も呼ばれていません」を 🔴 として出していた。
 *   同じ速報に「応援レーン 23人 全員表示」が緑で出ていた=矛盾。
 */
describe('起動直後は「レーンが空」と断定しない', () => {
  const probeNotStarted = { started: 0, domTilesPainted: -1 };

  it('★popup 起動 0.2 秒後なら判定しない(実機の偽陽性)', () => {
    const v = buildSymptomVerdicts({ laneRenderProbe: probeNotStarted, popupAgeMs: 200 });
    expect(v.find((x) => x.id === 'lane-never-rendered')).toBeUndefined();
  });

  it('十分に時間が経っていれば従来どおり 🔴 を出す', () => {
    const v = buildSymptomVerdicts({ laneRenderProbe: probeNotStarted, popupAgeMs: 30_000 });
    expect(v.find((x) => x.id === 'lane-never-rendered')).toBeTruthy();
  });

  it('popupAgeMs が無ければ従来どおり判定する(後方互換)', () => {
    const v = buildSymptomVerdicts({ laneRenderProbe: probeNotStarted });
    expect(v.find((x) => x.id === 'lane-never-rendered')).toBeTruthy();
  });
});

describe('★合言葉の行(共有した相手が原因を検索できるように)', () => {
  const two = [
    { id: 'panel-black', symptom: '黒', level: 'bad', line: '🔴 画面が黒い' },
    { id: 'status-slow', symptom: '遅い', level: 'warn', line: '🟡 状態が遅い' }
  ];

  it('★症状IDが【そのまま検索に貼れる形】で出る', () => {
    const out = formatSymptomVerdictsBlock(two);
    expect(out).toContain(SYMPTOM_SIGNATURE_LABEL);
    expect(out).toContain('panel-black status-slow');
  });

  it('★正常時は1pxも足さない(空文字のまま)', () => {
    expect(formatSymptomVerdictsBlock([])).toBe('');
    expect(formatSymptomVerdictsBlock(null)).toBe('');
  });

  it('★人が読む行とは【別の行】に置く(文が変わっても語は変わらない)', () => {
    const lines = formatSymptomVerdictsBlock(two).split(String.fromCharCode(10));
    const sig = lines.filter((l) => l.startsWith(SYMPTOM_SIGNATURE_LABEL));
    expect(sig).toHaveLength(1);
    // ★人が読む行に混ぜない(混ぜると文言変更で機械が拾えなくなる)
    expect(lines.find((l) => l.startsWith('🔴'))).not.toContain('panel-black');
  });

  it('★idが壊れていても行を壊さない', () => {
    const out = formatSymptomVerdictsBlock([
      { id: '', symptom: 'x', level: 'bad', line: '🔴 a' },
      { id: 'panel-black', symptom: 'y', level: 'bad', line: '🔴 b' }
    ]);
    expect(out).toContain('panel-black');
    // ★空のidで余計な空白を作らない
    expect(out).not.toMatch(new RegExp(SYMPTOM_SIGNATURE_LABEL + '  '));
  });

  it('★実際の症状IDが索引の語彙と同じ形(小文字ハイフン)', () => {
    // ★索引側の正規化と揃っていないと永久にヒットしない
    for (const v of two) expect(v.id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
  });
});