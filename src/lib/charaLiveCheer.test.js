/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it } from 'vitest';
import { CHEER_DURATION_MS, startCharaLive } from './charaLiveController.js';
import { CHARA_LIVE_IDS, makeInitialCharaLiveState, triggerCharaAnswer, triggerCharaCheer, triggerCharaReaction } from './charaLiveState.js';
import { charaLiveStageCss } from './charaLiveStage.js';

/**
 * 2026-10-17: 応援コメント100件でゆっくり3人がお祝い(笑顔+口パクで弾み・「100件!」バッジ)。
 *   判定(いつ祝うか)は charaLiveCheerTrigger.js、ここは見せ方(状態・DOM・CSS)。しゃべる設定(talk)とは独立。
 */
function makeHarness(extraDeps = {}) {
  let now = 1000;
  let frames = [];
  const live = startCharaLive({
    doc: document,
    resolveUrl: (p) => `chrome-extension://test/${p}`,
    now: () => now,
    requestFrame: (cb) => { frames.push(() => cb(now)); return frames.length; },
    cancelFrame: () => {},
    reducedMotion: false,
    getHeatLevel: () => 0,
    talk: false,
    ...extraDeps
  });
  return { live, advance(ms) { now += ms; const due = frames; frames = []; for (const f of due) f(); }, at: () => now };
}
const badgeOf = (live) => live.root.querySelector('.nlcl-cheer-badge');

beforeEach(() => { document.body.innerHTML = ''; document.head.innerHTML = ''; });

describe('triggerCharaCheer(状態)', () => {
  it('★3体とも笑顔+口パク(react)に入り、吹き出しの文は空', () => {
    const st = makeInitialCharaLiveState();
    const who = triggerCharaCheer(st, { nowMs: 5000 });
    expect(who).toEqual(CHARA_LIVE_IDS);
    for (const id of CHARA_LIVE_IDS) {
      expect(st.slots[id].mode).toBe('react');
      expect(st.slots[id].text).toBe('');
      expect(st.slots[id].untilMs).toBe(5000 + 2400);
    }
  });
  it('★返事(answer)中・考え込み中の子は潰さない', () => {
    const st = makeInitialCharaLiveState();
    triggerCharaAnswer(st, { prompt: 'りんくさん', nowMs: 100 });
    const answering = CHARA_LIVE_IDS.find((id) => st.slots[id].mode === 'answer');
    const who = triggerCharaCheer(st, { nowMs: 200 });
    expect(who).not.toContain(answering);
    expect(st.slots[answering].mode).toBe('answer');
    expect(who).toHaveLength(2);
  });
  it('相槌(react)中の子は祝いに上書きされる(長さが更新される)', () => {
    const st = makeInitialCharaLiveState();
    triggerCharaReaction(st, { commentKey: 'k', nowMs: 100, durationMs: 1400 });
    expect(triggerCharaCheer(st, { nowMs: 300, durationMs: 2400 })).toHaveLength(3);
  });
});

describe('cheer()(コントローラ)', () => {
  it('★talk:false でも効く・「100件!」のバッジが出て、is-cheering が付く', () => {
    const h = makeHarness({ talk: false });
    expect(h.live.cheer({ milestone: 100 })).toBe(true);
    expect(badgeOf(h.live).hidden).toBe(false);
    expect(badgeOf(h.live).textContent).toBe('100件!');
    expect(h.live.root.classList.contains('is-cheering')).toBe(true);
    h.live.destroy();
  });
  it('★お祝いの長さが過ぎたら、バッジが隠れ is-cheering が外れる(浮遊に戻る)', () => {
    const h = makeHarness();
    h.live.cheer({ milestone: 500 });
    h.advance(CHEER_DURATION_MS - 100);
    expect(h.live.root.classList.contains('is-cheering')).toBe(true);
    h.advance(300);
    expect(h.live.root.classList.contains('is-cheering')).toBe(false);
    expect(badgeOf(h.live).hidden).toBe(true);
    h.live.destroy();
  });
  it('★お祝い中の再入は無視する(キューしない)・終わったあとは次のお祝いができる', () => {
    const h = makeHarness();
    expect(h.live.cheer({ milestone: 100 })).toBe(true);
    h.advance(500);
    expect(h.live.cheer({ milestone: 200 })).toBe(false);
    expect(badgeOf(h.live).textContent).toBe('100件!');
    h.advance(CHEER_DURATION_MS);
    expect(h.live.cheer({ milestone: 1000 })).toBe(true);
    expect(badgeOf(h.live).textContent).toBe('1,000件!');
    h.live.destroy();
  });
  it('不正な節目・非表示・破棄後は何もしない', () => {
    const h = makeHarness();
    expect(h.live.cheer({ milestone: 'x' })).toBe(false);
    expect(h.live.cheer(/** @type {any} */ (null))).toBe(false);
    h.live.setVisible(false);
    expect(h.live.cheer({ milestone: 100 })).toBe(false);
    h.live.setVisible(true);
    h.live.destroy();
    expect(h.live.cheer({ milestone: 100 })).toBe(false);
  });
  it('バッジは textContent だけで作る(innerHTML を使わない=本文の注入が起きない)', () => {
    const h = makeHarness();
    h.live.cheer({ milestone: 100 });
    expect(badgeOf(h.live).children).toHaveLength(0);
    h.live.destroy();
  });
});

describe('お祝いの CSS', () => {
  const css = charaLiveStageCss();
  it('★transform/opacity のみのアニメ・hidden を効かせる・reduced-motion では弾みを止める', () => {
    expect(css).toMatch(/\.nlcl-stage\.is-cheering \.nlcl-chara \{\s*animation: nlcl-cheer 2\.4s/);
    expect(css).toContain('.nlcl-cheer-badge[hidden] { display: none; }');
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.nlcl-stage\.is-cheering \.nlcl-chara \{ animation: none; \}/);
    expect(css).toMatch(/@keyframes nlcl-cheer \{[\s\S]*?transform: scale\(1\.35\)/);
  });
  it('上端配置ではバッジは3人の下・右下配置では上', () => {
    expect(css).toMatch(/\.nlcl-stage\[data-placement="top"\] \.nlcl-cheer-badge \{\s*top: calc\(100% \+ 8px\);\s*bottom: auto;/);
    expect(css).toMatch(/\.nlcl-cheer-badge \{\s*position: absolute;\s*right: 0;\s*bottom: calc\(100% \+ 8px\);/);
  });
});
