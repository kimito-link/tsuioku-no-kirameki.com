/**
 * silentFailureCells.test.js — 「無音で死ぬ」セルが【正しい判定を出すか】。
 *
 * ★なぜ instrumentCoverage.test.js とは別に要るか(会議 critic の指摘)
 *   v0.1.1402 のカバレッジゲートは **「登録＝表示」しか守らない**。
 *   セルが画面に出ることは保証するが、**出た内容が正しいかは見ていない**。
 *   ＝ ゲート緑=正しい計器、という新しい嘘が生まれる。
 *   誤誘導は価値が **負**(ユーザー確定の基準)なので、両方向を断言する。
 *
 * ★両方向を必ず見る([[cumulative-value-shown-as-current-state-2026-08-12]]):
 *   異常時に出る = だけでは不十分。**正常時に警告が居座らない**ことも見る。
 */
import { describe, it, expect } from 'vitest';
import { buildSilentFailureCells } from './silentFailureCells.js';

/** @param {any} data @param {string} id */
function cellOf(data, id) {
  return buildSilentFailureCells(data).find((c) => c.id === id);
}

describe('無音で死ぬ故障のセル', () => {
  describe('マイ効果音の保管庫(custom-sound-db)', () => {
    it('★DBが開けないと bad(従来は "-" で無言だった)', () => {
      const c = cellOf({ customSoundDiag: { dbAvailable: false } }, 'custom-sound-db');
      expect(c?.level).toBe('bad');
      // 次の一手が書かれていること(掟6)
      expect(c?.text).toMatch(/シークレット|保存領域/);
    });

    it('★使えていれば ok(正常時に警告を居座らせない)', () => {
      const c = cellOf({
        customSoundDiag: { dbAvailable: true, assignedKeyCount: 38, totalKeyCount: 38, localBundledCount: 90 }
      }, 'custom-sound-db');
      expect(c?.level).toBe('ok');
    });

    it('割当ゼロは warn(鳴る音が決まっていない)', () => {
      const c = cellOf({
        customSoundDiag: { dbAvailable: true, assignedKeyCount: 0, totalKeyCount: 38 }
      }, 'custom-sound-db');
      expect(c?.level).toBe('warn');
    });

    it('★取込0本は異常ではない(同梱音源があるので仕様通り=掟2)', () => {
      const c = cellOf({
        customSoundDiag: { dbAvailable: true, assignedKeyCount: 38, totalKeyCount: 38, blobCount: 0, localBundledCount: 90 }
      }, 'custom-sound-db');
      expect(c?.level).toBe('ok');
    });

    it('観測が無ければ na(消さずに「—」で出す=掟5)', () => {
      const c = cellOf({}, 'custom-sound-db');
      expect(c?.level).toBe('na');
      expect(c?.text).toBe('—');
    });
  });

  describe('読み上げのON失敗(voice-start-fail)', () => {
    it('★失敗があれば bad + 理由の日本語 + 生トークン併記', () => {
      const c = cellOf({
        voiceDiag: { enableFailTotal: 2, lastEnableFailReason: 'refused' }
      }, 'voice-start-fail');
      expect(c?.level).toBe('bad');
      // 生トークンを消さない(grep で追える材料・voiceDiag.js:310 の掟)
      expect(c?.text).toContain('refused');
      // taxonomy 由来の日本語が入る(自作文言でない)
      expect(c?.text.length).toBeGreaterThan('2回失敗: refused'.length);
    });

    it('★失敗ゼロなら ok(正常時に警告を居座らせない)', () => {
      const c = cellOf({ voiceDiag: { enableFailTotal: 0 } }, 'voice-start-fail');
      expect(c?.level).toBe('ok');
    });
  });

  describe('音の再生ブロック(voice-audio-blocked)', () => {
    it('★ブロックがあれば warn + 次の一手(クリックで鳴る)', () => {
      const c = cellOf({ voiceDiag: { audioBlockedTotal: 3 } }, 'voice-audio-blocked');
      expect(c?.level).toBe('warn');
      expect(c?.text).toContain('クリック');
    });

    it('ブロックゼロなら ok', () => {
      const c = cellOf({ voiceDiag: { audioBlockedTotal: 0 } }, 'voice-audio-blocked');
      expect(c?.level).toBe('ok');
    });
  });

  describe('ギフト音の失敗(gift-sound-fail)', () => {
    it('★再生エラーは bad', () => {
      const c = cellOf({ giftEffectDiag: { giftSoundError: 1 } }, 'gift-sound-fail');
      expect(c?.level).toBe('bad');
    });

    it('音源が無いだけなら warn + 次の一手', () => {
      const c = cellOf({ giftEffectDiag: { giftSoundNoPath: 2 } }, 'gift-sound-fail');
      expect(c?.level).toBe('warn');
      expect(c?.text).toContain('設定');
    });

    it('★防御(coalesced/guarded)は異常にしない=掟1', () => {
      const c = cellOf({
        giftEffectDiag: { giftSoundCoalesced: 50, giftSoundGuarded: 30, giftThrowCapGuarded: 99 }
      }, 'gift-sound-fail');
      expect(c?.level).toBe('ok');
    });

    it('★設定でOFFなのは正常(掟2)', () => {
      const c = cellOf({ giftEffectDiag: { soundEnabled: false, giftSoundOff: 12 } }, 'gift-sound-fail');
      expect(c?.level).toBe('ok');
    });
  });

  describe('送信の取り消し(comment-revert)', () => {
    it('★取り消しがあれば bad(送れたように見えて届いていない)', () => {
      const c = cellOf({ commentPostDiag: { revertCount: 1, attempts: 4 } }, 'comment-revert');
      expect(c?.level).toBe('bad');
      expect(c?.text).toContain('届いていません');
    });

    it('取り消しゼロなら ok', () => {
      const c = cellOf({ commentPostDiag: { revertCount: 0, attempts: 4 } }, 'comment-revert');
      expect(c?.level).toBe('ok');
    });
  });

  it('★全セルが常に出る(観測ゼロでも消えない=掟5)', () => {
    const ids = buildSilentFailureCells({}).map((c) => c.id).sort();
    expect(ids).toEqual([
      'comment-revert', 'custom-sound-db', 'gift-sound-fail', 'voice-audio-blocked', 'voice-start-fail'
    ]);
  });
});
