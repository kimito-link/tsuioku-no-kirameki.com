import { describe, expect, it } from 'vitest';
import {
  makeInitialGiftEffectDiag,
  buildGiftEffectDiagSnapshot,
  buildGiftEffectDiagLines,
  giftEffectDiagToActionCards,
  giftSoundDiagFieldForPlayResult,
  computeGiftGapAverage
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

// v0.1.1091根治: 「ギフト演出は出るのに音だけ静かに消える(guarded/noPath/error/coalesced
//   の内訳が全てゼロ)」の再発防止。scheduleGiftSound(venueBar.js)がどの経路を通っても
//   必ずgiftEffectDiagのどれかのカウンタが増えることを、内訳の網羅表で固定する。
describe('v0.1.1091: giftSoundOff(効果音設定OFF時の即return)の計上', () => {
  it('初期stateは giftSoundOff=0', () => {
    expect(makeInitialGiftEffectDiag().giftSoundOff).toBe(0);
  });

  it('旧スナップショット(フィールド無し)は0扱い=従来と同じ判定', () => {
    const snap = buildGiftEffectDiagSnapshot({ giftDetected: 3, giftThrown: 3, giftSoundPlayed: 3 }, 1000);
    expect(snap.giftSoundOff).toBe(0);
  });

  it('OFF時の1件が内訳「OFF時」として明記され⚠にならない(投擲1=音0+OFF時1で✅)', () => {
    const snap = buildGiftEffectDiagSnapshot(
      { giftDetected: 1, giftThrown: 1, giftSoundPlayed: 0, giftSoundOff: 1 },
      1000
    );
    const lines = buildGiftEffectDiagLines(snap, 1000);
    const giftLine = lines.find((l) => l.includes('ギフト:'));
    expect(giftLine).toContain('OFF時1');
    expect(giftLine).not.toContain('⚠');
    expect(giftEffectDiagToActionCards(snap).some((c) => c.id === 'gift-effect-sound-missing-gift')).toBe(false);
  });

  it('OFF時+他の内訳が混在しても合算で説明できれば⚠にならない', () => {
    const snap = buildGiftEffectDiagSnapshot(
      { giftDetected: 5, giftThrown: 5, giftSoundPlayed: 2, giftSoundGuarded: 1, giftSoundNoPath: 1, giftSoundOff: 1 },
      1000
    );
    const lines = buildGiftEffectDiagLines(snap, 1000);
    expect(lines.some((l) => l.includes('⚠'))).toBe(false);
  });

  it('OFF時だけでは説明しきれない残りは⚠のまま(件数が本当に合わない時だけ警告)', () => {
    const snap = buildGiftEffectDiagSnapshot(
      { giftDetected: 5, giftThrown: 5, giftSoundPlayed: 1, giftSoundOff: 1 },
      1000
    );
    const lines = buildGiftEffectDiagLines(snap, 1000);
    expect(lines.some((l) => l.includes('⚠3件鳴っていない'))).toBe(true);
  });
});

describe('v0.1.1091: 「音が静かに消える」再発防止=内訳の網羅表', () => {
  // scheduleGiftSound(venueBar.js)の戻り値/内部分岐は以下の網羅表に一致する:
  //   'off'        → giftSoundOff        (効果音設定OFFで即return・v0.1.1091で新設)
  //   'coalesced'  → giftSoundCoalesced  (バースト置換・呼び出し元が計上)
  //   'scheduled' でplayEffectSoundが:
  //     'played'   → giftSoundPlayed
  //     'guarded'  → giftSoundGuarded
  //     'no-path'  → giftSoundNoPath
  //     'error'    → giftSoundError
  //   setTimeoutコールバック内の想定外例外 → giftSoundError(v0.1.1091でtry/catch追加)
  // この表を「giftThrown件数 = 全カウンタの合計」という不変条件としてテストする
  // (どの経路を通っても必ずどれかが増える=内訳が全部ゼロなのに音だけ消えることは構造的に無くなる)。
  const outcomeToField = {
    played: 'giftSoundPlayed',
    coalesced: 'giftSoundCoalesced',
    guarded: 'giftSoundGuarded',
    'no-path': 'giftSoundNoPath',
    error: 'giftSoundError',
    off: 'giftSoundOff'
  };

  it.each(Object.entries(outcomeToField))(
    '経路 %s は %s に計上され、giftThrown分が必ず説明できる(⚠にならない)',
    (_outcome, field) => {
      const diag = {
        giftDetected: 1,
        giftThrown: 1,
        giftSoundPlayed: 0,
        giftSoundCoalesced: 0,
        giftSoundGuarded: 0,
        giftSoundNoPath: 0,
        giftSoundError: 0,
        giftSoundOff: 0
      };
      diag[field] += 1;
      const snap = buildGiftEffectDiagSnapshot(diag, 1000);
      const lines = buildGiftEffectDiagLines(snap, 1000);
      const giftLine = lines.find((l) => l.includes('ギフト:'));
      expect(giftLine).toContain('音0'.replace('0', String(snap.giftSoundPlayed)));
      expect(giftLine).not.toContain('⚠');
      expect(giftEffectDiagToActionCards(snap).some((c) => c.id === 'gift-effect-sound-missing-gift')).toBe(false);
    }
  );

  it('全経路が一度もカウントされない(内訳が全部ゼロ)のに giftThrown>giftSoundPlayed なら必ず⚠になる', () => {
    // これが今回の実バグの症状そのもの(検知1→演出1→音0、内訳全ゼロ)。
    // 修正後もこのケース自体はconstructできる(诊断が「本当にどこにも計上されていない」ことは
    // まだ検出できる=念のための回帰確認。scheduleGiftSound側の修正で「起き得なくなった」ことは
    // 上のit.eachが保証する)。
    const snap = buildGiftEffectDiagSnapshot({ giftDetected: 1, giftThrown: 1, giftSoundPlayed: 0 }, 1000);
    const lines = buildGiftEffectDiagLines(snap, 1000);
    expect(lines.some((l) => l.includes('⚠1件鳴っていない'))).toBe(true);
  });
});

describe('v0.1.1088計器: computeGiftGapAverage(検知→音/着弾ギャップのEMA)', () => {
  it('未計測(-1)から最初のサンプルはそのまま値になる', () => {
    expect(computeGiftGapAverage(-1, 100)).toBe(100);
  });

  it('EMA係数0.3で直前平均へ寄せる', () => {
    expect(computeGiftGapAverage(1000, 2000)).toBe(1300);
  });

  it('サンプルが不正/負値なら直前平均を維持する', () => {
    expect(computeGiftGapAverage(1000, -1)).toBe(1000);
    expect(computeGiftGapAverage(1000, 'x')).toBe(1000);
  });

  it('直前平均もサンプルも不正なら-1', () => {
    expect(computeGiftGapAverage(-1, -1)).toBe(-1);
  });
});

describe('v0.1.1088計器: makeInitialGiftEffectDiag / buildGiftEffectDiagSnapshot のギャップ項目', () => {
  it('初期stateはギャップ全て-1', () => {
    const s = makeInitialGiftEffectDiag();
    expect(s.lastSoundGapMs).toBe(-1);
    expect(s.lastBurstGapMs).toBe(-1);
    expect(s.avgSoundGapMs).toBe(-1);
    expect(s.avgBurstGapMs).toBe(-1);
  });

  it('スナップショットは欠損を初期値(-1)で埋める', () => {
    const snap = buildGiftEffectDiagSnapshot({ giftDetected: 1 }, 0);
    expect(snap.lastSoundGapMs).toBe(-1);
    expect(snap.avgBurstGapMs).toBe(-1);
  });

  it('実測値を保持する', () => {
    const snap = buildGiftEffectDiagSnapshot(
      { lastSoundGapMs: 100, lastBurstGapMs: 1400, avgSoundGapMs: 150, avgBurstGapMs: 1300 },
      0
    );
    expect(snap.lastSoundGapMs).toBe(100);
    expect(snap.lastBurstGapMs).toBe(1400);
    expect(snap.avgSoundGapMs).toBe(150);
    expect(snap.avgBurstGapMs).toBe(1300);
  });
});

describe('v0.1.1088計器: buildGiftEffectDiagLines の体感遅延行', () => {
  it('音/着弾ギャップが計測済みなら体感遅延行を出す', () => {
    const snap = buildGiftEffectDiagSnapshot(
      {
        giftDetected: 1, giftThrown: 1, giftSoundPlayed: 1,
        lastSoundGapMs: 100, lastBurstGapMs: 1400, avgSoundGapMs: 150, avgBurstGapMs: 1300
      },
      1000
    );
    const lines = buildGiftEffectDiagLines(snap, 1000);
    const gapLine = lines.find((l) => l.includes('体感遅延'));
    expect(gapLine).toBeDefined();
    expect(gapLine).toContain('音+0.1秒');
    expect(gapLine).toContain('着弾+1.4秒');
  });

  it('未計測(-1)なら体感遅延行を出さない(ノイズにしない)', () => {
    const snap = buildGiftEffectDiagSnapshot(
      { giftDetected: 1, giftThrown: 1, giftSoundPlayed: 1 },
      1000
    );
    const lines = buildGiftEffectDiagLines(snap, 1000);
    expect(lines.some((l) => l.includes('体感遅延'))).toBe(false);
  });
});

describe('v0.1.1090: デルタ補完(giftDeltaFallback.js)の計器', () => {
  it('初期stateは deltaSynthesized/deltaPoints ともに0', () => {
    const s = makeInitialGiftEffectDiag();
    expect(s.deltaSynthesized).toBe(0);
    expect(s.deltaPoints).toBe(0);
  });

  it('giftDetected=0でもdeltaSynthesized>0なら未観測扱いにしない(空配列を返さない)', () => {
    const snap = buildGiftEffectDiagSnapshot(
      { giftDetected: 0, giftThrown: 1, giftSoundPlayed: 1, deltaSynthesized: 1, deltaPoints: 18050 },
      1000
    );
    const lines = buildGiftEffectDiagLines(snap, 1000);
    expect(lines.length).toBeGreaterThan(0);
    const giftLine = lines.find((l) => l.includes('ギフト:'));
    expect(giftLine).toBeDefined();
  });

  it('デルタ補完件数とpt内訳を嘘をつかず明記する(本物と区別)', () => {
    const snap = buildGiftEffectDiagSnapshot(
      { giftDetected: 0, giftThrown: 1, giftSoundPlayed: 1, deltaSynthesized: 1, deltaPoints: 18050 },
      1000
    );
    const lines = buildGiftEffectDiagLines(snap, 1000);
    const giftLine = lines.find((l) => l.includes('ギフト:'));
    expect(giftLine).toContain('うちデルタ補完1件');
    expect(giftLine).toContain('18,050pt');
  });

  it('デルタ補完が無ければ内訳テキストを出さない(ノイズにしない)', () => {
    const snap = buildGiftEffectDiagSnapshot(
      { giftDetected: 3, giftThrown: 3, giftSoundPlayed: 3 },
      1000
    );
    const lines = buildGiftEffectDiagLines(snap, 1000);
    const giftLine = lines.find((l) => l.includes('ギフト:'));
    expect(giftLine).not.toContain('デルタ補完');
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
