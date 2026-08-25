import { describe, it, expect } from 'vitest';
import {
  CHARA_LIVE_IDS,
  CHARA_LIVE_MEMBERS,
  resolveCharaFloat,
  isCharaBlinking,
  resolveIdleExpression,
  isCharaMouthOpen,
  pickReactingChara,
  detectAddressedChara,
  resolveThinkingLook,
  resolveThinkingTilt,
  resolveCharaLiveLook,
  makeInitialCharaLiveState,
  expireCharaModes,
  triggerCharaReaction,
  triggerCharaAnswer,
  startCharaThinking,
  endCharaThinking,
  buildCharaLiveRenderModel,
  THINKING_TILT_MAX_DEG
} from './charaLiveState.js';

describe('3 キャラの定義', () => {
  it('AGENTS.md §3.2 の 3 体・役割どおり', () => {
    expect(CHARA_LIVE_IDS).toEqual(['rinku', 'konta', 'tanunee']);
    expect(CHARA_LIVE_MEMBERS.map((m) => m.displayName)).toEqual(['りんく', 'こん太', 'たぬ姉']);
    expect(CHARA_LIVE_MEMBERS[2].role).toContain('しっかり者解説');
  });
});

describe('① ふわふわ浮遊', () => {
  it('時間が進むと位置が変わる(止まって見えない)', () => {
    const a = resolveCharaFloat(0, 'rinku');
    const b = resolveCharaFloat(1300, 'rinku');
    expect(a.y).not.toBeCloseTo(b.y, 3);
  });

  it('3 体は同じ時刻でも別の位置にいる(揃って動くと機械に見える)', () => {
    const ys = CHARA_LIVE_IDS.map((id) => resolveCharaFloat(900, id).y);
    expect(new Set(ys.map((y) => y.toFixed(3))).size).toBe(3);
  });

  // ★2026-08-25 に実際に踏んだ回帰:
  //   位相を charaHashUnit だけで決めていたら konta(0.1735) と tanunee(0.1736) が
  //   ほぼ衝突し、2 体が永久に同位相で上下していた。一点の時刻では気づけないので、
  //   「長い時間ずっと近い」ことを検出する形で固定する。
  it('どの 2 体も長時間ずっと同じ動きにならない(位相が衝突していない)', () => {
    const pairs = [
      ['rinku', 'konta'],
      ['rinku', 'tanunee'],
      ['konta', 'tanunee']
    ];
    for (const [a, b] of pairs) {
      let maxGap = 0;
      for (let t = 0; t < 30000; t += 50) {
        const gap = Math.abs(resolveCharaFloat(t, a).y - resolveCharaFloat(t, b).y);
        maxGap = Math.max(maxGap, gap);
      }
      // 同位相だと差はほぼ 0 のまま。十分に離れる瞬間があることを要求する。
      expect(maxGap).toBeGreaterThan(3);
    }
  });

  it('同じ入力なら常に同じ(決定論・Math.random を使っていない)', () => {
    expect(resolveCharaFloat(777, 'konta')).toEqual(resolveCharaFloat(777, 'konta'));
  });

  it('揺れ幅は控えめ(画面を飛び回らない)', () => {
    for (let t = 0; t < 20000; t += 137) {
      const f = resolveCharaFloat(t, 'tanunee', { heatLevel: 1 });
      expect(Math.abs(f.x)).toBeLessThanOrEqual(6);
      expect(Math.abs(f.y)).toBeLessThanOrEqual(9);
      expect(Math.abs(f.rotateDeg)).toBeLessThanOrEqual(3);
      expect(f.scale).toBeGreaterThan(0.98);
      expect(f.scale).toBeLessThan(1.02);
    }
  });

  it('reducedMotion なら完全静止', () => {
    const f = resolveCharaFloat(5000, 'rinku', { reducedMotion: true });
    expect(f).toEqual({ x: 0, y: 0, rotateDeg: 0, scale: 1 });
  });

  it('盛り上がると動きが大きくなる', () => {
    let calm = 0;
    let hot = 0;
    for (let t = 0; t < 12000; t += 61) {
      calm = Math.max(calm, Math.abs(resolveCharaFloat(t, 'rinku', { heatLevel: 0 }).y));
      hot = Math.max(hot, Math.abs(resolveCharaFloat(t, 'rinku', { heatLevel: 1 }).y));
    }
    expect(hot).toBeGreaterThan(calm);
  });
});

describe('② まばたき / 表情のゆらぎ', () => {
  it('たまに瞬くが、ほとんどの時間は開いている', () => {
    let blinks = 0;
    const samples = 4000;
    for (let i = 0; i < samples; i += 1) {
      if (isCharaBlinking(i * 10, 'rinku')) blinks += 1;
    }
    const ratio = blinks / samples;
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(0.12);
  });

  it('3 体が同時に瞬き続けることはない(位相がずれている)', () => {
    let allThree = 0;
    for (let t = 0; t < 60000; t += 10) {
      if (CHARA_LIVE_IDS.every((id) => isCharaBlinking(t, id))) allThree += 1;
    }
    // 完全にゼロとは限らないが、常時同期していないことを確かめる。
    expect(allThree).toBeLessThan(60);
  });

  it('idle 表情は 3 種類を行き来する(能面にならない)', () => {
    const seen = new Set();
    for (let t = 0; t < 400000; t += 1000) {
      seen.add(resolveIdleExpression(t, 'rinku', { heatLevel: 0.4 }));
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
    for (const e of seen) expect(['normal', 'smile', 'half-eyes']).toContain(e);
  });

  it('盛り上がるほど笑顔が増える(会場の空気に連動)', () => {
    const countSmile = (heat) => {
      let n = 0;
      for (let t = 0; t < 400000; t += 500) {
        if (resolveIdleExpression(t, 'konta', { heatLevel: heat }) === 'smile') n += 1;
      }
      return n;
    };
    expect(countSmile(1)).toBeGreaterThan(countSmile(0));
  });
});

describe('③ 口パク', () => {
  it('開閉を繰り返す', () => {
    const seq = [];
    for (let e = 0; e < 1600; e += 40) seq.push(isCharaMouthOpen(e, 'rinku'));
    expect(seq).toContain(true);
    expect(seq).toContain(false);
  });

  it('負の経過時間では開かない(未開始を喋らせない)', () => {
    expect(isCharaMouthOpen(-10, 'rinku')).toBe(false);
  });
});

describe('④ 誰が反応するか', () => {
  it('同じコメントなら常に同じ子(決定論)', () => {
    expect(pickReactingChara('no:1')).toBe(pickReactingChara('no:1'));
  });

  it('直前に喋った子は選ばれない(同じ子が続けて喋らない)', () => {
    for (const last of CHARA_LIVE_IDS) {
      for (let i = 0; i < 60; i += 1) {
        expect(pickReactingChara(`no:${i}`, last)).not.toBe(last);
      }
    }
  });

  it('コメントが変われば担当も散る(1 体に偏らない)', () => {
    const seen = new Set();
    for (let i = 0; i < 60; i += 1) seen.add(pickReactingChara(`no:${i}`));
    expect(seen.size).toBe(3);
  });
});

describe('④ 配信者の呼びかけ(名指しの検出)', () => {
  it('「〇〇さん、〇〇だよね」形式で名指しを拾う', () => {
    expect(detectAddressedChara('りんくさん、今日は楽しいよね')).toBe('rinku');
    expect(detectAddressedChara('こん太さん、それ好きだよね')).toBe('konta');
    expect(detectAddressedChara('たぬ姉さん、詳しいよね')).toBe('tanunee');
  });

  it('表記ゆれ(カナ/ローマ字)も拾う', () => {
    expect(detectAddressedChara('リンク、どう思う?')).toBe('rinku');
    expect(detectAddressedChara('こんた！')).toBe('konta');
    expect(detectAddressedChara('たぬねえ、教えて')).toBe('tanunee');
    expect(detectAddressedChara('Konta, hello')).toBe('konta');
  });

  it('複数出たら先に呼ばれた方(呼びかけの主語)', () => {
    expect(detectAddressedChara('りんく、たぬ姉はどう思う?')).toBe('rinku');
  });

  it('名指しが無ければ null', () => {
    expect(detectAddressedChara('今日はいい天気ですね')).toBeNull();
    expect(detectAddressedChara('')).toBeNull();
    expect(detectAddressedChara(null)).toBeNull();
  });
});

describe('⑤ シンキング', () => {
  it('考え込む表情(半目中心)で口は閉じたまま', () => {
    for (let e = 0; e < 30000; e += 250) {
      const look = resolveThinkingLook(e);
      expect(look.mouthOpen).toBe(false);
      expect(['half-eyes', 'normal']).toContain(look.expression);
    }
  });

  it('首をゆっくり傾ける(考えている動き)', () => {
    const tilts = [0, 600, 1200, 1800].map((e) => resolveThinkingTilt(e));
    expect(new Set(tilts.map((t) => t.toFixed(2))).size).toBeGreaterThan(1);
    for (let e = 0; e < 20000; e += 50) {
      expect(Math.abs(resolveThinkingTilt(e))).toBeLessThanOrEqual(THINKING_TILT_MAX_DEG + 0.001);
    }
  });

  it('シンキング中はまばたきで表情が跳ねない', () => {
    // まばたき時刻を含む区間でも blink に化けない。
    for (let t = 0; t < 20000; t += 10) {
      const look = resolveCharaLiveLook({
        charaId: 'rinku',
        mode: 'thinking',
        timeMs: t,
        modeStartedAtMs: 0
      });
      expect(look.expression).not.toBe('blink');
    }
  });
});

describe('⑤ 見た目の解決(画像パスまで)', () => {
  it('konta の normal は単独ファイルへ落ちる(存在しない -normal-mouth- を作らない)', () => {
    const look = resolveCharaLiveLook({
      charaId: 'konta',
      mode: 'idle',
      timeMs: 0,
      modeStartedAtMs: 0
    });
    expect(look.imagePath).not.toContain('kitsune-yukkuri-normal-mouth-');
  });

  it('どのモード・どの時刻でも実在するパターンの画像パスになる', () => {
    const ok = /images\/yukkuri-charactore-english\/(link|konta|tanunee)\/(link|kitsune|tanuki)-yukkuri-(normal|smile|blink|half-eyes)-mouth-(open|closed)\.png$/;
    const kontaNormal = /konta\/kitsune-yukkuri-normal\.png$/;
    for (const mode of ['idle', 'react', 'answer', 'thinking']) {
      for (const id of CHARA_LIVE_IDS) {
        for (let t = 0; t < 30000; t += 97) {
          const look = resolveCharaLiveLook({
            charaId: id,
            mode,
            timeMs: t,
            modeStartedAtMs: 0
          });
          expect(ok.test(look.imagePath) || kontaNormal.test(look.imagePath)).toBe(true);
        }
      }
    }
  });

  it('返事/相槌は笑顔で口が動く', () => {
    let opened = false;
    for (let t = 0; t < 2000; t += 20) {
      const look = resolveCharaLiveLook({
        charaId: 'tanunee',
        mode: 'answer',
        timeMs: t,
        modeStartedAtMs: 0
      });
      if (look.mouthOpen) opened = true;
    }
    expect(opened).toBe(true);
  });
});

describe('⑥ 状態遷移', () => {
  it('初期は全員 idle', () => {
    const s = makeInitialCharaLiveState();
    for (const id of CHARA_LIVE_IDS) expect(s.slots[id].mode).toBe('idle');
  });

  it('相槌は 1 体だけが入る', () => {
    const s = makeInitialCharaLiveState();
    const who = triggerCharaReaction(s, { commentKey: 'no:1', text: 'うんうん', nowMs: 1000 });
    expect(who).toBeTruthy();
    const reacting = CHARA_LIVE_IDS.filter((id) => s.slots[id].mode === 'react');
    expect(reacting).toEqual([who]);
  });

  it('相槌は時間で idle に戻る', () => {
    const s = makeInitialCharaLiveState();
    const who = triggerCharaReaction(s, { commentKey: 'no:1', nowMs: 0, durationMs: 1400 });
    expireCharaModes(s, 1399);
    expect(s.slots[who].mode).toBe('react');
    expireCharaModes(s, 1400);
    expect(s.slots[who].mode).toBe('idle');
  });

  it('全員ふさがっていたら無理に喋らせない', () => {
    const s = makeInitialCharaLiveState();
    for (const id of CHARA_LIVE_IDS) s.slots[id].mode = 'answer';
    expect(triggerCharaReaction(s, { commentKey: 'x', nowMs: 0 })).toBeNull();
  });

  it('名指しされた子が答える', () => {
    const s = makeInitialCharaLiveState();
    const who = triggerCharaAnswer(s, {
      prompt: 'たぬ姉さん、これ詳しいよね',
      answer: 'そうタヌ',
      nowMs: 0
    });
    expect(who).toBe('tanunee');
    expect(s.slots.tanunee.mode).toBe('answer');
    expect(s.slots.tanunee.text).toBe('そうタヌ');
  });

  it('名指しが無くても誰かが答える(無反応にしない)', () => {
    const s = makeInitialCharaLiveState();
    const who = triggerCharaAnswer(s, { prompt: 'ねえ、どう思う?', nowMs: 0 });
    expect(CHARA_LIVE_IDS).toContain(who);
    expect(s.slots[who].mode).toBe('answer');
  });

  it('名指しは thinking 中でも上書きする(呼ばれた子が答える)', () => {
    const s = makeInitialCharaLiveState();
    startCharaThinking(s, { nowMs: 0, charaId: 'konta' });
    expect(s.slots.konta.mode).toBe('thinking');
    const who = triggerCharaAnswer(s, { prompt: 'こん太、どう?', nowMs: 10 });
    expect(who).toBe('konta');
    expect(s.slots.konta.mode).toBe('answer');
  });

  it('思考は時間では消えず、明示的な終了で戻る', () => {
    const s = makeInitialCharaLiveState();
    const who = startCharaThinking(s, { nowMs: 0 });
    expect(who).toBe('tanunee'); // 名指し無し=解説役
    expireCharaModes(s, 10 ** 9);
    expect(s.slots[who].mode).toBe('thinking');
    const cleared = endCharaThinking(s, { nowMs: 10 ** 9 });
    expect(cleared).toEqual([who]);
    expect(s.slots[who].mode).toBe('idle');
  });

  it('思考の終了は thinking 以外を壊さない', () => {
    const s = makeInitialCharaLiveState();
    triggerCharaAnswer(s, { prompt: 'りんく、どう?', nowMs: 0 });
    startCharaThinking(s, { nowMs: 0, charaId: 'konta' });
    endCharaThinking(s, { nowMs: 1 });
    expect(s.slots.rinku.mode).toBe('answer');
    expect(s.slots.konta.mode).toBe('idle');
  });

  it('描画モデルは常に 3 体ぶん揃う', () => {
    const s = makeInitialCharaLiveState();
    const model = buildCharaLiveRenderModel(s, { timeMs: 1234, heatLevel: 0.5 });
    expect(model).toHaveLength(3);
    expect(model.map((m) => m.charaId)).toEqual(['rinku', 'konta', 'tanunee']);
    for (const m of model) {
      expect(m.imagePath).toBeTruthy();
      expect(m.displayName).toBeTruthy();
      expect(m.float).toBeTruthy();
    }
  });
});
