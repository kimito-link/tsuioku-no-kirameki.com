import { describe, expect, it } from 'vitest';
import {
  makeInitialGiftEffectDiag,
  buildGiftEffectDiagSnapshot,
  buildGiftEffectDiagLines,
  giftEffectDiagToActionCards,
  giftSoundDiagFieldForPlayResult
} from './giftEffectDiag.js';

describe('makeInitialGiftEffectDiag', () => {
  it('全カウンタ0・soundEnabled trueの初期値', () => {
    const s = makeInitialGiftEffectDiag();
    expect(s.giftDetected).toBe(0);
    expect(s.soundEnabled).toBe(true);
  });
});

describe('buildGiftEffectDiagSnapshot', () => {
  it('欠損フィールドは初期値で埋める', () => {
    const snap = buildGiftEffectDiagSnapshot({ giftDetected: 5 }, 1000);
    expect(snap.giftDetected).toBe(5);
    expect(snap.giftThrown).toBe(0);
    expect(snap.capturedAt).toBe(1000);
  });

  it('soundEnabled は false のときだけ false', () => {
    expect(buildGiftEffectDiagSnapshot({ soundEnabled: false }, 1).soundEnabled).toBe(false);
    expect(buildGiftEffectDiagSnapshot({ soundEnabled: true }, 1).soundEnabled).toBe(true);
    expect(buildGiftEffectDiagSnapshot({}, 1).soundEnabled).toBe(true);
  });
});

describe('buildGiftEffectDiagLines', () => {
  it('未観測(検知0件)なら空配列(ノイズにしない)', () => {
    expect(buildGiftEffectDiagLines(makeInitialGiftEffectDiag(), 1000)).toEqual([]);
  });

  it('null/undefined も空配列', () => {
    expect(buildGiftEffectDiagLines(null, 1000)).toEqual([]);
  });

  it('全て一致していれば✅のみ', () => {
    const snap = buildGiftEffectDiagSnapshot(
      { giftDetected: 3, giftThrown: 3, giftSoundPlayed: 3, lastEventAt: 500 },
      1500
    );
    const lines = buildGiftEffectDiagLines(snap, 1500);
    expect(lines.some((l) => l.includes('検知3 → 演出3 ✅ → 音3 ✅'))).toBe(true);
  });

  it('演出漏れがあれば⚠件数を明記', () => {
    const snap = buildGiftEffectDiagSnapshot({ giftDetected: 5, giftThrown: 3, giftSoundPlayed: 3 }, 1000);
    const lines = buildGiftEffectDiagLines(snap, 1000);
    expect(lines.some((l) => l.includes('⚠2件飛んでいない'))).toBe(true);
  });

  it('音漏れがあれば⚠件数を明記', () => {
    const snap = buildGiftEffectDiagSnapshot({ giftDetected: 5, giftThrown: 5, giftSoundPlayed: 2 }, 1000);
    const lines = buildGiftEffectDiagLines(snap, 1000);
    expect(lines.some((l) => l.includes('⚠3件鳴っていない'))).toBe(true);
  });

  it('効果音OFFなら音が0件でも警告にしない(誤診断防止)', () => {
    const snap = buildGiftEffectDiagSnapshot(
      { giftDetected: 5, giftThrown: 5, giftSoundPlayed: 0, soundEnabled: false },
      1000
    );
    const lines = buildGiftEffectDiagLines(snap, 1000);
    const giftLine = lines.find((l) => l.includes('ギフト:'));
    expect(giftLine).toContain('(OFF)');
    expect(giftLine).not.toContain('⚠');
  });

  it('広告のみ検知されていればギフト行は出ない', () => {
    const snap = buildGiftEffectDiagSnapshot({ adDetected: 2, adThrown: 2, adSoundPlayed: 2 }, 1000);
    const lines = buildGiftEffectDiagLines(snap, 1000);
    expect(lines.some((l) => l.includes('ギフト:'))).toBe(false);
    expect(lines.some((l) => l.includes('広告:'))).toBe(true);
  });
});

describe('giftEffectDiagToActionCards', () => {
  it('取りこぼし無しならカード無し', () => {
    const snap = buildGiftEffectDiagSnapshot({ giftDetected: 3, giftThrown: 3, giftSoundPlayed: 3 }, 1000);
    expect(giftEffectDiagToActionCards(snap)).toEqual([]);
  });

  it('演出漏れがあればカードを出す', () => {
    const snap = buildGiftEffectDiagSnapshot({ giftDetected: 5, giftThrown: 3, giftSoundPlayed: 3 }, 1000);
    const cards = giftEffectDiagToActionCards(snap);
    expect(cards.some((c) => c.id === 'gift-effect-throw-missing-gift')).toBe(true);
  });

  it('効果音OFF時は音漏れカードを出さない', () => {
    const snap = buildGiftEffectDiagSnapshot(
      { giftDetected: 5, giftThrown: 5, giftSoundPlayed: 0, soundEnabled: false },
      1000
    );
    const cards = giftEffectDiagToActionCards(snap);
    expect(cards.some((c) => c.id === 'gift-effect-sound-missing-gift')).toBe(false);
  });

  it('null は空配列', () => {
    expect(giftEffectDiagToActionCards(null)).toEqual([]);
  });
});

describe('v0.1.1061: バースト置換(giftSoundCoalesced)の勘定', () => {
  it('初期stateは giftSoundCoalesced=0', () => {
    expect(makeInitialGiftEffectDiag().giftSoundCoalesced).toBe(0);
  });

  it('旧スナップショット(フィールド無し)は0扱い=従来と同じ判定', () => {
    const snap = buildGiftEffectDiagSnapshot({ giftDetected: 3, giftThrown: 3, giftSoundPlayed: 3 }, 1000);
    expect(snap.giftSoundCoalesced).toBe(0);
    const lines = buildGiftEffectDiagLines(snap, 1000);
    expect(lines.some((l) => l.includes('音3 ✅'))).toBe(true);
  });

  it('置換された分は「鳴っていない」と誤診断しない(投擲5=音1+置換4で✅)', () => {
    const snap = buildGiftEffectDiagSnapshot(
      { giftDetected: 5, giftThrown: 5, giftSoundPlayed: 1, giftSoundCoalesced: 4 },
      1000
    );
    const lines = buildGiftEffectDiagLines(snap, 1000);
    const giftLine = lines.find((l) => l.includes('ギフト:'));
    expect(giftLine).toContain('音1(+置換4) ✅');
    expect(giftLine).not.toContain('⚠');
    expect(giftEffectDiagToActionCards(snap).some((c) => c.id === 'gift-effect-sound-missing-gift')).toBe(false);
  });

  it('置換を差し引いても足りない分だけ⚠にする(投擲5=音1+置換2→⚠2件)', () => {
    const snap = buildGiftEffectDiagSnapshot(
      { giftDetected: 5, giftThrown: 5, giftSoundPlayed: 1, giftSoundCoalesced: 2 },
      1000
    );
    const lines = buildGiftEffectDiagLines(snap, 1000);
    expect(lines.some((l) => l.includes('⚠2件鳴っていない'))).toBe(true);
    expect(giftEffectDiagToActionCards(snap).some((c) => c.id === 'gift-effect-sound-missing-gift')).toBe(true);
  });
});

// 修正3: guarded(同種600msガード)/noPath(未割当)/error(再生失敗)の内訳で
//   「⚠N件鳴っていない」の内訳不明を解消する。
describe('修正3: giftSoundDiagFieldForPlayResult', () => {
  it('guarded/no-path/error をそれぞれのフィールド名に変換する', () => {
    expect(giftSoundDiagFieldForPlayResult('guarded')).toBe('giftSoundGuarded');
    expect(giftSoundDiagFieldForPlayResult('no-path')).toBe('giftSoundNoPath');
    expect(giftSoundDiagFieldForPlayResult('error')).toBe('giftSoundError');
  });
  it('played/未知の値はnull(呼び出し側が別枠で扱う・数えない)', () => {
    expect(giftSoundDiagFieldForPlayResult('played')).toBeNull();
    expect(giftSoundDiagFieldForPlayResult('unknown')).toBeNull();
    expect(giftSoundDiagFieldForPlayResult(undefined)).toBeNull();
  });
});

describe('修正3: guarded/noPath/errorの内訳で取りこぼしを説明する', () => {
  it('初期stateは3フィールドとも0', () => {
    const s = makeInitialGiftEffectDiag();
    expect(s.giftSoundGuarded).toBe(0);
    expect(s.giftSoundNoPath).toBe(0);
    expect(s.giftSoundError).toBe(0);
  });

  it('ガード4件で説明できれば⚠にせず内訳「ガード4」を表示する(投擲27=音27相当のケース)', () => {
    // ユーザー報告の症状: 検知48→演出48→音27(+置換17)⚠4件鳴っていない、を再現。
    //   27+17+4=48で内訳が揃う=ガードの4件が原因と特定できるケース。
    const snap = buildGiftEffectDiagSnapshot(
      { giftDetected: 48, giftThrown: 48, giftSoundPlayed: 27, giftSoundCoalesced: 17, giftSoundGuarded: 4 },
      1000
    );
    const lines = buildGiftEffectDiagLines(snap, 1000);
    const giftLine = lines.find((l) => l.includes('ギフト:'));
    expect(giftLine).toContain('音27(+置換17) ✅');
    expect(giftLine).toContain('ガード4');
    expect(giftLine).not.toContain('⚠');
    expect(giftEffectDiagToActionCards(snap).some((c) => c.id === 'gift-effect-sound-missing-gift')).toBe(false);
  });

  it('noPath/errorも内訳として明記される', () => {
    const snap = buildGiftEffectDiagSnapshot(
      { giftDetected: 10, giftThrown: 10, giftSoundPlayed: 7, giftSoundNoPath: 2, giftSoundError: 1 },
      1000
    );
    const lines = buildGiftEffectDiagLines(snap, 1000);
    const giftLine = lines.find((l) => l.includes('ギフト:'));
    expect(giftLine).toContain('未割当2');
    expect(giftLine).toContain('エラー1');
    expect(giftLine).not.toContain('⚠');
  });

  it('内訳で説明できない残りがあれば⚠は消えない(件数が本当に合わない時だけ警告)', () => {
    // 検知/演出10・音5・ガード2 → 説明できるのは5+2=7、残り3件は不明=⚠のまま。
    const snap = buildGiftEffectDiagSnapshot(
      { giftDetected: 10, giftThrown: 10, giftSoundPlayed: 5, giftSoundGuarded: 2 },
      1000
    );
    const lines = buildGiftEffectDiagLines(snap, 1000);
    expect(lines.some((l) => l.includes('⚠3件鳴っていない'))).toBe(true);
  });
});
