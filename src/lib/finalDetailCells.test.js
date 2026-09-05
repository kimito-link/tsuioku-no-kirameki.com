/**
 * finalDetailCells.test.js — 最終弾セルの判定。
 *
 * ★最重要: 匿名にサムネ/名前は【原理的に無い】(掟2)。
 *   匿名を分母に入れると「取れていない」と嘘をつき、
 *   匿名主体の配信で毎回赤くなる=誤誘導=価値が負。
 */
import { describe, it, expect } from 'vitest';
import { buildFinalDetailCells } from './finalDetailCells.js';

/** @param {any} data @param {string} id */
function cellOf(data, id) {
  return buildFinalDetailCells(data).find((c) => c.id === id);
}

/** @param {any} ia @param {string} id */
function idCell(ia, id) {
  return cellOf({ popupDiag: { popup: { identityAcquisition: ia } } }, id);
}

describe('最終弾のセル', () => {
  describe('人の識別', () => {
    it('★匿名が多くても異常にしない(仕様=掟2)', () => {
      const c = idCell({ total: 100, anonymous: 90, identifiable: 10 }, 'identity-anon');
      expect(c?.level).toBe('ok');
      expect(c?.text).toContain('仕様');
    });

    it('★分母は識別可能な人だけ(匿名を混ぜない)', () => {
      // 100人中90人が匿名。識別可能10人のうち8人は名前が取れている
      const c = idCell({
        total: 100, anonymous: 90, identifiable: 10, withName: 8, namePercent: 80, missingName: 2
      }, 'identity-name');
      // 匿名を分母にすると 8/100=8% で赤になるが、正しくは 80% で緑
      expect(c?.level).toBe('ok');
      expect(c?.text).toContain('80%');
    });

    it('識別可能な人の取得率が低ければ bad', () => {
      const c = idCell({
        total: 20, anonymous: 0, identifiable: 20, withThumb: 2, thumbPercent: 10, missingThumb: 18
      }, 'identity-thumb');
      expect(c?.level).toBe('bad');
    });

    it('観測が無ければ na', () => {
      expect(idCell(null, 'identity-name')?.level).toBe('na');
    });
  });

  describe('操作音(op-sound)', () => {
    it('★押したのに鳴らなければ warn', () => {
      const c = cellOf({
        opSoundEffectDiag: { handlePressed: 10, handleFired: 4, soundEnabled: true }
      }, 'op-sound');
      expect(c?.level).toBe('warn');
      expect(c?.text).toContain('鳴りませんでした');
    });

    it('★設定でOFFなら na(仕様=掟2)', () => {
      const c = cellOf({
        opSoundEffectDiag: { handlePressed: 10, handleFired: 0, soundEnabled: false }
      }, 'op-sound');
      expect(c?.level).toBe('na');
    });

    it('全部鳴っていれば ok', () => {
      const c = cellOf({
        opSoundEffectDiag: { handlePressed: 5, handleFired: 5, soundEnabled: true }
      }, 'op-sound');
      expect(c?.level).toBe('ok');
    });
  });

  describe('BGM(bgm-phase)', () => {
    it('★使っていなければ na(死にセルで埋めない)', () => {
      const c = cellOf({ bgmPhaseDiag: { bgmEnabled: false } }, 'bgm-phase');
      expect(c?.level).toBe('na');
    });

    it('★状態の記録は異常にしない', () => {
      const c = cellOf({
        bgmPhaseDiag: { bgmEnabled: true, phase: 'fever', reachCount: 3, jackpotCount: 1 }
      }, 'bgm-phase');
      expect(c?.level).toBe('ok');
      expect(c?.text).toContain('フィーバー');
    });
  });

  describe('受信から保存まで(ndgr-persist)', () => {
    it('★取れているのに保存されていなければ bad', () => {
      const c = cellOf({
        fastDiag: { content: { giftDiagnostics: { commentObservability: {
          ndgrChatToPersistRatio: { decodedChats: 100, ndgrPersistedRows: 10, ratioPercent: 10 }
        } } } }
      }, 'ndgr-persist');
      expect(c?.level).toBe('bad');
    });

    it('ほぼ保存できていれば ok', () => {
      const c = cellOf({
        fastDiag: { content: { giftDiagnostics: { commentObservability: {
          ndgrChatToPersistRatio: { decodedChats: 100, ndgrPersistedRows: 98, ratioPercent: 98 }
        } } } }
      }, 'ndgr-persist');
      expect(c?.level).toBe('ok');
    });
  });

  describe('あとから人を辿れる記録(uid-detail)', () => {
    it('★低くても異常にしない(匿名主体なら当然=掟2)', () => {
      const c = cellOf({
        fastDiag: { content: { giftDiagnostics: { commentObservability: {
          savedCommentsUidStats: { totalSaved: 100, withUid: 5 }
        } } } }
      }, 'uid-detail');
      expect(c?.level).toBe('ok');
      // 事実は隠さない
      expect(c?.text).toContain('5%');
      expect(c?.text).toContain('匿名が多い');
    });
  });

  describe('複数タブの混線(multi-tab)', () => {
    it('★混線の疑いがあれば warn + 次の一手', () => {
      const c = cellOf({
        fastDiag: { content: { giftDiagnostics: {
          multiTabDiag: { eventDomLvCount: 3, staleDomBundleSuspected: true }
        } } }
      }, 'multi-tab');
      expect(c?.level).toBe('warn');
      expect(c?.text).toContain('閉じて');
    });

    it('★複数開いていても混線が無ければ ok', () => {
      const c = cellOf({
        fastDiag: { content: { giftDiagnostics: {
          multiTabDiag: { eventDomLvCount: 3, staleDomBundleSuspected: false }
        } } }
      }, 'multi-tab');
      expect(c?.level).toBe('ok');
    });
  });

  it('★全セルが常に出る(消えない=掟5)', () => {
    const ids = buildFinalDetailCells({}).map((c) => c.id).sort();
    expect(ids).toEqual([
      'bgm-phase', 'identity-anon', 'identity-complete', 'identity-name', 'identity-thumb',
      'multi-tab', 'ndgr-persist', 'op-sound', 'uid-detail'
    ]);
  });
});
