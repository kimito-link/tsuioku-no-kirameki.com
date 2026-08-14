/**
 * ★v0.1.1390: ユーザー要望の特化セル5種が【実際に画面用の配列に出る】ことを固定する。
 *
 * ■ なぜ要るか
 *   registry に登録しただけ / lib を作っただけでは画面に出ない、という片肺を
 *   この1日で何度も作った([[unwired-judgement-is-systemic-2026-08-12]])。
 *   ここでは「実データに近い入力を渡して buildHealthCells の出力に現れるか」を見る。
 *   ★入力は 2026-08-14 のユーザー実機速報の数字をそのまま使う。
 */
import { describe, it, expect } from 'vitest';
import { buildHealthCells } from './healthCells.js';
import { groupHealthCells } from './healthCellGroups.js';
import { DIAGNOSIS_BY_ID } from './diagnosisRegistry.js';

/** ユーザー実機(2026-08-14 lv351172444)に近い入力。 */
function realisticInput() {
  return {
    livesData: [{ recording: true, liveId: 'lv351172444' }],
    nowMs: Date.now(),
    // 声だけ遅れている状態(個別には両方「正常」に見える)
    voiceDiag: { enabled: true, spokenTotal: 12, lastE2eMs: 6000, staleDropTotal: 6 },
    instantPushDiag: { lastGapMs: 5, avgGapMs: 451 },
    commentPostDiag: { attempts: 2, okCount: 1, failCount: 0, timeoutCount: 0 },
    // 会場: 鏡が656秒古い + ギフトは来ているのに段が0
    venueOpen: true,
    venueMirrorAgeMs: 656_000,
    venueTiers: { link: 7, gift: 0, ad: 4, konta: 0, tanu: 332 },
    venueHasGiftData: true,
    // ギフト履歴が1時間「取得中」のまま
    liveElapsedMs: 63 * 60 * 1000,
    giftEffectDiag: { detected: 8, played: 8, sound: 7 },
    mainThreadBlocker: { count: 3, worstMs: 1806, worstName: 'grid-rebuild' },
    fastDiag: { content: { giftDiagnostics: { '北極星レーン': {
      '1_貢献度ランキング': { state: 'ok', apiRows: 31 },
      '+α_広告ランキング': { state: 'ok', apiRows: 7 },
      '2_ギフト履歴': { state: 'iframe_unrendered', count: 0 }
    } } } }
  };
}

const NEW_CELLS = [
  'voice-bubble-parity',
  'comment-post',
  'venue-mode',
  'gift-ad-pipeline',
  'main-thread'
];

describe('特化セル5種の配線(実データに近い入力)', () => {
  const cells = buildHealthCells(realisticInput());
  const byId = new Map(cells.map((c) => [c.id, c]));

  for (const id of NEW_CELLS) {
    it(`★${id} が画面用のセルに出る`, () => {
      expect(byId.has(id), `${id} が buildHealthCells の出力に無い`).toBe(true);
    });
    it(`${id} が diagnosisRegistry に登録されている`, () => {
      expect(DIAGNOSIS_BY_ID[id], `${id} が registry 未登録=完全性スコアから黙って外れる`).toBeTruthy();
    });
  }

  it('★声だけ遅れている状態を検知する(両方individually正常でも)', () => {
    expect(byId.get('voice-bubble-parity').level).toBe('bad');
  });

  it('★656秒前の鏡を「古い」と判定する(実機の会場の症状)', () => {
    expect(byId.get('venue-mode').level).toBe('warn');
  });

  it('★1時間「取得中」のギフト履歴を詰まりとして出す', () => {
    expect(byId.get('gift-ad-pipeline').level).toBe('warn');
  });

  it('★メインスレッドを止めた当人を名指しする(黒くなる件)', () => {
    expect(byId.get('main-thread').text).toContain('grid-rebuild');
    expect(byId.get('main-thread').level).toBe('bad');
  });

  it('★5セルが枠に振り分けられる(その他へ落ちない)', () => {
    const groups = groupHealthCells(cells);
    const other = groups.find((g) => g.id === 'other');
    const strayIds = other ? other.cells.map((c) => c.id) : [];
    for (const id of NEW_CELLS) expect(strayIds).not.toContain(id);
  });

  it('未観測なら出さない(使っていない機能を赤くしない)', () => {
    const empty = buildHealthCells({ livesData: [], nowMs: Date.now() });
    const ids = empty.map((c) => c.id);
    expect(ids).not.toContain('comment-post');
    expect(ids).not.toContain('venue-mode');
    expect(ids).not.toContain('main-thread');
  });
});
